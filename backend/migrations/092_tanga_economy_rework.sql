-- 092_tanga_economy_rework.sql
-- Reworks Tanga from "1:1 XP mirror" (effectively unlimited, ~500/day for a
-- heavy user) into a scarce, achievement-based currency (~35/day ceiling +
-- flat one-off milestones). See tanga-economy-rework-spec.md for the full
-- brief and the accompanying report for what changed vs. what the spec
-- assumed. MUST run before this rework's client build reaches any real user
-- — Part 2's opening-balance reset is only safe because "Tanga has never
-- shipped, no user has ever seen a balance" (spec PREREQUISITE).
--
-- ── 1. Ledger extensions (Part 5 + Part 1 cap enforcement) ──────────────────
-- celebrate/notified_at: reward-modal queue (Part 5) — GET /api/rewards/pending
-- selects celebrate=TRUE AND notified_at IS NULL; POST /acknowledge sets
-- notified_at. Only earn events set celebrate=true; spends never do (enforced
-- in code, tanga_service.py's _write_ledger default is celebrate=false).
--
-- earn_date: NOT derived from created_at (a TIMESTAMPTZ) because "today" for
-- cap purposes must match the user's LOCAL calendar day, not a UTC slice of
-- it — the same reasoning behind focus_sessions.session_date and
-- focus_credit_ledger.credit_day elsewhere in this codebase. Only set on the
-- 4 daily-capped earning reasons (daily_goal_met/threshold_60min/
-- threshold_120min/daily_quiz); NULL for everything else (milestones,
-- spends, refunds — nothing else is subject to the daily cap).

ALTER TABLE tanga_transactions
    ADD COLUMN IF NOT EXISTS celebrate   BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS earn_date   DATE NULL;

CREATE INDEX IF NOT EXISTS idx_tanga_transactions_pending_rewards
    ON tanga_transactions (user_id, created_at)
    WHERE celebrate = TRUE AND notified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tanga_transactions_daily_cap
    ON tanga_transactions (user_id, earn_date)
    WHERE earn_date IS NOT NULL;


-- ── 2. Streak-stage milestones: XP → Tanga (Part 1) ─────────────────────────
-- bonus_tanga is a NEW column, additive to the existing bonus_xp (left
-- UNCHANGED — historical record of what each stage used to be worth, still
-- referenced by old xp_logs/user_stage_completions rows). app/services/
-- stage_service.py now grants bonus_tanga instead of calling add_xp() for any
-- stage where bonus_tanga > 0.
--
-- stage_1 (required_days=1) is deliberately left at bonus_tanga=0 and keeps
-- granting its original 10 XP, unconverted — the spec's milestone table
-- starts at 3 days and has no entry for day 1. See the accompanying report,
-- "streak milestones" deviation.
ALTER TABLE streak_stages           ADD COLUMN IF NOT EXISTS bonus_tanga   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_stage_completions  ADD COLUMN IF NOT EXISTS tanga_awarded INTEGER NOT NULL DEFAULT 0;

UPDATE streak_stages SET bonus_tanga = 15   WHERE key = 'stage_2';    -- 3 days
UPDATE streak_stages SET bonus_tanga = 30   WHERE key = 'streak_7';   -- 7 days
UPDATE streak_stages SET bonus_tanga = 50   WHERE key = 'streak_14';  -- 14 days
UPDATE streak_stages SET bonus_tanga = 100  WHERE key = 'streak_30';  -- 30 days
UPDATE streak_stages SET bonus_tanga = 150  WHERE key = 'stage_6';    -- 50 days
UPDATE streak_stages SET bonus_tanga = 250  WHERE key = 'stage_7';    -- 75 days
UPDATE streak_stages SET bonus_tanga = 400  WHERE key = 'stage_8';    -- 120 days
UPDATE streak_stages SET bonus_tanga = 600  WHERE key = 'stage_9';    -- 200 days
UPDATE streak_stages SET bonus_tanga = 1500 WHERE key = 'stage_10';   -- 365 days


-- ── 3. app_config: new tunable economy values (Part 1 + Part 4) ────────────
INSERT INTO app_config (key, value, description) VALUES
    ('tanga_earning', '{
        "daily_goal_met": 10,
        "threshold_60min": 5,
        "threshold_120min": 5,
        "daily_cap": 35,
        "daily_quiz_played": 5,
        "daily_quiz_per_correct": 1,
        "daily_quiz_perfect_bonus": 3,
        "daily_quiz_max": 13,
        "challenge_complete": 100,
        "competition_win": 200,
        "opening_balance": 100
    }'::jsonb,
     'Tanga earning amounts (tanga-economy-rework spec Part 1). '
     'daily_goal_met/threshold_60min/threshold_120min/daily_quiz_* all count '
     'toward daily_cap — enforced server-side at grant time in '
     'tanga_service.remaining_daily_cap()/daily_capped_grant(), keyed on '
     'tanga_transactions.earn_date (the user''s LOCAL day, not created_at). '
     'challenge_complete/competition_win/opening_balance are flat, one-off, '
     'exempt from the cap. competition_win has no wired call site yet — the '
     '"Bellashuv" sprint/team win path is out of scope for this rework (see '
     'spec OUT OF SCOPE); reserved here so it does not need a second '
     'migration when that lands. daily_quiz_* mirror daily_quiz_service.py''s '
     'PLAYED_REWARD/PER_CORRECT_REWARD/PERFECT_BONUS/MAX_DAILY_REWARD, which '
     'now read from here instead of their old hardcoded module constants.'),
    ('tanga_freeze_packages_v2', '{"1": 100, "3": 250, "5": 375}'::jsonb,
     'New-client freeze prices (Tanga), tanga-economy-rework Part 4. Halved '
     'from the legacy total_xp prices (200/500/750 — see streaks.py '
     '_FREEZE_PACKAGES) so the 3-for/5-for discount ratio is unchanged. The '
     'legacy prices are intentionally NOT config — Part 6 requires the old '
     'Play Store client''s behaviour stay frozen in code, never migrated to a '
     'tunable, so it can never accidentally drift out from under that build.'),
    ('tanga_min_client_version', '"1.2.0"'::jsonb,
     'Version gate (tanga-economy-rework Part 6), replaces tanga_mirror_mode. '
     'A request whose X-Client-Version header parses to >= this value is the '
     'new Tanga-aware client (freeze at tanga_freeze_packages_v2 prices, '
     'spends from tanga_balance only, sees reward modals). A missing or lower '
     'header is treated as the pre-Tanga Play Store build still in the wild — '
     'routed to the untouched legacy total_xp path. See '
     'app/services/client_version.py.')
