    -- ═══════════════════════════════════════════════════════════════════════════════
    -- 038_xp_gamification.sql
    -- Hardcore Exponential XP & Gamification System
    --
    -- Formula:  Target_XP = 100 × Level^2.5
    --   Level 1  →      0 XP base   (everyone starts here)
    --   Level 2  →    566 XP
    --   Level 10 → 31,623 XP
    --   Level 27 → 378,845 XP  (Sohibqiron — hard cap)
    --
    -- XP Sources (anti-cheat rules):
    --   DEEP_WORK : 1.66 XP / minute — unlimited
    --   QUIZ      : 25 XP per quiz   — hard cap 100 XP / UTC day
    --   COURSE    : 200 XP per course — one-time per reference_id
    -- ═══════════════════════════════════════════════════════════════════════════════


    -- ── 1. New columns on profiles ────────────────────────────────────────────────

    ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS total_focus_minutes     INT         NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS daily_quiz_xp           INT         NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS daily_quiz_xp_reset_at  TIMESTAMPTZ;


    -- ── 2. xp_logs — audit trail for every XP event ──────────────────────────────

    CREATE TABLE IF NOT EXISTS xp_logs (
    id           BIGSERIAL    PRIMARY KEY,
    user_id      BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    amount       INT          NOT NULL,
    source       TEXT         NOT NULL CHECK (source IN ('DEEP_WORK', 'QUIZ', 'COURSE')),
    reference_id BIGINT,                     -- e.g. course_id for COURSE source
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS xp_logs_user_id_idx     ON xp_logs(user_id);
    CREATE INDEX IF NOT EXISTS xp_logs_user_source_idx ON xp_logs(user_id, source);
    CREATE INDEX IF NOT EXISTS xp_logs_created_at_idx  ON xp_logs(created_at);


    -- ── 3. user_badges — awarded once per badge key per user ─────────────────────

    CREATE TABLE IF NOT EXISTS user_badges (
    id         BIGSERIAL   PRIMARY KEY,
    user_id    BIGINT      NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    badge_key  TEXT        NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, badge_key)
    );

    CREATE INDEX IF NOT EXISTS user_badges_user_id_idx ON user_badges(user_id);


    -- ── 4. calculate_level_from_xp(xp INT) → INT ─────────────────────────────────
    --
    -- Finds the highest level N where 100 * (N+1)^2.5 > xp_input.
    -- Minimum level is 1 regardless of XP.
    -- Maximum level is capped at 27 (Sohibqiron).

    CREATE OR REPLACE FUNCTION calculate_level_from_xp(xp_input INT)
    RETURNS INT
    LANGUAGE plpgsql IMMUTABLE
    AS $$
    DECLARE
    lv INT := 1;
    BEGIN
    WHILE (100.0 * POWER((lv + 1)::FLOAT, 2.5)) <= xp_input::FLOAT LOOP
        lv := lv + 1;
        IF lv >= 27 THEN EXIT; END IF;
    END LOOP;
    RETURN lv;
    END;
    $$;


    -- ── 5. add_xp(user_id, source, amount, reference_id) → (new_xp, new_level, xp_added) ─
    --
    -- All XP mutations must go through this function.
    -- Row-level locking prevents concurrent race conditions.

    CREATE OR REPLACE FUNCTION add_xp(
    p_user_id      BIGINT,
    p_source       TEXT,           -- 'DEEP_WORK' | 'QUIZ' | 'COURSE'
    p_amount       INT,
    p_reference_id BIGINT DEFAULT NULL
    )
    RETURNS TABLE(new_xp INT, new_level INT, xp_added INT)
    LANGUAGE plpgsql
    AS $$
    DECLARE
    v_current_xp     INT;
    v_daily_quiz_xp  INT;
    v_daily_reset_at TIMESTAMPTZ;
    v_actual_amount  INT := p_amount;
    v_new_xp         INT;
    v_new_level      INT;
    BEGIN
    -- Acquire a row-level lock to prevent concurrent XP races
    SELECT total_xp, daily_quiz_xp, daily_quiz_xp_reset_at
    INTO   v_current_xp, v_daily_quiz_xp, v_daily_reset_at
    FROM   profiles
    WHERE  telegram_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'User % not found in profiles', p_user_id;
    END IF;

    -- ── QUIZ anti-cheat: 25 XP per quiz, hard cap 100 XP per UTC day ───────────
    IF p_source = 'QUIZ' THEN
        -- Reset daily counter when the UTC calendar day rolls over
        IF v_daily_reset_at IS NULL OR
        (v_daily_reset_at AT TIME ZONE 'UTC')::DATE < (NOW() AT TIME ZONE 'UTC')::DATE
        THEN
        v_daily_quiz_xp := 0;
        END IF;

        -- Clamp to remaining daily allowance
        v_actual_amount := LEAST(p_amount, 100 - v_daily_quiz_xp);

        IF v_actual_amount <= 0 THEN
        -- Daily cap already reached — no XP granted
        RETURN QUERY SELECT v_current_xp, calculate_level_from_xp(v_current_xp), 0;
        RETURN;
        END IF;

        -- Persist updated daily counter
        UPDATE profiles
        SET    daily_quiz_xp          = v_daily_quiz_xp + v_actual_amount,
            daily_quiz_xp_reset_at = NOW()
        WHERE  telegram_id = p_user_id;

    -- ── COURSE one-time bonus: 200 XP, deduped by reference_id (course_id) ─────
    ELSIF p_source = 'COURSE' AND p_reference_id IS NOT NULL THEN
        IF EXISTS (
        SELECT 1 FROM xp_logs
        WHERE  user_id      = p_user_id
            AND  source       = 'COURSE'
            AND  reference_id = p_reference_id
        ) THEN
        -- Already awarded for this course
        RETURN QUERY SELECT v_current_xp, calculate_level_from_xp(v_current_xp), 0;
        RETURN;
        END IF;

    -- ── DEEP_WORK: no daily cap, caller sends round(minutes × 1.66) ─────────────
    -- (No extra checks — unlimited XP from focus is by design)
    END IF;

    -- ── Apply XP and recalculate level ───────────────────────────────────────────
    v_new_xp    := v_current_xp + v_actual_amount;
    v_new_level := calculate_level_from_xp(v_new_xp);

    UPDATE profiles
    SET total_xp = v_new_xp,
        level    = v_new_level
    WHERE telegram_id = p_user_id;

    -- ── Audit log ────────────────────────────────────────────────────────────────
    INSERT INTO xp_logs(user_id, amount, source, reference_id)
    VALUES (p_user_id, v_actual_amount, p_source, p_reference_id);

    RETURN QUERY SELECT v_new_xp, v_new_level, v_actual_amount;
    END;
    $$;


    -- ── 6. Backfill total_focus_minutes from existing focus_seconds ───────────────
    -- Safe: GREATEST() ensures we never decrease an already-backfilled value.

    UPDATE profiles
    SET    total_focus_minutes = GREATEST(
            total_focus_minutes,
            FLOOR(COALESCE(focus_seconds, 0) / 60)::INT
        )
    WHERE  COALESCE(focus_seconds, 0) > 0;


    -- ── 7. Legacy level recalculation (Adolatli O'tish) ──────────────────────────
    -- Applies the new exponential formula to every user.
    -- NOTE: This ONLY updates level — total_xp is never touched (never decreased).

    UPDATE profiles
    SET level = calculate_level_from_xp(COALESCE(total_xp, 0));


    -- ── 8. Deep Work Master legacy badge ─────────────────────────────────────────
    -- Automatically granted to any user with 25+ hours of recorded focus.

    INSERT INTO user_badges(user_id, badge_key, granted_at)
    SELECT telegram_id,
        'deep_work_master',
        NOW()
    FROM   profiles
    WHERE  total_focus_minutes >= 1500
    OR  COALESCE(focus_seconds, 0) >= 90000
    ON CONFLICT (user_id, badge_key) DO NOTHING;
