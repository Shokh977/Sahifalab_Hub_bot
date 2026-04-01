-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 015: course_ratings table + auto-update courses.rating (Step 19)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Ensure courses.rating column exists ───────────────────────────────────
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS rating numeric(3,2) NOT NULL DEFAULT 0.00;

-- ── 2. Create course_ratings table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.course_ratings (
  id          serial       PRIMARY KEY,
  course_id   int          NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id  bigint       NOT NULL, -- references profiles.telegram_id
  rating      smallint     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review      text         NOT NULL DEFAULT '',
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);

-- ── 3. Auto-update updated_at ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_ratings_set_updated_at ON public.course_ratings;
CREATE TRIGGER course_ratings_set_updated_at
  BEFORE UPDATE ON public.course_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Trigger to keep courses.rating as average of all ratings ──────────────
CREATE OR REPLACE FUNCTION public.refresh_course_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.courses
  SET rating = COALESCE((
    SELECT ROUND(AVG(r.rating)::numeric, 2)
    FROM public.course_ratings r
    WHERE r.course_id = COALESCE(NEW.course_id, OLD.course_id)
  ), 0.00)
  WHERE id = COALESCE(NEW.course_id, OLD.course_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_course_rating ON public.course_ratings;
CREATE TRIGGER trg_refresh_course_rating
  AFTER INSERT OR UPDATE OR DELETE ON public.course_ratings
  FOR EACH ROW EXECUTE FUNCTION public.refresh_course_rating();

-- ── 5. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_course_ratings_course_id  ON public.course_ratings (course_id);
CREATE INDEX IF NOT EXISTS idx_course_ratings_student_id ON public.course_ratings (student_id);

-- ── 6. RLS policies ──────────────────────────────────────────────────────────
ALTER TABLE public.course_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_ratings: anon read"   ON public.course_ratings;
CREATE POLICY "course_ratings: anon read"
  ON public.course_ratings FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "course_ratings: anon insert" ON public.course_ratings;
CREATE POLICY "course_ratings: anon insert"
  ON public.course_ratings FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "course_ratings: anon update" ON public.course_ratings;
CREATE POLICY "course_ratings: anon update"
  ON public.course_ratings FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- ── Verification ─────────────────────────────────────────────────────────────
-- SELECT cr.*, p.first_name FROM public.course_ratings cr
-- LEFT JOIN public.profiles p ON p.telegram_id = cr.student_id
-- ORDER BY cr.created_at DESC LIMIT 20;
