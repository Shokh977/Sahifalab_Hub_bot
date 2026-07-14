-- 078_challenge_types_teams.sql — step-25: challenge metrics, goal types, team battles
--
-- Safety: all existing challenges get challenge_type='cumulative' (the
-- column default), which is their exact current behavior — target_value
-- stays NOT NULL-equivalent for them (never actually dropped to NULL for
-- existing rows), no existing challenge_participants row or completion is
-- touched.

-- ── Type ────────────────────────────────────────────────────────────────────
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS challenge_type VARCHAR(20) NOT NULL DEFAULT 'cumulative';
-- 'cumulative' | 'consistency' | 'sprint' | 'team'

-- target_value is required for cumulative, NULL for sprint/team, unused for consistency.
ALTER TABLE challenges ALTER COLUMN target_value DROP NOT NULL;

-- ── Consistency fields ────────────────────────────────────────────────────────
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS daily_minimum  INTEGER;            -- units of metric, per day
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS required_days  INTEGER;            -- consecutive qualifying days
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS allowed_misses INTEGER DEFAULT 0;  -- grace days (0 = strict)

-- ── Sprint fields ─────────────────────────────────────────────────────────────
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS winner_count INTEGER;              -- top N rewarded

-- ── Team fields ───────────────────────────────────────────────────────────────
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS team_a_name  VARCHAR(60);
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS team_a_color VARCHAR(7);
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS team_a_icon  VARCHAR(30);
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS team_b_name  VARCHAR(60);
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS team_b_color VARCHAR(7);
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS team_b_icon  VARCHAR(30);

-- ── Participants ──────────────────────────────────────────────────────────────
ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS team CHAR(1);  -- 'A' | 'B' | NULL

-- consistency tracking
ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS qualifying_days INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS current_run     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS misses_used     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS failed_at       TIMESTAMPTZ;

-- sprint/team results
ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS final_rank INTEGER;
ALTER TABLE challenge_participants ADD COLUMN IF NOT EXISTS is_winner  BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Per-day progress (consistency evaluation + free per-day charts) ──────────
CREATE TABLE IF NOT EXISTS challenge_daily_progress (
    challenge_id  UUID    NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id       BIGINT  NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    day           DATE    NOT NULL,
    value         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (challenge_id, user_id, day)
);

CREATE INDEX IF NOT EXISTS challenge_daily_progress_user_idx ON challenge_daily_progress(user_id);
