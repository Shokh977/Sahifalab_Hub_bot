-- 093_server_derived_day_bucket.sql
--
-- Closes the "forged local_date" farming vector reported against the Tanga
-- rework: POST /api/focus/complete accepted a bare client-supplied date
-- string as the bucket key for BOTH the XP taper's credited_seconds_today
-- (migration 083) and the new Tanga daily cap's earn_date (migration 092),
-- with nothing tying it to the server's actual clock. A caller who studied
-- for real (the wall-clock cap on credited_seconds itself was, and remains,
-- correct) could still claim an unbounded number of distinct "days" against
-- that real time by relabelling the date on every call.
--
-- Invariant from here on: the day bucket is computed from server-observed
-- time, never from a client claim, for any profile with a CONFIRMED
-- timezone (profiles.timezone_confirmed_at IS NOT NULL — set by PATCH
-- /api/auth/me when a real client reports its device zone, see
-- app/api/v1/auth.py). registerTimezone() is one commit old as of this
-- writing (4af45ee) and has not yet had time to propagate across the
-- existing user base, so profiles WITHOUT a confirmed timezone fall back to
-- a tightly-bounded (±1 day) client-supplied date instead of the server's —
-- enough to keep a genuine traveller's midnight correct without reopening
-- the unbounded hole. A rolling-24h cap of 2 distinct buckets applies
-- regardless of branch, as insurance against DST edge cases or a future bug
-- rather than something callers are meant to rely on.
--
-- resolve_day_bucket() is the ONE place that decides what day it is —
-- credit_focus_time() (rewritten below) calls it for the XP-taper path, and
-- app/services/day_bucket.py's Python wrapper calls it directly for every
-- other caller (flashcards.py). Nothing else may compute this independently.

BEGIN;

-- ── 1. Confirmed-timezone marker ────────────────────────────────────────────
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS timezone_confirmed_at TIMESTAMPTZ NULL;

-- Audit trail for every ACCEPTED timezone change (PATCH /api/auth/me) — old
-- and new value, so a rapid-fire sequence of changes (the other half of the
-- reported farming vector: hopping UTC+14 -> UTC-12 to roll a calendar day
-- over in under 24 real hours) is visible after the fact even though the
-- endpoint itself now rate-limits to one change per 24h.
CREATE TABLE IF NOT EXISTS timezone_change_log (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    old_timezone  TEXT,
    new_timezone  TEXT NOT NULL,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timezone_change_log_user
    ON timezone_change_log (user_id, changed_at DESC);

-- ── 2. Per-user distinct-bucket tracking (rolling 24h cap + audit trail) ────
CREATE TABLE IF NOT EXISTS user_day_bucket_log (
    id            BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    bucket_date   DATE NOT NULL,
    source        TEXT NOT NULL,  -- 'focus_timer' | 'flashcards' | ...
    first_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, bucket_date)
);

CREATE INDEX IF NOT EXISTS idx_user_day_bucket_log_recent
    ON user_day_bucket_log (user_id, first_used_at DESC);

