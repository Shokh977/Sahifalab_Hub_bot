-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 009: add video_source column to lessons
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- Add video_source column
-- 'youtube' → free/unlisted YouTube embed
-- 'bunny'   → Bunny.net CDN upload (paid / protected)
-- 'none'    → no video yet (text-only lesson)
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS video_source text NOT NULL DEFAULT 'bunny'
    CHECK (video_source IN ('youtube', 'bunny', 'none'));

-- Back-fill: lessons that already have a video_url get 'bunny',
--            lessons with empty video_url get 'none'
UPDATE public.lessons
  SET video_source = CASE
    WHEN video_url = '' OR video_url IS NULL THEN 'none'
    ELSE 'bunny'
  END;

-- ── Verification ──────────────────────────────────────────────────────────────
-- SELECT id, title, video_source, video_url FROM public.lessons LIMIT 10;
