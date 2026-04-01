-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 004 — User roles, status, and missing profile columns
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. New columns on profiles ───────────────────────────────────────────────

-- Role: 'student' (default) | 'teacher' | 'admin'
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student';

-- Account status: 'active' (default) | 'suspended' | 'pending'
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Profile photo from Telegram / Login Widget
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS photo_url text;

-- Timestamps set by the backend auth service
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_created_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS app_last_login timestamptz;

-- ── 2. CHECK constraints (act as lightweight enums) ──────────────────────────

-- Drop first so the migration is re-runnable (no-op if they don't exist yet)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('student', 'teacher', 'admin'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_status_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
    CHECK (status IN ('active', 'suspended', 'pending'));

-- ── 3. Indexes for role-based queries ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_role   ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles (status);

-- ── 4. Back-fill: mark the known admin account ───────────────────────────────
-- (Replace 807466591 with your own Telegram ID if different.)
UPDATE public.profiles
SET role = 'admin'
WHERE telegram_id = 807466591
  AND role = 'student';   -- only set if not already promoted

-- ── 5. Verification ──────────────────────────────────────────────────────────
-- SELECT telegram_id, first_name, role, status, photo_url, app_last_login
-- FROM public.profiles
-- ORDER BY created_at
-- LIMIT 20;
