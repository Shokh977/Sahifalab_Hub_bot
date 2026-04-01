-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 006 — teacher_profiles table
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- One row per approved teacher.
-- Counters (total_courses, total_students, total_earnings, rating) are updated
-- by the backend whenever course/enrollment/payment events occur.

CREATE TABLE IF NOT EXISTS public.teacher_profiles (
  id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id     bigint        UNIQUE NOT NULL,          -- FK to profiles.telegram_id
  bio             text,                                    -- short teacher bio
  specialization  text,                                    -- e.g. "Python, Data Science"
  avatar_url      text,                                    -- overrides profiles.photo_url if set
  social_links    jsonb         NOT NULL DEFAULT '{}'::jsonb, -- { "telegram": "@...", "github": "...", ... }

  -- Denormalized counters — updated by backend triggers / service layer
  total_courses   int           NOT NULL DEFAULT 0,
  total_students  int           NOT NULL DEFAULT 0,
  total_earnings  numeric(14,2) NOT NULL DEFAULT 0.00,    -- cumulative net earnings (UZS)
  rating          numeric(3,2)  NOT NULL DEFAULT 0.00,    -- avg course rating 0.00–5.00

  is_verified     boolean       NOT NULL DEFAULT false,   -- manually set by admin

  created_at      timestamptz   DEFAULT now(),
  updated_at      timestamptz   DEFAULT now()
);

-- Auto-update updated_at (reuses the function created in migration 001)
DROP TRIGGER IF EXISTS teacher_profiles_set_updated_at ON public.teacher_profiles;
CREATE TRIGGER teacher_profiles_set_updated_at
  BEFORE UPDATE ON public.teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_teacher_profiles_telegram
  ON public.teacher_profiles (telegram_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;

-- Public can read all teacher profiles (needed for course listing pages)
DROP POLICY IF EXISTS "teacher_profiles: public read" ON public.teacher_profiles;
CREATE POLICY "teacher_profiles: public read"
  ON public.teacher_profiles
  FOR SELECT
  TO anon
  USING (true);

-- Writes go through the backend service-role key which bypasses RLS.
-- No anon write policy is needed.