ON CONFLICT (key) DO NOTHING;

-- Mirror mode is retired in favour of the version gate above: streaks.py's
-- purchase_freeze() now branches explicitly on client version instead of
-- relying on this flag, and no other spend_tanga() caller (AI features) ever
-- existed on the old client for it to matter to. Flipping to "B" makes
-- spend_tanga()'s mirror branch a permanent no-op — the documented Phase-B
-- end state in tanga_service.py's own module docstring.
UPDATE app_config SET value = '"B"'::jsonb, updated_at = NOW()
WHERE key = 'tanga_mirror_mode' AND value = '"A"'::jsonb;


-- ── 4. Opening balance reset (Part 2) ───────────────────────────────────────
-- Migration 088's `tanga_balance = total_xp` backfill is being overwritten
-- outright — safe ONLY because no client has ever read/displayed
-- tanga_balance yet (spec PREREQUISITE). Every user starts fresh at a flat
-- 100, recorded as a real ledger grant (not a bare column UPDATE) so it
-- survives an audit and — celebrate=TRUE — surfaces as this user's first-ever
-- reward modal the first time they open the new build ("100 Tanga tayyor!").
-- total_xp is untouched: nobody's score/level/leaderboard standing changes.
--
-- Guarded by NOT EXISTS + ON CONFLICT DO NOTHING so this file is safe to
-- run more than once (matches every other migration's idempotent-by-
-- construction style in this repo) without re-crediting a user who already
-- got their opening grant, even if real Tanga activity happened in between.
UPDATE profiles SET tanga_balance = 100
WHERE NOT EXISTS (
    SELECT 1 FROM tanga_transactions
    WHERE user_id = profiles.telegram_id AND reason = 'opening_balance'
);

INSERT INTO tanga_transactions
    (user_id, delta, balance_after, reason, reference_type, celebrate, idempotency_key)
SELECT telegram_id, 100, 100, 'opening_balance', 'migration', TRUE, 'opening_balance:' || telegram_id
FROM profiles
ON CONFLICT (idempotency_key) DO NOTHING;
