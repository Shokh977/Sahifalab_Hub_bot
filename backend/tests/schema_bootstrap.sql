-- schema_bootstrap.sql — minimal prerequisite schema for running the Tanga/AI
-- test suite (test_tanga_service.py, test_ai_limiter.py) against a throwaway
-- Postgres instance.
--
-- WHY THIS FILE EXISTS: profiles, focus_sessions, xp_logs, and most other
-- core tables predate this repo's migrations/*.sql set — they were created
-- directly in the Supabase console (confirmed: no CREATE TABLE for them
-- anywhere in migrations/003..089). The numbered migrations are therefore
-- NOT replayable from a blank database; they assume these tables already
-- exist. This file is a deliberately MINIMAL stand-in (only the columns the
-- Tanga/AI code path touches), not a full production schema snapshot.
-- Real migrations 088_tanga_currency.sql and 089_ai_infrastructure.sql are
-- applied UNCHANGED on top of this — this file only supplies what they
-- assume already exists.

CREATE TABLE profiles (
    telegram_id                 BIGINT PRIMARY KEY,
    total_xp                    INTEGER DEFAULT 0,
    level                       INTEGER DEFAULT 1,
    freeze_count                INTEGER DEFAULT 0 NOT NULL,
    freeze_used_dates           DATE[] DEFAULT '{}' NOT NULL,
    last_freeze_milestone_days  INTEGER DEFAULT 0 NOT NULL,
    study_pulse_at              TIMESTAMPTZ,
    streak_days                 INTEGER DEFAULT 0,
    streak_last_date            DATE,
    daily_goal_minutes          INTEGER DEFAULT 20,
    total_focus_minutes         INTEGER DEFAULT 0,
    timezone                    TEXT DEFAULT 'Asia/Tashkent' NOT NULL,
    status                      TEXT DEFAULT 'active',
    first_name                  TEXT,
    username                    TEXT,
    photo_url                   TEXT,
    user_settings               JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE focus_sessions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    minutes       INTEGER NOT NULL,
    xp_awarded    INTEGER DEFAULT 0,
    session_date  DATE NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- record_study_activity()'s stage-milestone check (step_service.py) queries
-- these unconditionally, outside any try/except in the calling code — they
-- must exist even with zero rows, or every record_study_activity() call
-- (used by the transaction-boundary test) throws before it can commit.
CREATE TABLE streak_stages (
    key            TEXT PRIMARY KEY,
    stage_number   INTEGER NOT NULL,
    title          TEXT,
    description    TEXT,
    required_days  INTEGER NOT NULL,
    bonus_xp       INTEGER DEFAULT 0,
    bonus_tanga    INTEGER NOT NULL DEFAULT 0,
    icon           TEXT,
    is_active      BOOLEAN DEFAULT TRUE,
    sort_order     INTEGER DEFAULT 0
);

CREATE TABLE user_stage_completions (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    stage_key     TEXT NOT NULL,
    xp_awarded    INTEGER DEFAULT 0,
    tanga_awarded INTEGER NOT NULL DEFAULT 0,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- stage_service.py's check_and_award_stages() also grants the matching
-- achievement badge in the same call — was previously only ever exercised
-- indirectly through record_study_activity()'s try/except (which swallows a
-- missing-table error as "best-effort"), so this gap was invisible until a
-- test called check_and_award_stages() directly.
CREATE TABLE user_badges (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    badge_key    TEXT NOT NULL,
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, badge_key)
);

CREATE TABLE flashcard_reviews (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL,
    card_id       BIGINT,
    deck_id       BIGINT,
    rating        INTEGER NOT NULL,
    reviewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    time_spent_ms INTEGER
);

-- Real schema is migrations/034_analytics_events.sql — that file's own
-- helper FUNCTIONS reference other tables (posts, course_enrollments) this
-- minimal test schema doesn't have, and Postgres validates a LANGUAGE sql
-- function body's relations at CREATE time, not just at call time. This
-- stand-in supplies only the bare table admin_payment_methods.py's
-- donation-stats endpoint actually reads.
CREATE TABLE analytics_events (
    id            BIGSERIAL PRIMARY KEY,
    event_type    TEXT        NOT NULL,
    actor_id      BIGINT      NOT NULL DEFAULT 0,
    target_id     BIGINT      NOT NULL,
    teacher_id    BIGINT      NOT NULL DEFAULT 0,
    source        TEXT        NOT NULL DEFAULT 'direct',
    meta          JSONB       NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Minimal add_xp() RPC stand-in — real function lives in migration
-- 038_xp_gamification.sql and is considerably richer (QUIZ daily cap,
-- COURSE dedup, row locking). This stub only supports what
-- grant_tanga_for_xp()'s tests need: an (new_xp, new_level, xp_added) shape.
CREATE OR REPLACE FUNCTION add_xp(p_user_id BIGINT, p_source TEXT, p_amount INTEGER, p_reference_id BIGINT)
RETURNS TABLE(new_xp INTEGER, new_level INTEGER, xp_added INTEGER) AS $$
BEGIN
    UPDATE profiles SET total_xp = total_xp + p_amount WHERE telegram_id = p_user_id;
    RETURN QUERY SELECT p.total_xp, p.level, p_amount FROM profiles p WHERE p.telegram_id = p_user_id;
END;
$$ LANGUAGE plpgsql;
