-- ═══════════════════════════════════════════════════════════════════════════════
-- 083_taper_focus_xp.sql
-- step-27: replace step-26's flat "~4h/day then 0 XP" timer cap with a
-- tapered (diminishing-returns) curve. Nobody is ever cut off to zero — extra
-- hours just earn less per minute, so raw available time stops dominating the
-- leaderboard without punishing a genuine long study day.
--
-- Everything else from step-26 (single-session enforcement via the
-- focus_credit_ledger row lock, the wall-clock cap on credited_seconds, the
-- >8h anomaly flag) is UNCHANGED — only the "Daily timer-XP cap" section of
-- credit_focus_time() is replaced. credited_seconds (what streak/stats/daily
-- goal count) is untouched by this migration; only how those credited seconds
-- convert to XP changes.
--
-- Tiers (daily accumulated TIMER minutes, tracked via the existing
-- focus_credit_ledger.credited_seconds_today counter — no new per-day counter
-- needed, step-26 already persists it):
--   0   – 180 min (0h–3h)  → 1.66 XP/min (100%)
--   180 – 360 min (3h–6h)  → 0.83 XP/min (50%)
--   360+ min       (6h+)   → 0.42 XP/min (25%, never zero)
--
-- A session that straddles a tier boundary is split minute-band by
-- minute-band, not charged a single flat rate for its whole duration — see
-- compute_tapered_focus_xp() below.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. Drop the now-unused flat-cap counters ─────────────────────────────────
-- (xp_day / xp_seconds_today backed step-26 Phase 3's hard "remaining XP
-- allowance" cutoff, which no longer exists — the taper needs only
-- credited_seconds_today, already on this table.)

ALTER TABLE focus_credit_ledger
    DROP COLUMN IF EXISTS xp_day,
    DROP COLUMN IF EXISTS xp_seconds_today;


-- ── 2. compute_tapered_focus_xp(daily_seconds_before, credited_seconds) ─────
-- Pure function, no table access. Walks the interval
-- [daily_seconds_before, daily_seconds_before + credited_seconds) across the
-- three tier bands and sums each band's seconds at that band's rate. Returns
-- rounded whole XP. Thresholds/rates are named constants — tune here only.

