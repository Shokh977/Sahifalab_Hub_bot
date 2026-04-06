-- Migration 030: Social Learning Ecosystem
-- Run in Supabase SQL Editor. Safe to run multiple times (IF NOT EXISTS).
-- Creates: posts, post_likes, post_comments, follows, conversations, direct_messages
-- Adds follower/following counts to profiles + sync triggers.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Add social columns to profiles
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS followers_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS following_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio              TEXT;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Posts
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS posts (
    id              SERIAL       PRIMARY KEY,
    author_id       BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    content         TEXT         NOT NULL DEFAULT '',
    image_url       TEXT,
    likes_count     INTEGER      NOT NULL DEFAULT 0,
    comments_count  INTEGER      NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_posts_author   ON posts (author_id);
CREATE INDEX IF NOT EXISTS ix_posts_created  ON posts (created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Post Likes
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_likes (
    id          SERIAL       PRIMARY KEY,
    post_id     INTEGER      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id     BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_post_like UNIQUE (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_post_likes_post ON post_likes (post_id);
CREATE INDEX IF NOT EXISTS ix_post_likes_user ON post_likes (user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Post Comments
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS post_comments (
    id          SERIAL       PRIMARY KEY,
    post_id     INTEGER      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author_id   BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    content     TEXT         NOT NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_post_comments_post ON post_comments (post_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. Follows (unidirectional)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS follows (
    id            SERIAL       PRIMARY KEY,
    follower_id   BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    following_id  BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_follow         UNIQUE (follower_id, following_id),
    CONSTRAINT chk_no_self_follow CHECK  (follower_id != following_id)
);
CREATE INDEX IF NOT EXISTS ix_follows_follower  ON follows (follower_id);
CREATE INDEX IF NOT EXISTS ix_follows_following ON follows (following_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. Conversations (DM pairs)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS conversations (
    id              SERIAL       PRIMARY KEY,
    participant_a   BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    participant_b   BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_conversation       UNIQUE (participant_a, participant_b),
    CONSTRAINT chk_participant_order  CHECK  (participant_a < participant_b)
);
CREATE INDEX IF NOT EXISTS ix_conv_a ON conversations (participant_a);
CREATE INDEX IF NOT EXISTS ix_conv_b ON conversations (participant_b);

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. Direct Messages (text + links only, NO media)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS direct_messages (
    id               SERIAL       PRIMARY KEY,
    conversation_id  INTEGER      NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id        BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    content          TEXT         NOT NULL,
    is_read          BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_dm_conv    ON direct_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS ix_dm_sender  ON direct_messages (sender_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. Triggers — Follower count sync
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_follower_counts() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE profiles SET followers_count = followers_count + 1 WHERE telegram_id = NEW.following_id;
        UPDATE profiles SET following_count = following_count + 1 WHERE telegram_id = NEW.follower_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE profiles SET followers_count = GREATEST(followers_count - 1, 0) WHERE telegram_id = OLD.following_id;
        UPDATE profiles SET following_count = GREATEST(following_count - 1, 0) WHERE telegram_id = OLD.follower_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_follower_counts ON follows;
CREATE TRIGGER trg_sync_follower_counts
    AFTER INSERT OR DELETE ON follows
    FOR EACH ROW EXECUTE FUNCTION sync_follower_counts();

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. Triggers — Post likes count sync
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_post_likes_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_post_likes ON post_likes;
CREATE TRIGGER trg_sync_post_likes
    AFTER INSERT OR DELETE ON post_likes
    FOR EACH ROW EXECUTE FUNCTION sync_post_likes_count();

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. Triggers — Post comments count sync
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION sync_post_comments_count() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_post_comments ON post_comments;
CREATE TRIGGER trg_sync_post_comments
    AFTER INSERT OR DELETE ON post_comments
    FOR EACH ROW EXECUTE FUNCTION sync_post_comments_count();

-- ══════════════════════════════════════════════════════════════════════════════
-- 11. Triggers — Conversation last_message_at update
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_conversation_last_message() RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_conv_last_msg ON direct_messages;
CREATE TRIGGER trg_update_conv_last_msg
    AFTER INSERT ON direct_messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();

-- ══════════════════════════════════════════════════════════════════════════════
-- 12. RLS Policies
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE posts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_likes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_comments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Service role full access on all tables
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['posts','post_likes','post_comments','follows','conversations','direct_messages']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "service_full_%s" ON %I', t, t);
        EXECUTE format(
            'CREATE POLICY "service_full_%s" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)',
            t, t
        );
    END LOOP;
END;
$$;

-- Public read for posts (anyone can view)
DROP POLICY IF EXISTS "anon_read_posts" ON posts;
CREATE POLICY "anon_read_posts" ON posts FOR SELECT TO anon USING (true);

-- DMs only visible to participants (via conversation)
DROP POLICY IF EXISTS "dm_participant_select" ON direct_messages;
CREATE POLICY "dm_participant_select" ON direct_messages
    FOR SELECT TO anon
    USING (
        EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = direct_messages.conversation_id
              AND (c.participant_a = sender_id OR c.participant_b = sender_id)
        )
    );

-- ══════════════════════════════════════════════════════════════════════════════
-- 13. Enable Realtime for direct_messages (for Slooth Messenger)
-- ══════════════════════════════════════════════════════════════════════════════
-- Supabase Realtime: add table to publication
DO $$
BEGIN
    -- Add to supabase_realtime publication if not already there
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'direct_messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
    END IF;
END;
$$;

SELECT 'Migration 030 complete — Social ecosystem tables ready.' AS status;
