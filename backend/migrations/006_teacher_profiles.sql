-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 006: teacher_profiles table
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Create table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_profiles (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id       bigint      UNIQUE NOT NULL,  -- FK to profiles.telegram_id
  bio               text        NOT NULL DEFAULT '',
  specialization    text        NOT NULL DEFAULT '',
  experience_years  int         NOT NULL DEFAULT 0,
  education         text        NOT NULL DEFAULT '',
  website_url       text        NOT NULL DEFAULT '',
  youtube_url       text        NOT NULL DEFAULT '',
  telegram_channel  text        NOT NULL DEFAULT '',  -- e.g. @channel_name
  profile_complete  boolean     NOT NULL DEFAULT false,

  -- Denormalised counters (updated by triggers or backend logic)
  total_students    int         NOT NULL DEFAULT 0,
  total_courses     int         NOT NULL DEFAULT 0,
  total_earnings    numeric(14,2) NOT NULL DEFAULT 0,   -- UZS
  commission_rate   numeric(4,2)  NOT NULL DEFAULT 0.70, -- 70%

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ── 2. Auto-update updated_at ─────────────────────────────────────────────────
-- Reuse the set_updated_at() function already defined by the profiles migration.
DROP TRIGGER IF EXISTS teacher_profiles_set_updated_at ON public.teacher_profiles;
CREATE TRIGGER teacher_profiles_set_updated_at
  BEFORE UPDATE ON public.teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Index for fast lookups ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_teacher_profiles_telegram_id
  ON public.teacher_profiles (telegram_id);

-- ── 4. Row Level Security ──────────────────────────────────────────────────────
ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone (anon) can read all teacher profiles (for public course/teacher pages)
DROP POLICY IF EXISTS "teacher_profiles: public read" ON public.teacher_profiles;
CREATE POLICY "teacher_profiles: public read"
  ON public.teacher_profiles FOR SELECT TO anon USING (true);

-- Anon can insert (backend uses anon key to create the first row on behalf of teacher)
DROP POLICY IF EXISTS "teacher_profiles: anon insert" ON public.teacher_profiles;
CREATE POLICY "teacher_profiles: anon insert"
  ON public.teacher_profiles FOR INSERT TO anon WITH CHECK (true);

-- Anon can update (backend validates ownership via JWT before calling Supabase)
DROP POLICY IF EXISTS "teacher_profiles: anon update" ON public.teacher_profiles;
CREATE POLICY "teacher_profiles: anon update"
  ON public.teacher_profiles FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── 5. Verification queries ───────────────────────────────────────────────────
-- SELECT * FROM public.teacher_profiles LIMIT 5;
-- SELECT count(*) FROM public.teacher_profiles;
