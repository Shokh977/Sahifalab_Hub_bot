-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 045: Bunny Stream video support
--
-- Adds bunny_video_id column to lessons table to store the Bunny Stream GUID.
-- When this column is populated, the system uses Bunny Stream for adaptive
-- HLS streaming instead of direct MP4 CDN delivery.
--
-- Backward-compatible: existing lessons with video_url (direct CDN) continue
-- to work; new uploads go through Bunny Stream and populate bunny_video_id.
-- ──────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════
-- 1. Add bunny_video_id column to lessons
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS bunny_video_id text;

COMMENT ON COLUMN public.lessons.bunny_video_id IS
  'Bunny Stream video GUID. When set, the system uses Bunny Stream iframe embed '
  'with signed URLs instead of direct CDN .mp4 delivery. Format: UUID-like string '
  'e.g. "eb1c4f77-0cda-46be-b47d-1118ad7c2ffe"';


-- ═══════════════════════════════════════════════════════════════════
-- 2. Index for quick lookups by video ID
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_lessons_bunny_video_id
  ON public.lessons (bunny_video_id)
  WHERE bunny_video_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════
-- 3. Add encoding_status column for tracking transcoding progress
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS encoding_status text DEFAULT 'none';

COMMENT ON COLUMN public.lessons.encoding_status IS
  'Bunny Stream transcoding status: none | created | uploaded | processing | '
  'transcoding | finished | error | upload_failed. Polled by frontend to show '
  'progress while video is being transcoded.';
