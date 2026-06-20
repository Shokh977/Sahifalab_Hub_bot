-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 062: Add missing columns to payments table
--   • fulfilled_at    — timestamp set when teacher commission is credited
--                       (checked by fulfill_payment() to prevent double-credit)
--   • idempotency_key — client-supplied key to deduplicate /api/pay/init calls
--   • expires_at      — order expiry (30 min); unpaid orders past this are stale
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS fulfilled_at    timestamptz,
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(64),
  ADD COLUMN IF NOT EXISTS expires_at      timestamptz;

-- Unique index so duplicate /init calls with the same key resolve to one row
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency_key
  ON public.payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Index for stale-order cleanup queries
CREATE INDEX IF NOT EXISTS idx_payments_expires_at
  ON public.payments (expires_at)
  WHERE expires_at IS NOT NULL;

-- ── Verification ──────────────────────────────────────────────────────────────
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'payments'
-- ORDER BY ordinal_position;
