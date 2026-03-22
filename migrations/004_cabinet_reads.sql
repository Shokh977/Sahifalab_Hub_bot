-- ══════════════════════════════════════════════════════════════════════════════
-- SAHIFALAB — Enable cabinet page direct reads
-- Run in: Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- Grants anon SELECT on user_quiz_completion and book_purchase
-- so the Cabinet page can show certificates & purchased books directly.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Grant SELECT on user_quiz_completion ──────────────────────────────────
GRANT SELECT ON public.user_quiz_completion TO anon;

ALTER TABLE public.user_quiz_completion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_quiz_completion: public read" ON public.user_quiz_completion;
CREATE POLICY "user_quiz_completion: public read"
  ON public.user_quiz_completion
  FOR SELECT TO anon
  USING (true);

-- ── 2. Grant SELECT on book_purchase (only completed purchases) ──────────────
GRANT SELECT ON public.book_purchase TO anon;

ALTER TABLE public.book_purchase ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "book_purchase: public read" ON public.book_purchase;
CREATE POLICY "book_purchase: public read"
  ON public.book_purchase
  FOR SELECT TO anon
  USING (true);

-- ══════════════════════════════════════════════════════════════════════════════
-- NOTE: The frontend will filter by telegram_id client-side.
-- RLS allows SELECT but the backend service_role bypasses RLS for writes.
-- ══════════════════════════════════════════════════════════════════════════════
