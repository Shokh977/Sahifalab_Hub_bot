-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 016: add FK from course_ratings.student_id → profiles.telegram_id
--
-- Migration 015 created course_ratings with student_id as a bare bigint
-- (comment only, no real constraint).  PostgREST needs an actual FK to resolve
-- the nested-select syntax  profiles(first_name, username, photo_url).
-- Without this FK, GET /api/courses/{id}/reviews returns PGRST200.
--
-- Run once in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- profiles.telegram_id is already UNIQUE NOT NULL (from supabase_schema.sql),
-- so it qualifies as a FK target.

ALTER TABLE public.course_ratings
  ADD CONSTRAINT IF NOT EXISTS fk_course_ratings_student
    FOREIGN KEY (student_id)
    REFERENCES public.profiles (telegram_id)
    ON DELETE CASCADE;

-- After running this, Supabase PostgREST must reload its schema cache.
-- Either wait ~5 min, or go to:
--   Supabase Dashboard → API → Schema Cache → "Reload schema"
-- OR call the reload endpoint (requires service_role key):
--   POST https://<project>.supabase.co/rest/v1/rpc/pg_notify
-- The easiest: just wait a few minutes after running the migration.
