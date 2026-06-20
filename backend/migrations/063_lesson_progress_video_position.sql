-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 063: Add video_position to lesson_progress
-- Allows the mobile app to resume video from where the user left off.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.lesson_progress
  ADD COLUMN IF NOT EXISTS video_position int NOT NULL DEFAULT 0;

-- ── Verification ──────────────────────────────────────────────────────────────
-- SELECT lesson_id, student_id, is_completed, video_position
-- FROM public.lesson_progress
-- ORDER BY updated_at DESC LIMIT 10;
