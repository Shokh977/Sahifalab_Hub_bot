-- ═══════════════════════════════════════════════════════════════════════════════
-- 082_focus_session_integrity.sql
-- Fix: focus-timer XP/hours multiplication when a user runs the timer on more
-- than one surface (mobile app, sahifalab.uz web, Telegram mini app) at once.
--
-- Root cause: POST /api/focus/complete (focus.py) has always trusted a bare
-- client-counted `minutes` integer with no session concept, no timestamps, and
-- no cross-surface reconciliation — one real hour studied with the timer open
-- on three surfaces credited 3x the minutes and 3x the XP.
--
-- Fix shape: server-side wall-clock rate limiting. Per user, credited_seconds
-- can never exceed real elapsed time since the user's last credited focus
-- completion, enforced under a row lock (same pattern as add_xp()'s QUIZ cap
-- in 038_xp_gamification.sql). This makes concurrent-surface multiplication
-- impossible regardless of how many clients report time, without touching any
-- client. See app/api/v1/endpoints/focus.py's complete_focus_session for the
-- call site.
--
-- Also adds: a daily timer-XP cap (~4 focused hours, time beyond it still
-- counts toward streak/stats but mints no more XP) and anomaly flagging
-- (>8h credited in a single local day) for admin review.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. focus_credit_ledger — one row per user, server's wall-clock anchor ────
-- for the "how much real time has actually elapsed since we last credited
-- this user" check. Also the daily-XP-cap and daily-anomaly-threshold counters
-- ride along here since they need the identical row lock.

CREATE TABLE IF NOT EXISTS focus_credit_ledger (
    user_id                 BIGINT      PRIMARY KEY REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    last_credit_at          TIMESTAMPTZ,
    last_surface            VARCHAR(20),
    credit_day              DATE,
    credited_seconds_today  INTEGER     NOT NULL DEFAULT 0,
    xp_day                  DATE,
    xp_seconds_today        INTEGER     NOT NULL DEFAULT 0,
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 2. focus_anomaly_flags — report-only, for admin review (Phase 4) ────────
-- Never auto-punished. One row per user per local day that exceeded the
-- plausibility threshold (8h credited seconds) even after the wall-clock cap.

CREATE TABLE IF NOT EXISTS focus_anomaly_flags (
    id            BIGSERIAL   PRIMARY KEY,
    user_id       BIGINT      NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    flagged_date  DATE        NOT NULL,
    daily_seconds INTEGER     NOT NULL,
    reviewed      BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, flagged_date)
);

CREATE INDEX IF NOT EXISTS ix_focus_anomaly_flags_unreviewed
    ON focus_anomaly_flags(reviewed, flagged_date DESC) WHERE NOT reviewed;


-- ── 3. credit_focus_time(user_id, claimed_seconds, local_date, surface) ─────
--   → (credited_seconds, xp_eligible_seconds, daily_total_seconds, anomaly_flag)
--
-- Called once per POST /api/focus/complete, BEFORE any XP/streak write.
--
--   credited_seconds    = MIN(claimed_seconds, real seconds elapsed since this
--                          user's last credited completion). This is the whole
--                          fix: no matter how many surfaces call complete and
--                          how much each claims, the SUM of credited_seconds
--                          across all of them in a real hour cannot exceed one
--                          hour, because each call's allowance is anchored to
--                          the same per-user timestamp under a row lock.
--
--   xp_eligible_seconds = credited_seconds, further clamped to whatever is
--                          left of this user's daily 4-focused-hour XP
--                          allowance (14400s). Minutes beyond the XP cap are
--                          still returned via credited_seconds, so the caller
--                          still records them toward streak/total_focus_minutes
--                          — only XP minting stops.
--
--   anomaly_flag         = TRUE once the day's cumulative credited_seconds
--                          (post wall-clock-cap, so already real) exceeds 8h.
--                          Report-only; caller inserts into
--                          focus_anomaly_flags, no automatic action taken.

CREATE OR REPLACE FUNCTION credit_focus_time(
    p_user_id         BIGINT,
    p_claimed_seconds INTEGER,
    p_local_date      DATE,
    p_surface         TEXT DEFAULT NULL
)
RETURNS TABLE(
    credited_seconds    INTEGER,
    xp_eligible_seconds INTEGER,
    daily_total_seconds INTEGER,
    anomaly_flag        BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_last_credit_at   TIMESTAMPTZ;
    v_credit_day       DATE;
    v_credited_today   INTEGER;
    v_xp_day           DATE;
    v_xp_seconds_today INTEGER;
    v_now              TIMESTAMPTZ := NOW();
    v_elapsed_seconds  INTEGER;
    v_credited         INTEGER;
    v_xp_remaining     INTEGER;
    v_xp_eligible      INTEGER;
    v_anomaly          BOOLEAN := FALSE;
BEGIN
    -- Ensure a ledger row exists, then lock it. The row lock is what makes
    -- concurrent completions from different surfaces for the same user
    -- serialize instead of racing each other's wall-clock check.
    INSERT INTO focus_credit_ledger (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT last_credit_at, credit_day, credited_seconds_today, xp_day, xp_seconds_today
    INTO   v_last_credit_at, v_credit_day, v_credited_today, v_xp_day, v_xp_seconds_today
    FROM   focus_credit_ledger
    WHERE  user_id = p_user_id
    FOR UPDATE;

    -- Roll daily counters over when the client's local calendar date advances
    -- (same day-boundary convention as record_study_activity/parse_local_date
    -- in app/services/study_activity.py — trust the client's local_date, fall
    -- back to server day only when absent, never a fixed-offset cutoff).
    IF v_credit_day IS DISTINCT FROM p_local_date OR v_credited_today IS NULL THEN
        v_credited_today := 0;
    END IF;
    IF v_xp_day IS DISTINCT FROM p_local_date OR v_xp_seconds_today IS NULL THEN
        v_xp_seconds_today := 0;
    END IF;

    -- ── The wall-clock cap ──────────────────────────────────────────────────
    -- No prior credited completion ever recorded for this user: trust the
    -- first claim in full (nothing could have overlapped it). Every
    -- completion after that is capped by real elapsed time since the last one.
    IF v_last_credit_at IS NULL THEN
        v_elapsed_seconds := p_claimed_seconds;
    ELSE
        v_elapsed_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_last_credit_at)))::INTEGER);
    END IF;
    v_credited := LEAST(p_claimed_seconds, v_elapsed_seconds);

    v_credited_today := v_credited_today + v_credited;

    -- ── Daily timer-XP cap (~4 focused hours) ──────────────────────────────
    v_xp_remaining := GREATEST(0, 14400 - v_xp_seconds_today);
    v_xp_eligible  := LEAST(v_credited, v_xp_remaining);
    v_xp_seconds_today := v_xp_seconds_today + v_xp_eligible;

    IF v_credited_today > 28800 THEN
        v_anomaly := TRUE;
    END IF;

    UPDATE focus_credit_ledger
    SET last_credit_at         = v_now,
        last_surface            = COALESCE(p_surface, last_surface),
        credit_day              = p_local_date,
        credited_seconds_today  = v_credited_today,
        xp_day                  = p_local_date,
        xp_seconds_today        = v_xp_seconds_today,
        updated_at               = v_now
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT v_credited, v_xp_eligible, v_credited_today, v_anomaly;
END;
$$;
