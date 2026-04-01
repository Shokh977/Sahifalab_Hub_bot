-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 011: course_payment_orders table (Step 12)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.course_payment_orders (
  id                        serial        PRIMARY KEY,
  order_id                  text          NOT NULL UNIQUE,
  course_id                 int           NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  student_id                bigint        NOT NULL, -- references profiles.telegram_id
  provider                  text          NOT NULL DEFAULT 'telegram_stars'
                                        CHECK (provider IN ('telegram_stars')),
  amount                    int           NOT NULL,
  currency                  text          NOT NULL DEFAULT 'XTR',
  status                    text          NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending','completed','failed','cancelled')),
  provider_transaction_id   text,
  created_at                timestamptz   NOT NULL DEFAULT now(),
  completed_at              timestamptz,
  updated_at                timestamptz   NOT NULL DEFAULT now()
);

-- Ensure set_updated_at() exists
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS course_payment_orders_set_updated_at ON public.course_payment_orders;
CREATE TRIGGER course_payment_orders_set_updated_at
  BEFORE UPDATE ON public.course_payment_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_course_payment_orders_course_id   ON public.course_payment_orders (course_id);
CREATE INDEX IF NOT EXISTS idx_course_payment_orders_student_id  ON public.course_payment_orders (student_id);
CREATE INDEX IF NOT EXISTS idx_course_payment_orders_status      ON public.course_payment_orders (status);
CREATE INDEX IF NOT EXISTS idx_course_payment_orders_order_id    ON public.course_payment_orders (order_id);

ALTER TABLE public.course_payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_payment_orders: anon read" ON public.course_payment_orders;
CREATE POLICY "course_payment_orders: anon read"
  ON public.course_payment_orders FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "course_payment_orders: anon insert" ON public.course_payment_orders;
CREATE POLICY "course_payment_orders: anon insert"
  ON public.course_payment_orders FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "course_payment_orders: anon update" ON public.course_payment_orders;
CREATE POLICY "course_payment_orders: anon update"
  ON public.course_payment_orders FOR UPDATE TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "course_payment_orders: anon delete" ON public.course_payment_orders;
CREATE POLICY "course_payment_orders: anon delete"
  ON public.course_payment_orders FOR DELETE TO anon USING (true);

-- Verification
-- SELECT * FROM public.course_payment_orders ORDER BY id DESC LIMIT 20;