CREATE OR REPLACE FUNCTION compute_tapered_focus_xp(
    p_daily_seconds_before INTEGER,
    p_credited_seconds     INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    -- ── Tunable taper constants ──────────────────────────────────────────────
    FULL_TIER_END_SECONDS    CONSTANT INTEGER := 10800;  -- 3h/day
    REDUCED_TIER_END_SECONDS CONSTANT INTEGER := 21600;  -- 6h/day
    RATE_FULL_XP_PER_MIN     CONSTANT NUMERIC := 1.66;   -- 100% — matches DEEP_WORK_XP_PER_MINUTE
    RATE_REDUCED_XP_PER_MIN  CONSTANT NUMERIC := 0.83;   -- 50%
    RATE_TRICKLE_XP_PER_MIN  CONSTANT NUMERIC := 0.42;   -- 25%, never zero

    v_start   INTEGER := GREATEST(0, COALESCE(p_daily_seconds_before, 0));
    v_end     INTEGER;
    v_xp      NUMERIC := 0;
    v_band_lo INTEGER;
    v_band_hi INTEGER;
BEGIN
    IF p_credited_seconds IS NULL OR p_credited_seconds <= 0 THEN
        RETURN 0;
    END IF;
    v_end := v_start + p_credited_seconds;

    -- Band 1: full rate, [0, FULL_TIER_END_SECONDS)
    v_band_lo := GREATEST(v_start, 0);
    v_band_hi := LEAST(v_end, FULL_TIER_END_SECONDS);
    IF v_band_hi > v_band_lo THEN
        v_xp := v_xp + (v_band_hi - v_band_lo) / 60.0 * RATE_FULL_XP_PER_MIN;
    END IF;

    -- Band 2: reduced rate, [FULL_TIER_END_SECONDS, REDUCED_TIER_END_SECONDS)
    v_band_lo := GREATEST(v_start, FULL_TIER_END_SECONDS);
    v_band_hi := LEAST(v_end, REDUCED_TIER_END_SECONDS);
    IF v_band_hi > v_band_lo THEN
        v_xp := v_xp + (v_band_hi - v_band_lo) / 60.0 * RATE_REDUCED_XP_PER_MIN;
    END IF;

    -- Band 3: trickle rate, [REDUCED_TIER_END_SECONDS, ∞)
    v_band_lo := GREATEST(v_start, REDUCED_TIER_END_SECONDS);
    v_band_hi := v_end;
    IF v_band_hi > v_band_lo THEN
        v_xp := v_xp + (v_band_hi - v_band_lo) / 60.0 * RATE_TRICKLE_XP_PER_MIN;
    END IF;

    RETURN ROUND(v_xp)::INTEGER;
END;
$$;


-- ── 3. credit_focus_time() — same signature except xp_eligible_seconds is
-- replaced by xp_awarded (final tapered XP, ready for add_xp()). The
-- single-session + wall-clock section (everything up to and including
-- `v_credited_today := v_credited_today + v_credited;`) is byte-for-byte
-- identical to migration 082 — only the "Daily timer-XP cap" section below it
-- is replaced with a call to compute_tapered_focus_xp(). Output column names
-- changed, so CREATE OR REPLACE isn't legal here — drop first.

DROP FUNCTION IF EXISTS credit_focus_time(BIGINT, INTEGER, DATE, TEXT);

CREATE FUNCTION credit_focus_time(
    p_user_id         BIGINT,
    p_claimed_seconds INTEGER,
    p_local_date      DATE,
    p_surface         TEXT DEFAULT NULL
)
RETURNS TABLE(
    credited_seconds    INTEGER,
    xp_awarded          INTEGER,
    daily_total_seconds INTEGER,
    anomaly_flag        BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_last_credit_at   TIMESTAMPTZ;
    v_credit_day       DATE;
    v_credited_today   INTEGER;
    v_now              TIMESTAMPTZ := NOW();
    v_elapsed_seconds  INTEGER;
    v_credited         INTEGER;
    v_daily_before      INTEGER;
    v_xp_awarded        INTEGER;
    v_anomaly          BOOLEAN := FALSE;
BEGIN
    -- Ensure a ledger row exists, then lock it. The row lock is what makes
    -- concurrent completions from different surfaces for the same user
    -- serialize instead of racing each other's wall-clock check.
    INSERT INTO focus_credit_ledger (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT last_credit_at, credit_day, credited_seconds_today
    INTO   v_last_credit_at, v_credit_day, v_credited_today
    FROM   focus_credit_ledger
    WHERE  user_id = p_user_id
    FOR UPDATE;

    -- Roll the daily counter over when the client's local calendar date
    -- advances (same day-boundary convention as record_study_activity/
    -- parse_local_date in app/services/study_activity.py — trust the
    -- client's local_date, fall back to server day only when absent, never a
    -- fixed-offset cutoff). This is also the sole basis for the XP taper's
    -- tier lookup — no separate per-day timer-minutes counter needed.
    IF v_credit_day IS DISTINCT FROM p_local_date OR v_credited_today IS NULL THEN
        v_credited_today := 0;
    END IF;

    -- ── The wall-clock cap (step-26, untouched) ─────────────────────────────
    -- No prior credited completion ever recorded for this user: trust the
    -- first claim in full (nothing could have overlapped it). Every
    -- completion after that is capped by real elapsed time since the last one.
    IF v_last_credit_at IS NULL THEN
        v_elapsed_seconds := p_claimed_seconds;
    ELSE
        v_elapsed_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_last_credit_at)))::INTEGER);
    END IF;
    v_credited := LEAST(p_claimed_seconds, v_elapsed_seconds);

    v_daily_before    := v_credited_today;
    v_credited_today  := v_credited_today + v_credited;

    -- ── Tapered timer-XP (step-27) ──────────────────────────────────────────
    -- credited_seconds (streak/stats) is NEVER reduced by the taper — only
    -- how much XP those seconds are worth. Computed from where this session
    -- falls in the day's already-accumulated credited seconds, split across
    -- tier bands inside compute_tapered_focus_xp().
    v_xp_awarded := compute_tapered_focus_xp(v_daily_before, v_credited);

    IF v_credited_today > 28800 THEN
        v_anomaly := TRUE;
    END IF;

    UPDATE focus_credit_ledger
    SET last_credit_at         = v_now,
        last_surface            = COALESCE(p_surface, last_surface),
        credit_day              = p_local_date,
        credited_seconds_today  = v_credited_today,
        updated_at               = v_now
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT v_credited, v_xp_awarded, v_credited_today, v_anomaly;
END;
$$;
