-- Migration 020: Create user_quiz_completion table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor
--
-- This table tracks which quizzes each user has completed in order to:
--   1. Prevent XP farming from retakes (XP awarded only on first passing attempt)
--   2. Show users their history (already_passed flag)
--
-- Safe to run multiple times — all statements use IF NOT EXISTS.

-- ── Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_quiz_completion (
    id              SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES "user"(id) ON DELETE SET NULL,
    quiz_id         INTEGER NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
    telegram_id     BIGINT  NOT NULL,
    score           INTEGER NOT NULL,
    total           INTEGER NOT NULL,
    percentage      FLOAT   NOT NULL,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_user_quiz_completion UNIQUE (telegram_id, quiz_id)
);

-- ── Indexes ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS ix_user_quiz_completion_user_id
    ON user_quiz_completion (user_id);

CREATE INDEX IF NOT EXISTS ix_user_quiz_completion_quiz_id
    ON user_quiz_completion (quiz_id);

CREATE INDEX IF NOT EXISTS ix_user_quiz_completion_telegram_id
    ON user_quiz_completion (telegram_id);

-- ── RLS (optional but recommended) ────────────────────────────────────────────
-- Allow the service role (backend) full access; anon can only read their own rows.
ALTER TABLE user_quiz_completion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access" ON user_quiz_completion;
CREATE POLICY "service_full_access"
    ON user_quiz_completion
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Verify
SELECT 'Migration 020 complete — user_quiz_completion table ready.' AS status;
