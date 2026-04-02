-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 017: add material_url and material_name columns to lessons
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- material_url  → CDN URL of the PDF / resource file attached to the lesson
-- material_name → Display name shown to students (e.g. "Dars materiallari.pdf")

ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS material_url  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS material_name text NOT NULL DEFAULT '';

-- ── Verification ──────────────────────────────────────────────────────────────
-- SELECT id, title, material_url, material_name FROM public.lessons LIMIT 10;
