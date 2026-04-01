-- Migration 013: Teacher application form fields + Email auth columns
-- Run this in Supabase SQL Editor

-- ── 1. Add application form fields to teacher_profiles ─────────────────────
ALTER TABLE public.teacher_profiles
  ADD COLUMN IF NOT EXISTS course_idea TEXT,
  ADD COLUMN IF NOT EXISTS motivation  TEXT,
  ADD COLUMN IF NOT EXISTS applied_at  TIMESTAMPTZ DEFAULT NOW();

-- ── 2. Add email / password_hash to profiles for email-based auth ──────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Index for fast email lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);

-- ── Done ────────────────────────────────────────────────────────────────────
-- After running this migration, update your backend to:
--  1. Accept course_idea + motivation in POST /api/auth/apply-teacher
--  2. Return them in GET /api/auth/admin/teacher-requests
--  3. Use email/password_hash in POST /api/auth/email-register and /email-login
