-- Migration 032: X.com-style engagement counters + reposts join table
-- Adds views_count, reposts_count, shares_count to posts.
-- Creates reposts join table for the repost feature.
-- Creates increment_post_views() function for safe atomic increments.

-- ── 1. Engagement counters on posts ──────────────────────────────────────────
ALTER TABLE posts ADD COLUMN IF NOT EXISTS views_count    INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS reposts_count  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS shares_count   INTEGER NOT NULL DEFAULT 0;

-- ── 2. Reposts join table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reposts (
    id               SERIAL PRIMARY KEY,
    user_id          BIGINT  NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    original_post_id INTEGER NOT NULL REFERENCES posts(id)             ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, original_post_id)
);

CREATE INDEX IF NOT EXISTS ix_reposts_user ON reposts(user_id);
CREATE INDEX IF NOT EXISTS ix_reposts_post ON reposts(original_post_id);

-- ── 3. Atomic view increment function ────────────────────────────────────────
-- Called via raw SQL from the backend; avoids read-modify-write races.
CREATE OR REPLACE FUNCTION increment_post_views(p_post_id INTEGER)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    UPDATE posts SET views_count = views_count + 1 WHERE id = p_post_id;
END;
$$;
