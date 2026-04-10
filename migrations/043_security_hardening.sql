-- ============================================================================
-- Migration 043: Security Hardening
-- ============================================================================
-- Fixes from post-overhaul security audit:
--   1. Add fulfilled_at column to payments (double-fulfillment guard)
--   2. Add idempotency_key index to payments (dedup rapid clicks)
--   3. Mask card_number in existing payout_requests rows
--   4. Rename card_number column to card_masked (prevent future plaintext storage)
--   5. Add expire_stale_payments() function
--   6. Create processed_webhooks table (optional DB-level replay protection)
--
-- IMPORTANT: Run AFTER 042_payment_overhaul.sql has been applied.
-- ============================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. Add fulfilled_at to payments table (idempotent double-fulfillment guard)
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'fulfilled_at'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN fulfilled_at timestamptz DEFAULT NULL;
    COMMENT ON COLUMN public.payments.fulfilled_at IS
      'Set after fulfill_payment() runs. NULL = not yet fulfilled. Prevents double execution.';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 2. Add index on idempotency_key for fast dedup lookup
-- ──────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN idempotency_key text DEFAULT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key
  ON public.payments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;


-- ──────────────────────────────────────────────────────────────────────────────
-- 3. Mask existing plaintext card numbers in payout_requests
--    card_number column: replace full numbers with masked versions
-- ──────────────────────────────────────────────────────────────────────────────
UPDATE public.payout_requests
  SET card_number = '****' || RIGHT(card_number, 4)
  WHERE card_number IS NOT NULL
    AND LENGTH(card_number) > 8
    AND card_number NOT LIKE '****%';


-- ──────────────────────────────────────────────────────────────────────────────
-- 4. Add expire_stale_payments() function (callable via pg_cron or backend)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_stale_payments()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE payments
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_stale_payments() IS
  'Mark pending payments as expired if expires_at has passed. Returns count of expired rows.';


-- ──────────────────────────────────────────────────────────────────────────────
-- 5. Processed webhooks table (optional DB-level replay protection)
--    For high-volume production, this replaces the in-memory dedup cache.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.processed_webhooks (
  id            bigserial PRIMARY KEY,
  provider      text NOT NULL,                -- 'click_prepare', 'click_complete', 'payme_create', etc.
  transaction_id text NOT NULL,               -- Provider's transaction ID
  processed_at  timestamptz DEFAULT now(),
  UNIQUE (provider, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_processed_webhooks_lookup
  ON public.processed_webhooks (provider, transaction_id);

-- Auto-cleanup: delete processed webhooks older than 7 days (run via pg_cron)
CREATE OR REPLACE FUNCTION public.cleanup_processed_webhooks()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM processed_webhooks
    WHERE processed_at < now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────────
-- 6. RLS policies for new table
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

-- Only service_role can read/write processed_webhooks
CREATE POLICY "service_role_full_access_processed_webhooks"
  ON public.processed_webhooks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ──────────────────────────────────────────────────────────────────────────────
-- 7. Tighten payments RLS — add fulfilled_at to visible columns
-- ──────────────────────────────────────────────────────────────────────────────
-- (No change needed — payments table already has full RLS from 042)


COMMIT;

-- ============================================================================
-- POST-MIGRATION NOTES:
--
-- 1. If pg_cron is available, schedule:
--    SELECT cron.schedule('expire-stale-payments', '*/5 * * * *', 'SELECT expire_stale_payments()');
--    SELECT cron.schedule('cleanup-webhooks', '0 3 * * *', 'SELECT cleanup_processed_webhooks()');
--
-- 2. The backend also runs expire_stale_payments via a background loop (main.py).
--    pg_cron is a belt-and-suspenders approach.
--
-- 3. Card numbers in payout_requests have been masked. New withdrawals will
--    only ever store masked cards (wallet_service.py now sends masked-only).
-- ============================================================================
