-- 059_streak_challenges_heartbeat.sql
-- Adds:
--   1. streak_challenges — definition table for milestone challenges (7/14/30/100 days)
--   2. user_challenge_completions — tracks which challenges a user has earned + XP awarded
--   3. study_pulse_at column on profiles — tracks users currently studying (for active-count)

-- ── Streak challenge definitions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS streak_challenges (
    id              SERIAL PRIMARY KEY,
    key             TEXT NOT NULL UNIQUE,          -- e.g. 'streak_7'
    title           TEXT NOT NULL,                 -- display name
    description     TEXT NOT NULL,
    required_days   INTEGER NOT NULL,              -- streak days required
    bonus_xp        INTEGER NOT NULL DEFAULT 0,    -- XP awarded on completion
    icon            TEXT NOT NULL DEFAULT '🔥',
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed challenge definitions
INSERT INTO streak_challenges (key, title, description, required_days, bonus_xp, icon, sort_order)
VALUES
    ('streak_7',   '7 Kunlik olov',     '7 kun ketma-ket o''qing va maxsus mukofot oling!',         7,   50,  '🔥', 1),
    ('streak_14',  '2 Haftalik jasorat','14 kun uzluksiz o''qish — haqiqiy matonat belgisi!',       14,  120, '⚡', 2),
    ('streak_30',  'Oylik ustoz',       '30 kun ketma-ket! Siz o''rganish ustasisiz.',              30,  300, '🏆', 3),
    ('streak_100', '100 Kunlik afsonaviy', '100 kun davomida o''qish — bu haqiqiy afsonadir!',     100, 1000, '👑', 4)
ON CONFLICT (key) DO NOTHING;

-- ── Per-user challenge completions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_challenge_completions (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    challenge_key   TEXT NOT NULL REFERENCES streak_challenges(key) ON DELETE CASCADE,
    completed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    xp_awarded      INTEGER NOT NULL DEFAULT 0,
    UNIQUE (user_id, challenge_key)               -- each challenge earned once per user
);

CREATE INDEX IF NOT EXISTS ix_user_challenge_user ON user_challenge_completions(user_id);

-- ── study_pulse_at on profiles (for active user count) ────────────────────────
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS study_pulse_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS ix_profiles_study_pulse ON profiles(study_pulse_at)
    WHERE study_pulse_at IS NOT NULL;
