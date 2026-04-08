-- Migration 037: Notification performance indexes + unique sender counting + welcome message
--
-- Changes:
--   1. Add sender_id column to notifications (used for unique sender counting)
--   2. Partial index for fast unread sender lookups
--   3. Covering index for recipient + read status
--   4. get_unread_count_fast — COUNT(DISTINCT sender_id) not COUNT(*)
--      → User A sends 5 notifications → count is 1
--      → User A + User B send notifications → count is 2
--   5. send_welcome_notification(user_id, user_name) — fires on new signup
--   6. System user constant: sender_id = 0 (SAHIFALAB platform account)

-- ─── 1. Add sender_id to notifications ──────────────────────────────────────
-- NULL = system notification (welcome, level_up, etc.)
-- 0    = SAHIFALAB platform (explicit system sender)
-- >0   = real user (follower, liker, commenter, etc.)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_id BIGINT NULL;

-- Backfill sender_id from meta.actor_id for existing social notifications
UPDATE notifications
SET    sender_id = (meta->>'actor_id')::BIGINT
WHERE  sender_id IS NULL
  AND  meta->>'actor_id' IS NOT NULL;

-- ─── 2. Partial index for unread notifications (most common query) ───────────
-- Speeds up: SELECT COUNT(DISTINCT sender_id) WHERE user_id=X AND is_read=false
CREATE INDEX IF NOT EXISTS idx_notif_user_unread_partial
    ON notifications (user_id, sender_id)
    WHERE is_read = false;

-- ─── 3. Covering index for recipient + read status ─────────────────────────
-- Used by mark_notifications_read and filtered feeds
CREATE INDEX IF NOT EXISTS idx_notif_user_isread
    ON notifications (user_id, is_read);

-- ─── 4. get_unread_count_fast — unique senders, not total rows ─────────────
-- COUNT(DISTINCT COALESCE(sender_id, 0)):
--   • Real user notifications    → counted once per unique sender
--   • System notifications       → all grouped under sender 0 → count as 1
--   • If A sends 5 likes         → still 1 (same sender_id)
--   • If A + B both send likes   → 2 (two distinct senders)
CREATE OR REPLACE FUNCTION get_unread_count_fast(p_user_id BIGINT)
RETURNS INTEGER
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
    SELECT COUNT(DISTINCT COALESCE(sender_id, 0))::INTEGER
    FROM   notifications
    WHERE  user_id  = p_user_id
      AND  is_read  = false;
$$;

-- ─── 5. send_welcome_notification — triggered on new user signup ────────────
-- Call this from the backend signup handler:
--   SELECT send_welcome_notification(p_user_id := NEW.telegram_id, p_user_name := NEW.first_name);
--
-- Title: "Xush kelibsiz, [User Name]! 🚀"
-- XP reward: 100 XP (backend must also credit the user's XP separately)
CREATE OR REPLACE FUNCTION send_welcome_notification(
    p_user_id   BIGINT,
    p_user_name TEXT  DEFAULT 'Do''st'
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_id BIGINT;
BEGIN
    INSERT INTO notifications (user_id, type, category, meta, sender_id)
    VALUES (
        p_user_id,
        'welcome',
        'GROWTH',
        jsonb_build_object(
            'actor_id',    0,
            'actor_name',  'Sahifalab',
            'actor_photo', '/sahifalab-logo.png',   -- served from /public
            'user_name',   p_user_name,
            'xp_reward',   100
        ),
        0  -- sender_id = 0 → SAHIFALAB system account
    )
    RETURNING id INTO new_id;
    RETURN new_id;
END;
$$;

-- ─── 6. Update get_notifications_page to expose sender_id ──────────────────
-- Must DROP first: Postgres cannot change the return type of an existing function.
DROP FUNCTION IF EXISTS get_notifications_page(BIGINT, INTEGER, BIGINT);

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
    created_at TIMESTAMPTZ,
    sender_id  BIGINT
) LANGUAGE sql STABLE AS $$
    SELECT n.id, n.type, n.category, n.meta, n.is_read, n.created_at, n.sender_id
    FROM   notifications n
    WHERE  n.user_id = p_user_id
      AND  (p_cursor IS NULL OR n.id < p_cursor)
    ORDER BY n.id DESC
    LIMIT  p_limit;
$$;
