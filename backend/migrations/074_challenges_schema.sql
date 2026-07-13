-- 074_challenges_schema.sql
-- step-21: Musobaqalar (cohort focus challenges).
--
-- Two new tables (challenges, challenge_participants) + widens the xp_logs
-- source constraint to include 'CHALLENGE' (step-20's rule: any new XP
-- source must be added to the constraint in the same migration/PR that
-- introduces it).
--
-- Product rules encoded here (see step-21 spec):
--   - No entry fee anywhere in this schema — joining only ever INSERTs a
--     challenge_participants row, never touches total_xp.
--   - challenge_participants has no FK/trigger/column that writes to
--     profiles.streak_days or streak_stages/user_stage_completions. That
--     separation is enforced in application code (challenge_service.py),
--     not by the schema, but the schema doesn't provide any path for it.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS challenges (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                VARCHAR(60) UNIQUE NOT NULL,        -- "20-soat-fokus-iyul"
    title               VARCHAR(120) NOT NULL,              -- "20 Soat Fokus Marafoni"
    description         TEXT,

    -- What is measured. Only 'focus_minutes' is implemented now;
    -- the enum exists so future challenges (cards, lessons) need no migration.
    metric              VARCHAR(30) NOT NULL DEFAULT 'focus_minutes',
                        -- 'focus_minutes' | 'flashcard_reviews' | 'lessons_completed'
    target_value        INTEGER NOT NULL,                   -- e.g. 1200 (minutes = 20h)

    starts_at           TIMESTAMPTZ NOT NULL,
    ends_at             TIMESTAMPTZ NOT NULL,
    join_deadline       TIMESTAMPTZ,                        -- NULL = joinable until ends_at

    is_official         BOOLEAN NOT NULL DEFAULT TRUE,      -- Sahifalab-created
    created_by          BIGINT REFERENCES profiles(telegram_id),  -- NULL for official
    is_private          BOOLEAN NOT NULL DEFAULT FALSE,     -- schema-ready, NOT implemented (Phase 6)
    max_participants    INTEGER,                            -- NULL = unlimited

    reward_xp           INTEGER NOT NULL DEFAULT 0,
    badge_key           VARCHAR(60),                        -- granted in user_badges on completion

    -- Presentation
    color               VARCHAR(7) DEFAULT '#F5A623',
    icon                VARCHAR(40) DEFAULT 'timer',
    is_featured         BOOLEAN NOT NULL DEFAULT FALSE,

    status              VARCHAR(20) NOT NULL DEFAULT 'upcoming',
                        -- 'upcoming' | 'active' | 'ended' | 'cancelled'

    participant_count   INTEGER NOT NULL DEFAULT 0,         -- denormalized, for fast reads
    completion_count    INTEGER NOT NULL DEFAULT 0,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (ends_at > starts_at),
    CHECK (target_value > 0)
);

CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status, starts_at DESC);

CREATE TABLE IF NOT EXISTS challenge_participants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id    UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,

    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    progress_value  INTEGER NOT NULL DEFAULT 0,             -- minutes accumulated
    completed_at    TIMESTAMPTZ,                            -- when target was reached
    xp_awarded      INTEGER,                                -- what they actually got

    -- One-shot dedup flags for the cron-driven notification cadence (Phase 5).
    -- Without these, an hourly cron tick would re-fire the same nudge every
    -- hour for as long as a participant remains inside that notification's
    -- qualifying window.
    start_notified          BOOLEAN NOT NULL DEFAULT FALSE,
    midpoint_notified       BOOLEAN NOT NULL DEFAULT FALSE,
    final_stretch_notified  BOOLEAN NOT NULL DEFAULT FALSE,
    end_notified            BOOLEAN NOT NULL DEFAULT FALSE,

    UNIQUE (challenge_id, user_id)                          -- one join per user; dedup guard
);

CREATE INDEX IF NOT EXISTS idx_cp_leaderboard ON challenge_participants(challenge_id, progress_value DESC);
CREATE INDEX IF NOT EXISTS idx_cp_user ON challenge_participants(user_id);

-- Admin audit trail, matching the existing per-domain pattern
-- (deck_audit_log, enrollment_audit_log, quiz_audit_log, ...).
CREATE TABLE IF NOT EXISTS challenge_audit_log (
    id                BIGSERIAL PRIMARY KEY,
    challenge_id      VARCHAR(36),
    action            VARCHAR(50) NOT NULL,
    admin_telegram_id BIGINT,
    details           JSONB,
    created_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_challenge_audit_challenge ON challenge_audit_log(challenge_id);

-- ── Widen xp_logs to accept the new CHALLENGE source (step-20's rule) ──────
ALTER TABLE xp_logs DROP CONSTRAINT IF EXISTS xp_logs_source_check;
ALTER TABLE xp_logs ADD CONSTRAINT xp_logs_source_check
    CHECK (source IN (
        'DEEP_WORK', 'QUIZ', 'COURSE', 'WELCOME', 'DECK_MILESTONE', 'STREAK_STAGE',
        'CHALLENGE'  -- cohort challenge completion bonus (step-21)
    ));

COMMIT;

-- ── Post-migration sanity check ─────────────────────────────────────────────
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'xp_logs_source_check';
