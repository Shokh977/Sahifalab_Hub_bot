-- 049_connections_count_follow_sync.sql
-- Add connections_count to profiles and resync all three counters
-- from the live connections / follows tables.

-- 1. Add connections_count (idempotent)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS connections_count INTEGER NOT NULL DEFAULT 0;

-- 2. Resync connections_count from the connections table
UPDATE profiles
SET connections_count = (
    SELECT COUNT(*)
    FROM connections
    WHERE (requester_id = profiles.telegram_id OR receiver_id = profiles.telegram_id)
      AND status = 'accepted'
);

-- 3. Resync followers_count from the follows table
UPDATE profiles
SET followers_count = (
    SELECT COUNT(*) FROM follows WHERE following_id = profiles.telegram_id
);

-- 4. Resync following_count from the follows table
UPDATE profiles
SET following_count = (
    SELECT COUNT(*) FROM follows WHERE follower_id = profiles.telegram_id
);
