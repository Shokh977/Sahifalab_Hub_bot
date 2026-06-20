-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 047: Post types, saves, and poll votes
-- Safe to run multiple times (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend posts table ────────────────────────────────────────────────────
ALTER TABLE public.posts
    ADD COLUMN IF NOT EXISTS post_type     TEXT NOT NULL DEFAULT 'text',
    ADD COLUMN IF NOT EXISTS post_metadata JSONB,
    ADD COLUMN IF NOT EXISTS saves_count   INTEGER NOT NULL DEFAULT 0;

-- Add CHECK only if it doesn't exist (PG doesn't support IF NOT EXISTS on CHECK)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.constraint_column_usage
        WHERE table_name = 'posts' AND constraint_name = 'chk_post_type'
    ) THEN
        ALTER TABLE public.posts
            ADD CONSTRAINT chk_post_type
            CHECK (post_type IN ('text','course_announcement','achievement','poll'));
    END IF;
END $$;

-- ── 2. Post saves table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_saves (
    id         BIGSERIAL    PRIMARY KEY,
    post_id    INTEGER      NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id    BIGINT       NOT NULL REFERENCES public.profiles(telegram_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_post_save UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_post_saves_post ON public.post_saves(post_id);
CREATE INDEX IF NOT EXISTS ix_post_saves_user ON public.post_saves(user_id);

-- ── 3. Trigger: sync saves_count on posts ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_post_saves_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.posts SET saves_count = saves_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.posts SET saves_count = GREATEST(0, saves_count - 1) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_post_saves_count ON public.post_saves;
CREATE TRIGGER trg_sync_post_saves_count
    AFTER INSERT OR DELETE ON public.post_saves
    FOR EACH ROW EXECUTE FUNCTION public.sync_post_saves_count();

-- ── 4. Poll votes table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.poll_votes (
    id         BIGSERIAL    PRIMARY KEY,
    post_id    INTEGER      NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id    BIGINT       NOT NULL REFERENCES public.profiles(telegram_id) ON DELETE CASCADE,
    option_idx SMALLINT     NOT NULL CHECK (option_idx BETWEEN 0 AND 3),
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_poll_vote UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_poll_votes_post ON public.poll_votes(post_id);

-- ── 5. RLS policies ──────────────────────────────────────────────────────────
ALTER TABLE public.post_saves  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_post_saves"  ON public.post_saves;
DROP POLICY IF EXISTS "service_role_poll_votes"  ON public.poll_votes;
DROP POLICY IF EXISTS "anon_read_post_saves"     ON public.post_saves;

CREATE POLICY "service_role_post_saves"  ON public.post_saves  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_poll_votes"  ON public.poll_votes  TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_post_saves"     ON public.post_saves  FOR SELECT TO anon USING (true);

-- ── 6. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_posts_post_type ON public.posts(post_type);

SELECT 'Migration 047 complete — post types, saves, and poll votes added.' AS status;
