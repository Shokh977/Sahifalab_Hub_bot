-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 018: add lesson_type and section_title columns to lessons
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- lesson_type    → 'video' | 'material' | 'quiz'  (default 'video' for existing rows)
-- section_title  → Display name of the module/section this lesson belongs to
--                  (e.g. "1 - modul").  Empty string = ungrouped.

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS lesson_type    text NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS section_title  text NOT NULL DEFAULT '';

-- ── Verification ──────────────────────────────────────────────────────────────
-- SELECT id, title, lesson_type, section_title FROM public.lessons LIMIT 10;
