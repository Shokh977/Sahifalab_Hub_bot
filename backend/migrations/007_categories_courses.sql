-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 007: categories + courses tables
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Ensure set_updated_at() exists ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ── 2. Categories table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id          serial       PRIMARY KEY,
  name        text         NOT NULL UNIQUE,
  slug        text         NOT NULL UNIQUE,
  icon        text         NOT NULL DEFAULT '📚',
  sort_order  int          NOT NULL DEFAULT 0,
  created_at  timestamptz  DEFAULT now()
);

-- Seed default categories (safe to run multiple times)
INSERT INTO public.categories (name, slug, icon, sort_order) VALUES
  ('Dasturlash',          'programming',   '💻', 1),
  ('Tillar',              'languages',     '🌐', 2),
  ('Matematika',          'math',          '📐', 3),
  ('Fan',                 'science',       '🔬', 4),
  ('Biznes',              'business',      '💼', 5),
  ('Shaxsiy rivojlanish', 'personal-dev',  '🌱', 6),
  ('Dizayn',              'design',        '🎨', 7),
  ('Boshqa',              'other',         '📦', 8)
ON CONFLICT (slug) DO NOTHING;

-- ── 3. Courses table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.courses (
  id                      serial          PRIMARY KEY,
  teacher_id              bigint          NOT NULL,  -- references profiles.telegram_id
  category_id             int             REFERENCES public.categories(id) ON DELETE SET NULL,
  title                   text            NOT NULL,
  slug                    text            NOT NULL UNIQUE,
  description             text            NOT NULL DEFAULT '',
  thumbnail_url           text            NOT NULL DEFAULT '',
  price                   numeric(14,2)   NOT NULL DEFAULT 0,
  is_paid                 boolean         NOT NULL DEFAULT false,
  is_published            boolean         NOT NULL DEFAULT false,
  level                   text            NOT NULL DEFAULT 'beginner'
                            CHECK (level IN ('beginner','intermediate','advanced')),
  language                text            NOT NULL DEFAULT 'uz',
  total_lessons           int             NOT NULL DEFAULT 0,
  total_duration_minutes  int             NOT NULL DEFAULT 0,
  enrolled_count          int             NOT NULL DEFAULT 0,
  rating                  numeric(3,2)    NOT NULL DEFAULT 0,
  created_at              timestamptz     DEFAULT now(),
  updated_at              timestamptz     DEFAULT now()
);

-- ── 4. Auto-update updated_at on courses ──────────────────────────────────────
DROP TRIGGER IF EXISTS courses_set_updated_at ON public.courses;
CREATE TRIGGER courses_set_updated_at
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_courses_teacher_id    ON public.courses (teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_category_id   ON public.courses (category_id);
CREATE INDEX IF NOT EXISTS idx_courses_is_published  ON public.courses (is_published);
CREATE INDEX IF NOT EXISTS idx_courses_slug          ON public.courses (slug);

-- ── 6. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses    ENABLE ROW LEVEL SECURITY;

-- Categories: public read
DROP POLICY IF EXISTS "categories: public read" ON public.categories;
CREATE POLICY "categories: public read"
  ON public.categories FOR SELECT TO anon USING (true);

-- Courses: public can read published courses
DROP POLICY IF EXISTS "courses: public read published" ON public.courses;
CREATE POLICY "courses: public read published"
  ON public.courses FOR SELECT TO anon USING (is_published = true);

-- Courses: anon can also read own (unpublished) courses — backend filters by teacher_id
DROP POLICY IF EXISTS "courses: anon read all" ON public.courses;
CREATE POLICY "courses: anon read all"
  ON public.courses FOR SELECT TO anon USING (true);

-- Courses: anon insert (backend validates JWT + teacher role before calling Supabase)
DROP POLICY IF EXISTS "courses: anon insert" ON public.courses;
CREATE POLICY "courses: anon insert"
  ON public.courses FOR INSERT TO anon WITH CHECK (true);

-- Courses: anon update (backend validates ownership)
DROP POLICY IF EXISTS "courses: anon update" ON public.courses;
CREATE POLICY "courses: anon update"
  ON public.courses FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Courses: anon delete (backend validates ownership)
DROP POLICY IF EXISTS "courses: anon delete" ON public.courses;
CREATE POLICY "courses: anon delete"
  ON public.courses FOR DELETE TO anon USING (true);

-- ── 7. Verification ───────────────────────────────────────────────────────────
-- SELECT * FROM public.categories ORDER BY sort_order;
-- SELECT count(*) FROM public.courses;
