-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 008: lessons table
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 0. Ensure set_updated_at() exists ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 1. Create lessons table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lessons (
  id               serial       PRIMARY KEY,
  course_id        int          NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title            text         NOT NULL,
  description      text         NOT NULL DEFAULT '',
  video_url        text         NOT NULL DEFAULT '',   -- Bunny.net CDN URL (step 10)
  duration_minutes int          NOT NULL DEFAULT 0,
  order_index      int          NOT NULL DEFAULT 0,    -- display order within course
  is_free          boolean      NOT NULL DEFAULT false, -- preview / teaser lesson
  created_at       timestamptz  DEFAULT now(),
  updated_at       timestamptz  DEFAULT now()
);

-- ── 2. Auto-update updated_at ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS lessons_set_updated_at ON public.lessons;
CREATE TRIGGER lessons_set_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lessons_course_id   ON public.lessons (course_id);
CREATE INDEX IF NOT EXISTS idx_lessons_order_index ON public.lessons (course_id, order_index);

-- ── 4. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- Public can read all lessons (video_url gated on enrollment in app logic)
DROP POLICY IF EXISTS "lessons: public read" ON public.lessons;
CREATE POLICY "lessons: public read"
  ON public.lessons FOR SELECT TO anon USING (true);

-- Anon insert / update / delete (backend validates JWT + ownership before calling Supabase)
DROP POLICY IF EXISTS "lessons: anon insert" ON public.lessons;
CREATE POLICY "lessons: anon insert"
  ON public.lessons FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "lessons: anon update" ON public.lessons;
CREATE POLICY "lessons: anon update"
  ON public.lessons FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lessons: anon delete" ON public.lessons;
CREATE POLICY "lessons: anon delete"
  ON public.lessons FOR DELETE TO anon USING (true);

-- ── 5. Verification ───────────────────────────────────────────────────────────
-- SELECT * FROM public.lessons LIMIT 5;
