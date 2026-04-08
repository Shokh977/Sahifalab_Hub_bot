-- Migration 036: notification_category enum + new notification types
--
-- 1. Creates notification_category_enum (SOCIAL | EDUCATIONAL | GROWTH | BUSINESS)
-- 2. Alters notifications.category column to use the enum
-- 3. Updates create_notification() RPC to accept enum type
-- 4. Adds new notification type helpers for:
--    new_content, progress, daily_streak, xp_reward, analytics_report
--
-- Run AFTER migration 035_notifications.sql

-- ─── 1. Create enum type ─────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE notification_category_enum AS ENUM (
    'SOCIAL',
    'EDUCATIONAL',
    'GROWTH',
    'BUSINESS'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;


-- ─── 2. Alter notifications.category to use enum ────────────────────────────
-- Safe: existing TEXT values exactly match enum labels.

ALTER TABLE notifications
  ALTER COLUMN category DROP DEFAULT;

ALTER TABLE notifications
  ALTER COLUMN category
    TYPE notification_category_enum
    USING category::notification_category_enum;

ALTER TABLE notifications
  ALTER COLUMN category
    SET DEFAULT 'SOCIAL'::notification_category_enum;


-- ─── 3. Update get_notifications_page to return enum as text ─────────────────

CREATE OR REPLACE FUNCTION get_notifications_page(
    p_user_id  BIGINT,
    p_limit    INTEGER DEFAULT 30,
    p_cursor   BIGINT  DEFAULT NULL
)
RETURNS TABLE (
    id         BIGINT,
    type       TEXT,
    category   TEXT,
    meta       JSONB,
    is_read    BOOLEAN,
    created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
    SELECT
        n.id,
        n.type,
        n.category::TEXT,
        n.meta,
        n.is_read,
        n.created_at
    FROM   notifications n
    WHERE  n.user_id = p_user_id
      AND  (p_cursor IS NULL OR n.id < p_cursor)
    ORDER BY n.id DESC
    LIMIT p_limit;
$$;


-- ─── 4. Update create_notification to validate category ──────────────────────

CREATE OR REPLACE FUNCTION create_notification(
    p_user_id   BIGINT,
    p_type      TEXT,
    p_category  TEXT DEFAULT 'SOCIAL',
    p_meta      JSONB DEFAULT '{}'
)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    new_id    BIGINT;
    v_category notification_category_enum;
BEGIN
    -- Safely cast text → enum (falls back to SOCIAL on invalid value)
    BEGIN
        v_category := p_category::notification_category_enum;
    EXCEPTION WHEN invalid_text_representation THEN
        v_category := 'SOCIAL'::notification_category_enum;
    END;

    INSERT INTO notifications (user_id, type, category, meta)
    VALUES (p_user_id, p_type, v_category, p_meta)
    RETURNING id INTO new_id;

    RETURN new_id;
END;
$$;


-- ─── 5. Convenience: get_notifications_page filtered by category ─────────────

CREATE OR REPLACE FUNCTION get_notifications_by_category(
    p_user_id  BIGINT,
    p_category TEXT,
    p_limit    INTEGER DEFAULT 30,
    p_cursor   BIGINT  DEFAULT NULL
)
RETURNS TABLE (
    id         BIGINT,
    type       TEXT,
    category   TEXT,
    meta       JSONB,
    is_read    BOOLEAN,
    created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
    SELECT
        n.id,
        n.type,
        n.category::TEXT,
        n.meta,
        n.is_read,
        n.created_at
    FROM   notifications n
    WHERE  n.user_id  = p_user_id
      AND  n.category = p_category::notification_category_enum
      AND  (p_cursor IS NULL OR n.id < p_cursor)
    ORDER BY n.id DESC
    LIMIT p_limit;
$$;


-- ─── 6. Convenience: get_unread_count_by_category ───────────────────────────

CREATE OR REPLACE FUNCTION get_unread_count_by_category(
    p_user_id BIGINT
)
RETURNS TABLE (
    category TEXT,
    cnt      INTEGER
) LANGUAGE sql STABLE AS $$
    SELECT
        category::TEXT,
        COUNT(*)::INTEGER AS cnt
    FROM   notifications
    WHERE  user_id  = p_user_id
      AND  is_read  = false
    GROUP BY category;
$$;


-- ─── 7. New notification types reference ────────────────────────────────────
-- (types are stored as free-text in notifications.type column)
--
-- SOCIAL:
--   follow        — Yangi foydalanuvchi sizga obuna bo'ldi.
--   like          — {actor_name} sizning postingizga like bosdi.
--   comment       — {actor_name} sizning postingizga izoh qoldirdi.
--   repost        — Kimdir sizning postingizni o'z lentasida ulashdi.
--   mention       — {actor_name} sizni eslatib o'tdi.
--
-- EDUCATIONAL:
--   new_content   — Siz kuzatadigan {teacher_name} yangi kurs yoki dars yukladi.
--   progress      — Tabriklaymiz! Siz {course_title}ning {percentage}% qismini tugatdingiz.
--   enrollment    — Kursga muvaffaqiyatli yozildingiz.
--   lesson_complete  — "{lesson_title}" muvaffaqiyatli yakunlandi.
--   course_complete  — "{course_title}" to'liq yakunlandi! 🎉
--   certificate   — "{course_title}" sertifikati tayyor.
--   quiz_pass     — Test muvaffaqiyatli topshirildi! Ball: {score}%
--
-- GROWTH:
--   level_up      — Ajoyib! Siz {rank_name} darajasiga ko'tarildingiz!
--   daily_streak  — Bugun hali dars ko'rmadingiz, olovli seriyangiz (🔥) o'chib qolmasin!
--   xp_reward     — Sizning oxirgi postingiz {view_count} ta view yig'di.
--   achievement   — "{achievement_name}" ochildi!
--   streak        — {days} kunlik streak! 🔥
--   leaderboard_rank — Reytingda {rank}-o'ringa chiqdingiz.
--
-- BUSINESS:
--   new_student   — Yangi o'quvchi kursingizga a'zo bo'ldi. Tushum: {amount} (30% komissiyadan tashqari).
--   new_sale      — Yangi o'quvchi kursingizga a'zo bo'ldi. Tushum: {amount} (30% komissiyadan tashqari).
--   payout        — Sizning daromadingiz muvaffaqiyatli hisobingizga o'tkazildi.
--   analytics_report — Haftalik hisobotingiz tayyor. O'tgan haftaga nisbatan {percent_change}% o'sish bor.
--   new_review    — {rating}★ baho qo'yildi.
