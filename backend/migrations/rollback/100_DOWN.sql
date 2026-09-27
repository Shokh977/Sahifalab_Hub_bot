-- 100_DOWN.sql — undo 100_notifications_broadcast.sql: drop the broadcast
-- triggers and put the tables back into the postgres_changes publication.
-- Only needed if reverting the clients to postgres_changes subscriptions.

DROP TRIGGER IF EXISTS notifications_broadcast_insert ON public.notifications;
DROP TRIGGER IF EXISTS notifications_broadcast_read   ON public.notifications;
DROP FUNCTION IF EXISTS public.broadcast_notification_change();

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['notifications', 'direct_messages', 'conversations'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END;
$$;
