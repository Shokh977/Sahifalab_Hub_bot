-- Migration 050: Enable Supabase Realtime for direct_messages table
--
-- The SlouthMessenger already subscribes to per-conversation Realtime events.
-- This migration makes it explicit and also enables the global watcher used
-- by GlobalMessagingWatcher.tsx for the sidebar unread badge + toast.
--
-- If direct_messages is already in the supabase_realtime publication this
-- statement will succeed silently (IF NOT EXISTS logic).

DO $$
BEGIN
  -- Add to realtime publication if not already a member
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'direct_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
  END IF;
END
$$;
