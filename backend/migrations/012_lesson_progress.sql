-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 012: lesson_progress table (Step 14)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id           serial       PRIMARY KEY,
  course_id    int          NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  lesson_id    int          NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  student_id   bigint       NOT NULL, -- references profiles.telegram_id
  is_completed boolean      NOT NULL DEFAULT true,
  completed_at timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, student_id)
);

-- Ensure set_updated_at() exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lesson_progress_set_updated_at ON public.lesson_progress;
CREATE TRIGGER lesson_progress_set_updated_at
  BEFORE UPDATE ON public.lesson_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_lesson_progress_course_id      ON public.lesson_progress (course_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_lesson_id      ON public.lesson_progress (lesson_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_student_id     ON public.lesson_progress (student_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_is_completed   ON public.lesson_progress (is_completed);

ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lesson_progress: anon read" ON public.lesson_progress;
CREATE POLICY "lesson_progress: anon read"
  ON public.lesson_progress FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "lesson_progress: anon insert" ON public.lesson_progress;
CREATE POLICY "lesson_progress: anon insert"
  ON public.lesson_progress FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "lesson_progress: anon update" ON public.lesson_progress;
CREATE POLICY "lesson_progress: anon update"
  ON public.lesson_progress FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lesson_progress: anon delete" ON public.lesson_progress;
CREATE POLICY "lesson_progress: anon delete"
  ON public.lesson_progress FOR DELETE TO anon USING (true);

-- Verification
-- SELECT * FROM public.lesson_progress ORDER BY id DESC LIMIT 20;
