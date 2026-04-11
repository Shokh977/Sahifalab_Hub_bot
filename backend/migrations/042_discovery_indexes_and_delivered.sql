-- ══════════════════════════════════════════════════════════════════════════════
-- 042_discovery_indexes_and_delivered.sql
--
-- 1. Index profiles.level  — needed for Discover page ORDER BY level DESC
--    (profiles.total_xp already has idx_profiles_xp_desc from supabase_schema.sql)
-- 2. Add is_delivered column to direct_messages — enables Sent→Delivered→Read
--    delivery status in the messenger.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Level index ────────────────────────────────────────────────────────────
-- Discover page sorts by XP (total_xp) descending; level is used for display
-- and badge checks. Both columns should be covered by an index.
CREATE INDEX IF NOT EXISTS idx_profiles_level_desc
    ON public.profiles (level DESC);

-- Composite cover index: xp + level together speeds up leaderboard + discover
-- queries that SELECT level alongside ORDER BY total_xp.
CREATE INDEX IF NOT EXISTS idx_profiles_xp_level
    ON public.profiles (total_xp DESC, level DESC);

-- ── 2. Delivery status on direct_messages ────────────────────────────────────
-- is_delivered = TRUE once the recipient opens the conversation (ChatView mount)
-- is_read      = TRUE once all messages have been scrolled past / ack'd
ALTER TABLE public.direct_messages
    ADD COLUMN IF NOT EXISTS is_delivered BOOLEAN NOT NULL DEFAULT FALSE;

-- Back-fill: treat every already-read message as also delivered
UPDATE public.direct_messages
    SET is_delivered = TRUE
    WHERE is_read = TRUE;

-- Index to speed up the mark_delivered UPDATE
CREATE INDEX IF NOT EXISTS idx_dm_undelivered
    ON public.direct_messages (conversation_id, is_delivered)
    WHERE is_delivered = FALSE;
