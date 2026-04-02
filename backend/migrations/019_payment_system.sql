-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 019: Extend payment system for Click & Payme
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Expand course_payment_orders to accept click & payme providers
ALTER TABLE public.course_payment_orders
  DROP CONSTRAINT IF EXISTS course_payment_orders_provider_check;

ALTER TABLE public.course_payment_orders
  ADD CONSTRAINT course_payment_orders_provider_check
  CHECK (provider IN ('telegram_stars', 'click', 'payme'));

-- 2. Add price_uzs to track original UZS price (amount may be in stars/tiyins)
ALTER TABLE public.course_payment_orders
  ADD COLUMN IF NOT EXISTS price_uzs numeric(12,2) NOT NULL DEFAULT 0;

-- 3. Unified payments table for webhook tracking + direct Click/Payme flows
CREATE TABLE IF NOT EXISTS public.payments (
  id                      serial        PRIMARY KEY,
  order_id                text          NOT NULL UNIQUE,
  item_type               text          NOT NULL CHECK (item_type IN ('book', 'course')),
  item_id                 int           NOT NULL,
  user_id                 bigint        NOT NULL,
  provider                text          NOT NULL CHECK (provider IN ('telegram_stars', 'click', 'payme')),
  amount                  numeric(12,2) NOT NULL,
  currency                text          NOT NULL DEFAULT 'UZS',
  status                  text          NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
  provider_transaction_id text,
  provider_data           jsonb         NOT NULL DEFAULT '{}',
  return_url              text          NOT NULL DEFAULT '',
  created_at              timestamptz   NOT NULL DEFAULT now(),
  updated_at              timestamptz   NOT NULL DEFAULT now(),
  completed_at            timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_order_id   ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id    ON public.payments (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_item       ON public.payments (item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_payments_status     ON public.payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_provider   ON public.payments (provider);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS (allow anon access for webhook endpoints)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_anon_all" ON public.payments;
CREATE POLICY "payments_anon_all" ON public.payments
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ── Verification ──────────────────────────────────────────────────────────────
-- SELECT * FROM public.payments LIMIT 5;
-- SELECT provider, status, count(*) FROM public.payments GROUP BY provider, status;
