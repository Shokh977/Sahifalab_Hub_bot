-- Migration 056: Fix double-counted followers_count / following_count
--
-- Root cause: migration 030 created the sync_follower_counts trigger which
-- fires on every INSERT/DELETE in the follows table. The application code in
-- social_service.py and connections.py was *also* manually incrementing the
-- same columns, so every follow/unfollow was counted twice.
--
-- This migration recalculates all three counts from the source-of-truth tables.
-- After this runs, only the DB trigger maintains followers/following counts;
-- connections_count continues to be maintained at app level.

UPDATE profiles p
SET
    followers_count = (
        SELECT COUNT(*)
        FROM   follows
        WHERE  following_id = p.telegram_id
    ),
    following_count = (
        SELECT COUNT(*)
        FROM   follows
        WHERE  follower_id = p.telegram_id
    ),
    connections_count = (
        SELECT COUNT(*)
        FROM   connections
        WHERE  (requester_id = p.telegram_id OR receiver_id = p.telegram_id)
          AND  status = 'accepted'
    );
