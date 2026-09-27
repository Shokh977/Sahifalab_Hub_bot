-- 100_notifications_broadcast.sql — move in-app notifications off Supabase
-- Realtime "postgres_changes" and onto Realtime Broadcast; stop Realtime
-- polling the database entirely.
--
-- Why: postgres_changes makes Realtime poll realtime.list_changes() ~2x/sec,
-- forever, whenever any client is subscribed — 15.5M calls / ~26h of DB time
-- since April, and ~9 WAL write syscalls per poll even when nothing changed.
-- That was the single largest workload on the database and a steady drain on
-- the Disk IO budget (2026-09-27 investigation).
--
-- Broadcast-from-database instead: a trigger calls realtime.send(), which
-- writes one row to realtime.messages; Realtime streams it over its existing
-- logical-replication connection (no polling). Clients listen on the public
-- topic 'notif:<user_id>'.
--
-- Payload is deliberately minimal (id + is_read only). Public topics can be
-- joined by anyone holding the anon key, so the notification content is NOT
-- sent — the client fetches it through the authenticated backend
-- (GET /api/notifications/:id), which it already does for partial payloads.
--
-- Chat (direct_messages / conversations) is disabled in the clients for now,
-- so those tables leave the publication too. With the publication empty,
-- Realtime has nothing to poll — this also covers old app builds that still
-- try to subscribe with postgres_changes (their subscribe is rejected).
--
-- Safe to re-run. Rollback: rollback/100_DOWN.sql.

-- ── 1. Broadcast trigger ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_notification_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- realtime.send() already swallows its own errors (RAISE WARNING), so a
  -- Realtime hiccup can never roll back the notification insert/update.
  PERFORM realtime.send(
    jsonb_build_object('id', NEW.id, 'is_read', NEW.is_read),
    CASE WHEN TG_OP = 'INSERT' THEN 'notification_created' ELSE 'notification_updated' END,
    'notif:' || NEW.user_id::text,
    false
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notifications_broadcast_insert ON public.notifications;
CREATE TRIGGER notifications_broadcast_insert
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_notification_change();

-- Only when read-state actually flips — mark_notifications_read() may touch
-- rows that are already read.
DROP TRIGGER IF EXISTS notifications_broadcast_read ON public.notifications;
CREATE TRIGGER notifications_broadcast_read
  AFTER UPDATE OF is_read ON public.notifications
  FOR EACH ROW
  WHEN (OLD.is_read IS DISTINCT FROM NEW.is_read)
  EXECUTE FUNCTION public.broadcast_notification_change();

-- ── 2. Empty the postgres_changes publication ───────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notifications', 'direct_messages', 'conversations'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;
