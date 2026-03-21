-- ══════════════════════════════════════════════════════════════════════════════
-- SAHIFALAB — Enable direct Supabase reads for frontend performance
-- Run in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- This grants the anon role (used by the frontend Supabase JS client) 
-- read access to public tables. Writes still go through the Vercel backend.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Grant SELECT on all public read tables ────────────────────────────────

-- Books
GRANT SELECT ON public.book TO anon;

-- Quizzes (list)
GRANT SELECT ON public.quiz TO anon;

-- Quiz Questions — ONLY safe columns (NO correct_answer!)
-- We revoke full access first, then grant only specific columns.
REVOKE ALL ON public.quiz_question FROM anon;
GRANT SELECT (id, quiz_id, question, options, explanation, "order") ON public.quiz_question TO anon;

-- Hero content
GRANT SELECT ON public.hero_content TO anon;

-- Resources
GRANT SELECT ON public.resource TO anon;

-- Ambient sounds
GRANT SELECT ON public.ambient_sound TO anon;

-- Book ratings (read own rating)
GRANT SELECT ON public.book_rating TO anon;

-- ── 2. Enable RLS on sensitive tables ────────────────────────────────────────

-- Quiz questions: only allow reading safe columns (enforced above via column grants)
ALTER TABLE public.quiz_question ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quiz_question: public read" ON public.quiz_question;
CREATE POLICY "quiz_question: public read"
  ON public.quiz_question
  FOR SELECT TO anon
  USING (true);

-- Books: public read
ALTER TABLE public.book ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "book: public read" ON public.book;
CREATE POLICY "book: public read"
  ON public.book
  FOR SELECT TO anon
  USING (true);

-- Quiz: public read
ALTER TABLE public.quiz ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "quiz: public read" ON public.quiz;
CREATE POLICY "quiz: public read"
  ON public.quiz
  FOR SELECT TO anon
  USING (true);

-- Hero content: read active only
ALTER TABLE public.hero_content ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hero_content: public read" ON public.hero_content;
CREATE POLICY "hero_content: public read"
  ON public.hero_content
  FOR SELECT TO anon
  USING (true);

-- Resources: public read
ALTER TABLE public.resource ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "resource: public read" ON public.resource;
CREATE POLICY "resource: public read"
  ON public.resource
  FOR SELECT TO anon
  USING (true);

-- Ambient sounds: public read
ALTER TABLE public.ambient_sound ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ambient_sound: public read" ON public.ambient_sound;
CREATE POLICY "ambient_sound: public read"
  ON public.ambient_sound
  FOR SELECT TO anon
  USING (true);

-- Book ratings: public read
ALTER TABLE public.book_rating ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "book_rating: public read" ON public.book_rating;
CREATE POLICY "book_rating: public read"
  ON public.book_rating
  FOR SELECT TO anon
  USING (true);

-- ── 3. Backend service role bypasses RLS automatically ───────────────────────
-- The backend uses the service_role key, which bypasses RLS.
-- So backend writes (quiz verify, admin CRUD, payments) are unaffected.

-- ══════════════════════════════════════════════════════════════════════════════
-- IMPORTANT SECURITY NOTE:
-- correct_answer on quiz_question is protected via column-level GRANT.
-- Even if someone uses the anon key directly, they CANNOT read correct_answer.
-- Scoring MUST happen server-side via POST /api/quizzes/{id}/verify.
-- ══════════════════════════════════════════════════════════════════════════════
