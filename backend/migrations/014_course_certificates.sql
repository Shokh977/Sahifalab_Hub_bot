-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 014: course_certificates table (Step 18)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Create table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_certificates (
  id                 serial       PRIMARY KEY,
  course_id          int          NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id         bigint       NOT NULL, -- references profiles.telegram_id
  certificate_id     text         NOT NULL,
  total_lessons      int          NOT NULL DEFAULT 0,
  completed_lessons  int          NOT NULL DEFAULT 0,
  issued_at          timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id),
  UNIQUE (certificate_id)
);

-- ── 2. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_course_certificates_student_id ON public.course_certificates (student_id);
CREATE INDEX IF NOT EXISTS idx_course_certificates_course_id  ON public.course_certificates (course_id);
CREATE INDEX IF NOT EXISTS idx_course_certificates_issued_at  ON public.course_certificates (issued_at DESC);

-- ── 3. RLS policies ──────────────────────────────────────────────────────────
ALTER TABLE public.course_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_certificates: anon read" ON public.course_certificates;
CREATE POLICY "course_certificates: anon read"
  ON public.course_certificates FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "course_certificates: anon insert" ON public.course_certificates;
CREATE POLICY "course_certificates: anon insert"
  ON public.course_certificates FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "course_certificates: anon update" ON public.course_certificates;
CREATE POLICY "course_certificates: anon update"
  ON public.course_certificates FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT * FROM public.course_certificates ORDER BY issued_at DESC LIMIT 20;
