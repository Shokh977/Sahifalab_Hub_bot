-- ══════════════════════════════════════════════════════════════════════════════
-- SAHIFALAB Hub — User Profiles & Gamification Schema
-- Run this once in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Profiles table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_id        bigint      UNIQUE NOT NULL,
  first_name         text        NOT NULL DEFAULT '',
  username           text,
  total_xp           int         NOT NULL DEFAULT 0,
  focus_seconds      int         NOT NULL DEFAULT 0,
  level              int         NOT NULL DEFAULT 1,
  quizzes_completed  int         NOT NULL DEFAULT 0,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

COMMENT ON TABLE public.profiles IS
  'One row per Telegram user. Level = floor(sqrt(total_xp / 100)) + 1';
COMMENT ON COLUMN public.profiles.total_xp IS
  '+10 XP per 5 min focus, +20 XP per correct quiz answer, +100 XP for 100% quiz';
COMMENT ON COLUMN public.profiles.focus_seconds IS
  'Cumulative active focus seconds (excludes break time)';

-- ── 2. Auto-update updated_at ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Performance index for leaderboard (top-N by XP) ──────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_xp_desc
  ON public.profiles (total_xp DESC);

-- ── 4. Enable Row Level Security ─────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ── 5. RLS Policies ──────────────────────────────────────────────────────────

-- 5a. Anyone (anon) can read all profiles → needed for the leaderboard
DROP POLICY IF EXISTS "profiles: public read" ON public.profiles;
CREATE POLICY "profiles: public read"
  ON public.profiles
  FOR SELECT
  TO anon
  USING (true);

-- 5b. Anon can insert a new profile (first visit / new user)
DROP POLICY IF EXISTS "profiles: anon insert" ON public.profiles;
CREATE POLICY "profiles: anon insert"
  ON public.profiles
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- 5c. Anon can update profiles (app logic guarantees only own row)
DROP POLICY IF EXISTS "profiles: anon update" ON public.profiles;
CREATE POLICY "profiles: anon update"
  ON public.profiles
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- Helpful verification queries (run after applying the schema)
-- ══════════════════════════════════════════════════════════════════════════════
-- SELECT * FROM public.profiles ORDER BY total_xp DESC LIMIT 10;
-- SELECT count(*) FROM public.profiles;
