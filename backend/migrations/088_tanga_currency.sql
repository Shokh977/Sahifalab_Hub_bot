-- 088_tanga_currency.sql
-- Splits profiles.total_xp (score + spendable balance) into two counters:
--   total_xp       — lifetime score for levels/leaderboards. After
--                    TANGA_MIRROR_MODE flips to 'B' it never decreases again.
--   tanga_balance  — spendable wallet (freezes, AI features, future
--                    purchases). Backfilled from today's total_xp so nobody
--                    loses anything; every user's current number becomes both
--                    their score and their opening wallet.
--
-- tanga_transactions is the ledger — every spend_tanga()/grant_tanga() call
-- writes exactly one row here in the same transaction as the balance UPDATE.
-- Non-negotiable per spec: needed for support ("my tanga disappeared"),
-- debugging, and before any real money touches the system.
--
-- `reason` is intentionally plain TEXT, NOT a CHECK-constrained enum. This
-- codebase already has a documented, repeated incident from exactly that
-- pattern on xp_logs.source (migrations 070/074 — a value used in code but
-- missing from the CHECK constraint made add_xp() fail at INSERT time,
-- silently for WELCOME/DECK_MILESTONE until someone noticed). Valid reason
-- values are enumerated in app/services/tanga_service.py instead, where
-- adding one is a code review, not a migration.
--
-- app_config is a generic key/value table so TANGA_MIRROR_MODE and the AI
-- dual-gate limits/prices are changeable without a Railway redeploy — no
-- such mechanism existed in this codebase before (every existing toggle,
-- e.g. CRON_SECRET, is an env var requiring a deploy to change).

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS tanga_balance INTEGER NOT NULL DEFAULT 0 CHECK (tanga_balance >= 0);

UPDATE profiles SET tanga_balance = COALESCE(total_xp, 0) WHERE tanga_balance = 0;

CREATE TABLE IF NOT EXISTS tanga_transactions (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    delta            INTEGER NOT NULL,
    balance_after    INTEGER NOT NULL,
    reason           TEXT NOT NULL,
    reference_type   TEXT,
    -- TEXT, not BIGINT: reference_id points at different ID spaces depending
    -- on reference_type — focus_sessions.id/flashcard_decks.id are BIGINT,
    -- but challenges.id is a UUID (074_challenges_schema.sql). Not a real FK
    -- (no single target table), so TEXT keeps it simple and correct for both.
    reference_id     TEXT,
    idempotency_key  TEXT UNIQUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tanga_transactions_user_created
    ON tanga_transactions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS app_config (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    description TEXT,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  BIGINT REFERENCES profiles(telegram_id)
);

INSERT INTO app_config (key, value, description) VALUES
    ('tanga_mirror_mode', '"A"'::jsonb,
     'Phase A: spend_tanga also mirrors a decrement to total_xp so the old '
     'Play Store client (which reads total_xp as the spendable balance) '
     'keeps working unchanged. Phase B: flip to "B" once the new client has '
     'meaningful adoption — total_xp stops decrementing and becomes a pure '
     'lifetime score from that point forward. See app/services/tanga_service.py.'),
    ('ai_dual_gate', '{
        "free_daily_allowance": 3,
        "hard_daily_cap": 20,
        "global_daily_ceiling_tanga": 200000,
        "prices": {
            "explanation": 10,
            "flashcard_gen": 25,
            "tutor_session": 10
        }
    }'::jsonb,
     'Dual-gate AI access control. Prices set from the real total_xp '
     'distribution (median active 217 XP / 6.8 study-days, p90 3,077 XP / '
     '96 study-days; 1 study-day = 32 XP). flashcard_gen=25 (~16min focus '
     'equivalent), explanation/tutor_session=10 (~6min). Real API cost is '
     '~0.5c/flashcard-image and <0.2c/explanation, so at this population '
     'size Tanga pricing is a behaviour lever, not cost recovery — '
     'hard_daily_cap is the actual budget control. `prices` keys MUST match '
     'the `feature` string passed to app.services.ai.limiter.check_and_charge() '
     '— i.e. "flashcard_gen"/"explanation"/"tutor_session", NOT the '
     '"ai_"-prefixed tanga_transactions.reason strings; a prior version of '
     'this seed used the reason-string keys by mistake, which would have '
     'made every priced AI action resolve to a silent 0-cost lookup. '
     'free_daily_allowance/hard_daily_cap are per-user per-day; '
     'global_daily_ceiling_tanga is a spend-wide circuit breaker.')
ON CONFLICT (key) DO NOTHING;
