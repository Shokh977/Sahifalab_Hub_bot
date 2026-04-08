-- Migration 037: Notification performance indexes
--
-- Optimizations:
--   1. Partial index for fast unread count lookups
--   2. Lightweight RPC that returns ONLY a count integer (saves egress)
--   3. Composite index for user+read status queries

-- ─── 1. Partial index for unread notifications (most common query) ───────────
-- This drastically speeds up: SELECT COUNT(*) WHERE user_id=X AND is_read=false
CREATE INDEX IF NOT EXISTS idx_notif_user_unread_partial
    ON notifications (user_id)
    WHERE is_read = false;

-- ─── 2. Covering index for recipient + read status ─────────────────────────
-- Used by mark_notifications_read and filtered feeds
CREATE INDEX IF NOT EXISTS idx_notif_user_isread
    ON notifications (user_id, is_read);

-- ─── 3. Lightweight RPC: returns only a single integer ─────────────────────
-- Avoids returning full notification objects just to count them.
-- The partial index above makes this nearly instant.
CREATE OR REPLACE FUNCTION get_unread_count_fast(p_user_id BIGINT)
RETURNS INTEGER
LANGUAGE sql STABLE
SECURITY DEFINER
AS $$
    SELECT COALESCE(COUNT(*)::INTEGER, 0)
    FROM   notifications
    WHERE  user_id = p_user_id
      AND  is_read = false;
$$;
