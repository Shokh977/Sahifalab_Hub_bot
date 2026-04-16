-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 046: Seed connections table from existing follows data
-- Safe to run multiple times (ON CONFLICT DO NOTHING).
-- The follows table is kept untouched — this only adds rows to connections.
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Conversion rules:
--   Mutual follow  (A→B AND B→A)   → accepted connection (A < B deduplication)
--   One-way follow (A→B, no B→A)   → pending  connection (A is requester)
--
-- The connections.uq_connection UNIQUE (requester_id, receiver_id) means only
-- ONE direction can be stored per pair, so accepted mutual rows are inserted
-- only once using the requester_id < receiver_id guard.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Mutual follows → accepted connections ──────────────────────────────────
INSERT INTO public.connections (requester_id, receiver_id, status, accepted_at, created_at)
SELECT
    f1.follower_id,
    f1.following_id,
    'accepted',
    LEAST(f1.created_at, f2.created_at),   -- use the older follow as the accepted_at
    LEAST(f1.created_at, f2.created_at)
FROM public.follows f1
JOIN public.follows f2
  ON f2.follower_id  = f1.following_id
 AND f2.following_id = f1.follower_id
-- Insert only once per pair (lower ID is requester)
WHERE f1.follower_id < f1.following_id
ON CONFLICT (requester_id, receiver_id) DO NOTHING;


-- ── 2. One-way follows → pending connections ──────────────────────────────────
INSERT INTO public.connections (requester_id, receiver_id, status, created_at)
SELECT
    f.follower_id,
    f.following_id,
    'pending',
    f.created_at
FROM public.follows f
WHERE NOT EXISTS (
    -- exclude mutual follows (already handled above)
    SELECT 1 FROM public.follows f2
    WHERE f2.follower_id  = f.following_id
      AND f2.following_id = f.follower_id
)
AND NOT EXISTS (
    -- skip if a connection row already exists in either direction
    SELECT 1 FROM public.connections c
    WHERE (c.requester_id = f.follower_id  AND c.receiver_id = f.following_id)
       OR (c.requester_id = f.following_id AND c.receiver_id = f.follower_id)
)
ON CONFLICT (requester_id, receiver_id) DO NOTHING;


-- ── 3. Verification ───────────────────────────────────────────────────────────
-- SELECT status, COUNT(*) FROM public.connections GROUP BY status;
-- SELECT COUNT(*) FROM public.follows;
-- SELECT COUNT(*) FROM public.connections;
-- -- Confirm no accepted connection lacks accepted_at
-- SELECT COUNT(*) FROM public.connections WHERE status = 'accepted' AND accepted_at IS NULL;

SELECT 'Migration 046 complete — follows converted to connections.' AS status;
