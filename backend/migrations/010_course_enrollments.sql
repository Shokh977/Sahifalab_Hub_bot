-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 010: course_enrollments table (Step 11)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Create table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id          serial       PRIMARY KEY,
  course_id   int          NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id  bigint       NOT NULL,  -- references profiles.telegram_id
  is_active   boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);

-- ── 2. Auto-update updated_at ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_enrollments_set_updated_at ON public.course_enrollments;
CREATE TRIGGER course_enrollments_set_updated_at
  BEFORE UPDATE ON public.course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 3. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course_id   ON public.course_enrollments (course_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_student_id  ON public.course_enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_is_active   ON public.course_enrollments (is_active);

-- ── 4. RLS policies ──────────────────────────────────────────────────────────
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_enrollments: anon read" ON public.course_enrollments;
CREATE POLICY "course_enrollments: anon read"
  ON public.course_enrollments FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "course_enrollments: anon insert" ON public.course_enrollments;
CREATE POLICY "course_enrollments: anon insert"
  ON public.course_enrollments FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "course_enrollments: anon update" ON public.course_enrollments;
CREATE POLICY "course_enrollments: anon update"
  ON public.course_enrollments FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "course_enrollments: anon delete" ON public.course_enrollments;
CREATE POLICY "course_enrollments: anon delete"
  ON public.course_enrollments FOR DELETE TO anon USING (true);

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT * FROM public.course_enrollments ORDER BY id DESC LIMIT 20;