-- ── 3. Divergence log — client claimed one date, server resolved another ───
-- "Given this backend's history of silent failures, detection matters as
-- much as the fix" — this table is what makes farming attempts (successful
-- or blocked) visible instead of invisible.
CREATE TABLE IF NOT EXISTS local_date_divergence_log (
    id                  BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    source              TEXT NOT NULL,
    client_date         DATE NOT NULL,
    resolved_date       DATE NOT NULL,
    timezone_confirmed  BOOLEAN NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_local_date_divergence_log_recent
    ON local_date_divergence_log (created_at DESC);


-- ── 4. resolve_day_bucket() — the single day-bucket authority ──────────────
CREATE OR REPLACE FUNCTION resolve_day_bucket(
    p_user_id     BIGINT,
    p_client_date DATE,   -- NULL if the caller has none
    p_source      TEXT
)
RETURNS DATE
LANGUAGE plpgsql
AS $$
DECLARE
    v_timezone           TEXT;
    v_timezone_confirmed BOOLEAN;
    v_server_date        DATE;
    v_bucket             DATE;
    v_other_recent_count INTEGER;
BEGIN
    -- Locks the profile row so a concurrent PATCH /me timezone change can't
    -- race this resolution mid-flight (same row credit_focus_time() and
    -- PATCH /me both eventually touch, in a consistent lock order: profiles
    -- first, always, here and in every caller).
    SELECT timezone, (timezone_confirmed_at IS NOT NULL)
    INTO   v_timezone, v_timezone_confirmed
    FROM   profiles
    WHERE  telegram_id = p_user_id
    FOR UPDATE;

    IF v_timezone IS NULL THEN
        v_timezone := 'Asia/Tashkent';
        v_timezone_confirmed := FALSE;
    END IF;

    v_server_date := (NOW() AT TIME ZONE v_timezone)::date;

    IF v_timezone_confirmed THEN
        -- Invariant: for a confirmed profile, the server-derived date is
        -- authoritative — the client's claim is NEVER used to pick the
        -- bucket, only compared below for divergence logging.
        v_bucket := v_server_date;
    ELSE
        -- Unconfirmed (transitional, see module comment): allow the
        -- client's claim only within a tight ±1 day window of the
        -- server-computed date. Closes the "any string" hole down to a
        -- legitimate-travel-sized window while timezone confirmation
        -- propagates across the existing user base.
        IF p_client_date IS NOT NULL
           AND p_client_date BETWEEN v_server_date - 1 AND v_server_date + 1 THEN
            v_bucket := p_client_date;
        ELSE
            v_bucket := v_server_date;
        END IF;
    END IF;

    -- ── Defense-in-depth: max 2 distinct buckets per rolling 24 real hours ──
    -- Applies regardless of the branch above. Not the primary defense (the
    -- confirmed-timezone branch already can't be gamed) — this exists so the
    -- invariant is explicit and enforced, not just emergent from correct
    -- timezone data, and it also catches DST-transition edge cases.
    SELECT COUNT(DISTINCT bucket_date) INTO v_other_recent_count
    FROM user_day_bucket_log
    WHERE user_id = p_user_id
      AND first_used_at > NOW() - INTERVAL '24 hours'
      AND bucket_date <> v_bucket;

    IF v_other_recent_count >= 2 THEN
        v_bucket := v_server_date;
    END IF;

    INSERT INTO user_day_bucket_log (user_id, bucket_date, source)
    VALUES (p_user_id, v_bucket, p_source)
    ON CONFLICT (user_id, bucket_date) DO NOTHING;

    IF p_client_date IS NOT NULL AND p_client_date <> v_bucket THEN
        INSERT INTO local_date_divergence_log
            (user_id, source, client_date, resolved_date, timezone_confirmed)
        VALUES (p_user_id, p_source, p_client_date, v_bucket, v_timezone_confirmed);
    END IF;

    RETURN v_bucket;
END;
$$;


-- ── 5. credit_focus_time() — now resolves its own bucket via the function
-- above instead of trusting p_local_date verbatim, and returns the resolved
-- date so the caller (focus.py) can feed the SAME value into
-- record_study_activity() rather than re-deriving it a second way. p_local_date
-- is kept as a parameter (renamed p_client_date) for backward compatibility —
-- the shipped client still sends local_date and always will; the request
-- contract does not change — it just stops being trusted as an instruction.
DROP FUNCTION IF EXISTS credit_focus_time(BIGINT, INTEGER, DATE, TEXT);

CREATE FUNCTION credit_focus_time(
    p_user_id         BIGINT,
    p_claimed_seconds INTEGER,
    p_client_date     DATE,
    p_surface         TEXT DEFAULT NULL
)
RETURNS TABLE(
    credited_seconds    INTEGER,
    xp_awarded          INTEGER,
    daily_total_seconds INTEGER,
    anomaly_flag        BOOLEAN,
    resolved_date        DATE
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_bucket           DATE;
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
    -- Resolve the bucket FIRST (locks profiles), before locking
    -- focus_credit_ledger below — consistent lock order across every caller
    -- of resolve_day_bucket() avoids a deadlock with PATCH /me's own
    -- profiles-row update.
    v_bucket := resolve_day_bucket(p_user_id, p_client_date, 'focus_timer');

    INSERT INTO focus_credit_ledger (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

    SELECT last_credit_at, credit_day, credited_seconds_today
    INTO   v_last_credit_at, v_credit_day, v_credited_today
    FROM   focus_credit_ledger
    WHERE  user_id = p_user_id
    FOR UPDATE;

    IF v_credit_day IS DISTINCT FROM v_bucket OR v_credited_today IS NULL THEN
        v_credited_today := 0;
    END IF;

    -- ── The wall-clock cap (unchanged — this was always correct) ────────────
    IF v_last_credit_at IS NULL THEN
        v_elapsed_seconds := p_claimed_seconds;
    ELSE
        v_elapsed_seconds := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (v_now - v_last_credit_at)))::INTEGER);
    END IF;
    v_credited := LEAST(p_claimed_seconds, v_elapsed_seconds);

    v_daily_before    := v_credited_today;
    v_credited_today  := v_credited_today + v_credited;

    v_xp_awarded := compute_tapered_focus_xp(v_daily_before, v_credited);

    IF v_credited_today > 28800 THEN
        v_anomaly := TRUE;
    END IF;

    UPDATE focus_credit_ledger
    SET last_credit_at         = v_now,
        last_surface            = COALESCE(p_surface, last_surface),
        credit_day              = v_bucket,
        credited_seconds_today  = v_credited_today,
        updated_at               = v_now
    WHERE user_id = p_user_id;

    RETURN QUERY SELECT v_credited, v_xp_awarded, v_credited_today, v_anomaly, v_bucket;
END;
$$;

COMMIT;
