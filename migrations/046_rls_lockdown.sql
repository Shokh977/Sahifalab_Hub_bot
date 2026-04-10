-- Migration 046: Lock down anon write policies on content & user tables
--
-- SECURITY FIX: The Supabase anon key is embedded in the frontend bundle.
-- Without RLS lockdown, anyone can use the anon key to INSERT/UPDATE/DELETE
-- directly via the Supabase REST API, bypassing backend authorization.
--
-- Pattern: Drop all anon write policies → add service_role ALL.
-- Tables with public-read data keep their anon SELECT policy.
-- Private tables (enrollments, progress, certificates) also block anon SELECT.
-- ──────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  1. course_enrollments (private — no anon access at all)               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "course_enrollments: anon all"    ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: anon select" ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: anon insert" ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: anon update" ON public.course_enrollments;
DROP POLICY IF EXISTS "course_enrollments: anon delete" ON public.course_enrollments;

DROP POLICY IF EXISTS "course_enrollments: service_role all" ON public.course_enrollments;
CREATE POLICY "course_enrollments: service_role all"
  ON public.course_enrollments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "course_enrollments: anon denied" ON public.course_enrollments;
CREATE POLICY "course_enrollments: anon denied"
  ON public.course_enrollments FOR SELECT TO anon
  USING (false);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  2. lesson_progress (private)                                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "lesson_progress: anon all"    ON public.lesson_progress;
DROP POLICY IF EXISTS "lesson_progress: anon select" ON public.lesson_progress;
DROP POLICY IF EXISTS "lesson_progress: anon insert" ON public.lesson_progress;
DROP POLICY IF EXISTS "lesson_progress: anon update" ON public.lesson_progress;
DROP POLICY IF EXISTS "lesson_progress: anon delete" ON public.lesson_progress;

DROP POLICY IF EXISTS "lesson_progress: service_role all" ON public.lesson_progress;
CREATE POLICY "lesson_progress: service_role all"
  ON public.lesson_progress FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "lesson_progress: anon denied" ON public.lesson_progress;
CREATE POLICY "lesson_progress: anon denied"
  ON public.lesson_progress FOR SELECT TO anon
  USING (false);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  3. course_certificates (private)                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "course_certificates: anon all"    ON public.course_certificates;
DROP POLICY IF EXISTS "course_certificates: anon select" ON public.course_certificates;
DROP POLICY IF EXISTS "course_certificates: anon insert" ON public.course_certificates;
DROP POLICY IF EXISTS "course_certificates: anon update" ON public.course_certificates;
DROP POLICY IF EXISTS "course_certificates: anon delete" ON public.course_certificates;

DROP POLICY IF EXISTS "course_certificates: service_role all" ON public.course_certificates;
CREATE POLICY "course_certificates: service_role all"
  ON public.course_certificates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "course_certificates: anon denied" ON public.course_certificates;
CREATE POLICY "course_certificates: anon denied"
  ON public.course_certificates FOR SELECT TO anon
  USING (false);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  4. lessons (public read, service-role write)                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "lessons: anon all"    ON public.lessons;
DROP POLICY IF EXISTS "lessons: anon insert" ON public.lessons;
DROP POLICY IF EXISTS "lessons: anon update" ON public.lessons;
DROP POLICY IF EXISTS "lessons: anon delete" ON public.lessons;
-- Keep: "lessons: anon select"

DROP POLICY IF EXISTS "lessons: service_role all" ON public.lessons;
CREATE POLICY "lessons: service_role all"
  ON public.lessons FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  5. courses (public read, service-role write)                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "courses: anon all"    ON public.courses;
DROP POLICY IF EXISTS "courses: anon insert" ON public.courses;
DROP POLICY IF EXISTS "courses: anon update" ON public.courses;
DROP POLICY IF EXISTS "courses: anon delete" ON public.courses;
-- Keep: "courses: anon select"

DROP POLICY IF EXISTS "courses: service_role all" ON public.courses;
CREATE POLICY "courses: service_role all"
  ON public.courses FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  6. profiles (public read, service-role write)                         ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "profiles: anon all"    ON public.profiles;
DROP POLICY IF EXISTS "profiles: anon insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles: anon update" ON public.profiles;
DROP POLICY IF EXISTS "profiles: anon delete" ON public.profiles;
-- Keep: "profiles: anon select"

DROP POLICY IF EXISTS "profiles: service_role all" ON public.profiles;
CREATE POLICY "profiles: service_role all"
  ON public.profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  7. teacher_profiles (public read, service-role write)                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "teacher_profiles: anon all"    ON public.teacher_profiles;
DROP POLICY IF EXISTS "teacher_profiles: anon insert" ON public.teacher_profiles;
DROP POLICY IF EXISTS "teacher_profiles: anon update" ON public.teacher_profiles;
DROP POLICY IF EXISTS "teacher_profiles: anon delete" ON public.teacher_profiles;
-- Keep: "teacher_profiles: anon select"

DROP POLICY IF EXISTS "teacher_profiles: service_role all" ON public.teacher_profiles;
CREATE POLICY "teacher_profiles: service_role all"
  ON public.teacher_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  8. course_ratings (public read, service-role write)                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

DROP POLICY IF EXISTS "course_ratings: anon all"    ON public.course_ratings;
DROP POLICY IF EXISTS "course_ratings: anon insert" ON public.course_ratings;
DROP POLICY IF EXISTS "course_ratings: anon update" ON public.course_ratings;
DROP POLICY IF EXISTS "course_ratings: anon delete" ON public.course_ratings;
-- Keep: "course_ratings: anon select"

DROP POLICY IF EXISTS "course_ratings: service_role all" ON public.course_ratings;
CREATE POLICY "course_ratings: service_role all"
  ON public.course_ratings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;
