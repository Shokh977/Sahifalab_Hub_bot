-- Migration 055: Comment threading (parent_id) + comment likes
-- Safe to run multiple times (IF NOT EXISTS / IF column does not exist guards).
-- Run in Supabase SQL Editor.

-- ── 1. Add parent_id to post_comments ────────────────────────────────────────
ALTER TABLE post_comments
    ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES post_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_post_comments_parent ON post_comments (parent_id)
    WHERE parent_id IS NOT NULL;

-- ── 2. Add likes_count counter to post_comments ───────────────────────────────
ALTER TABLE post_comments
    ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

-- ── 3. comment_likes join table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comment_likes (
    id         SERIAL       PRIMARY KEY,
    comment_id INTEGER      NOT NULL REFERENCES post_comments(id) ON DELETE CASCADE,
    user_id    BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_comment_like UNIQUE (comment_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_comment_likes_comment ON comment_likes (comment_id);
CREATE INDEX IF NOT EXISTS ix_comment_likes_user    ON comment_likes (user_id);

-- ── 4. Trigger: keep post_comments.likes_count in sync ───────────────────────
CREATE OR REPLACE FUNCTION sync_comment_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE post_comments SET likes_count = likes_count + 1 WHERE id = NEW.comment_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE post_comments SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.comment_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_likes_count ON comment_likes;
CREATE TRIGGER trg_comment_likes_count
AFTER INSERT OR DELETE ON comment_likes
FOR EACH ROW EXECUTE FUNCTION sync_comment_likes_count();
