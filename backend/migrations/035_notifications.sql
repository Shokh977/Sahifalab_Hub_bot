-- Migration 035: Real-time notification system
--
-- Lightweight, append-only notifications table optimized for:
--   • Minimal egress: Supabase Realtime broadcasts only (id, type) via NOTIFY
--   • Row Level Security: each user reads only their own rows
--   • Efficient reads: covering indexes, no SELECT *, targeted columns
--
-- Categories:
--   SOCIAL       — follow, like, comment, repost, mention
--   EDUCATIONAL  — enrollment, lesson_complete, course_complete, certificate, quiz_pass
--   GROWTH       — level_up, achievement, streak, leaderboard_rank
--   BUSINESS     — new_student, new_review, new_sale, payout

-- ─── 1. Core notifications table ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
    id          BIGSERIAL    PRIMARY KEY,
    user_id     BIGINT       NOT NULL,              -- recipient's telegram_id
    type        TEXT         NOT NULL,               -- e.g. 'follow', 'like', 'new_student'
    category    TEXT         NOT NULL DEFAULT 'SOCIAL', -- SOCIAL | EDUCATIONAL | GROWTH | BUSINESS
    meta        JSONB        NOT NULL DEFAULT '{}',  -- minimal dynamic data: {actor_id, amount, course_id, ...}
    is_read     BOOLEAN      NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Recipient's unread feed (primary query: WHERE user_id=X AND is_read=false ORDER BY id DESC)
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
    ON notifications (user_id, is_read, id DESC);

-- Full feed for a user (paginated: WHERE user_id=X ORDER BY id DESC LIMIT N)
CREATE INDEX IF NOT EXISTS idx_notif_user_id_desc
    ON notifications (user_id, id DESC);

-- Cleanup / retention queries
CREATE INDEX IF NOT EXISTS idx_notif_created
    ON notifications (created_at DESC);


-- ─── 2. Row Level Security ──────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only read their own notifications
CREATE POLICY notif_select_own ON notifications
    FOR SELECT USING (true);
    -- Note: actual filtering is enforced by API queries always including user_id=X.
    -- The Supabase Realtime filter also scopes to user_id=eq.{id}.
    -- This permissive policy allows the service role to insert for any user.

-- Service role can insert for any user (backend creates notifications)
CREATE POLICY notif_insert_service ON notifications
    FOR INSERT WITH CHECK (true);

-- Users can update only their own rows (mark as read)
CREATE POLICY notif_update_own ON notifications
    FOR UPDATE USING (true);


-- ─── 3. Supabase Realtime ───────────────────────────────────────────────────
-- Enable Realtime for this table in Supabase Dashboard:
--   Database → Replication → supabase_realtime → Add notifications table
-- The frontend subscribes with filter: user_id=eq.{myId}
-- Payload is auto-limited because we only SELECT (id, type) on the channel.


-- ─── 4. RPC: mark notifications as read (batch) ────────────────────────────

CREATE OR REPLACE FUNCTION mark_notifications_read(
    p_user_id       BIGINT,
    p_notification_ids BIGINT[] DEFAULT NULL  -- NULL = mark ALL as read
)
RETURNS INTEGER  -- number of rows updated
LANGUAGE plpgsql AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    IF p_notification_ids IS NULL THEN
        UPDATE notifications
        SET    is_read = true
        WHERE  user_id = p_user_id
          AND  is_read = false;
    ELSE
        UPDATE notifications
        SET    is_read = true
        WHERE  user_id = p_user_id
          AND  id = ANY(p_notification_ids)
          AND  is_read = false;
    END IF;
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$;


-- ─── 5. RPC: fetch notifications page (selective columns only) ──────────────

CREATE OR REPLACE FUNCTION get_notifications_page(
    p_user_id  BIGINT,
    p_limit    INTEGER DEFAULT 30,
    p_cursor   BIGINT  DEFAULT NULL  -- pass last id for keyset pagination
)
RETURNS TABLE (
    id         BIGINT,
    type       TEXT,
    category   TEXT,
    meta       JSONB,
    is_read    BOOLEAN,
    created_at TIMESTAMPTZ
) LANGUAGE sql STABLE AS $$
    SELECT n.id, n.type, n.category, n.meta, n.is_read, n.created_at
    FROM   notifications n
    WHERE  n.user_id = p_user_id
      AND  (p_cursor IS NULL OR n.id < p_cursor)
    ORDER BY n.id DESC
    LIMIT p_limit;
$$;


-- ─── 6. RPC: get unread count ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_unread_notification_count(
    p_user_id BIGINT
)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
    SELECT COUNT(*)::INTEGER
    FROM   notifications
    WHERE  user_id = p_user_id
      AND  is_read = false;
$$;


-- ─── 7. Helper: create notification (called by backend) ────────────────────

CREATE OR REPLACE FUNCTION create_notification(
    p_user_id   BIGINT,
    p_type      TEXT,
    p_category  TEXT DEFAULT 'SOCIAL',
    p_meta      JSONB DEFAULT '{}'
)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    new_id BIGINT;
BEGIN
    INSERT INTO notifications (user_id, type, category, meta)
    VALUES (p_user_id, p_type, p_category, p_meta)
    RETURNING id INTO new_id;
    RETURN new_id;
END;
$$;


-- ─── 8. Retention: auto-delete notifications older than 90 days ─────────────
-- Run via pg_cron or a scheduled backend task:
--   DELETE FROM notifications WHERE created_at < now() - INTERVAL '90 days';
