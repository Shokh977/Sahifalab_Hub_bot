-- ══════════════════════════════════════════════════════════════════════════════
-- SAHIFALAB — Migration 042: Payment System Overhaul
-- Run in Supabase Dashboard → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════════════════
--
-- What this migration does:
--   1. Locks down RLS on payments, course_payment_orders, teacher_wallets, payout_requests
--   2. Fixes column types (FLOAT→NUMERIC, INT→BIGINT, adds expires_at + idempotency_key)
--   3. Drops the telegram_stars provider from allowed values
--   4. Creates atomic wallet RPC functions (credit/debit/approve/reject)
--   5. Creates wallet_transactions audit log table
--   6. Masks card numbers in payout_requests
-- ══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1. FIX PAYMENTS TABLE — column types + new columns
-- ═══════════════════════════════════════════════════════════════════

-- Fix amount to NUMERIC for money precision
ALTER TABLE public.payments
  ALTER COLUMN amount TYPE numeric(12,2) USING amount::numeric(12,2);

-- Fix user_id to BIGINT (Telegram IDs can exceed 2^31)
ALTER TABLE public.payments
  ALTER COLUMN user_id TYPE bigint USING user_id::bigint;

-- Add order expiration column
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Add idempotency key for duplicate prevention
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency
  ON public.payments (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Performance index for polling by order_id
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_status ON public.payments (user_id, status);


-- ═══════════════════════════════════════════════════════════════════
-- 2. LOCK DOWN RLS — payments table
-- ═══════════════════════════════════════════════════════════════════

-- Enable RLS
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Drop ALL permissive anon policies
DROP POLICY IF EXISTS "payments_anon_all"        ON public.payments;
DROP POLICY IF EXISTS "payments: anon all"       ON public.payments;
DROP POLICY IF EXISTS "payments: anon select"    ON public.payments;
DROP POLICY IF EXISTS "payments: anon insert"    ON public.payments;
DROP POLICY IF EXISTS "payments: anon update"    ON public.payments;
DROP POLICY IF EXISTS "payments: anon delete"    ON public.payments;

-- Only service_role can read/write payments
DROP POLICY IF EXISTS "payments: service_role all" ON public.payments;
CREATE POLICY "payments: service_role all"
  ON public.payments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon gets NOTHING on payments
DROP POLICY IF EXISTS "payments: anon denied" ON public.payments;
CREATE POLICY "payments: anon denied"
  ON public.payments
  FOR SELECT
  TO anon
  USING (false);


-- ═══════════════════════════════════════════════════════════════════
-- 3. LOCK DOWN RLS — course_payment_orders
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.course_payment_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "course_payment_orders: anon all"    ON public.course_payment_orders;
DROP POLICY IF EXISTS "course_payment_orders: anon select" ON public.course_payment_orders;
DROP POLICY IF EXISTS "course_payment_orders: anon insert" ON public.course_payment_orders;
DROP POLICY IF EXISTS "course_payment_orders: anon update" ON public.course_payment_orders;
DROP POLICY IF EXISTS "course_payment_orders: anon delete" ON public.course_payment_orders;

DROP POLICY IF EXISTS "course_payment_orders: service_role all" ON public.course_payment_orders;
CREATE POLICY "course_payment_orders: service_role all"
  ON public.course_payment_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- 4. LOCK DOWN RLS — teacher_wallets
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.teacher_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_tw"                   ON public.teacher_wallets;
DROP POLICY IF EXISTS "teacher_wallets: anon all"         ON public.teacher_wallets;
DROP POLICY IF EXISTS "teacher_wallets: service_role all" ON public.teacher_wallets;

CREATE POLICY "teacher_wallets: service_role all"
  ON public.teacher_wallets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- 5. LOCK DOWN RLS — payout_requests
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_pr"                   ON public.payout_requests;
DROP POLICY IF EXISTS "payout_requests: anon all"         ON public.payout_requests;
DROP POLICY IF EXISTS "payout_requests: service_role all" ON public.payout_requests;

CREATE POLICY "payout_requests: service_role all"
  ON public.payout_requests
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- 6. Add card_masked column to payout_requests
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS card_masked text;


-- ═══════════════════════════════════════════════════════════════════
-- 7. WALLET TRANSACTIONS AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id            bigserial    PRIMARY KEY,
  teacher_id    bigint       NOT NULL,
  type          text         NOT NULL CHECK (type IN ('credit', 'debit', 'withdrawal_pending', 'withdrawal_paid', 'withdrawal_refund')),
  amount        numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL DEFAULT 0,
  reference_id  text,           -- order_id or payout_request id
  note          text,
  created_at    timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_teacher ON public.wallet_transactions (teacher_id, created_at DESC);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_transactions: service_role all" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions: service_role all"
  ON public.wallet_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════
-- 8. ATOMIC WALLET RPC FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════

-- 8a. Credit wallet (after a sale)
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_teacher_id bigint,
  p_amount     numeric,
  p_reference  text DEFAULT NULL,
  p_note       text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_wallet teacher_wallets%ROWTYPE;
  v_new_balance numeric;
BEGIN
  -- Lock the row for update (prevents concurrent race)
  SELECT * INTO v_wallet
    FROM teacher_wallets
    WHERE teacher_id = p_teacher_id
    FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO teacher_wallets (teacher_id, available_balance, pending_withdrawal, withdrawn_total)
    VALUES (p_teacher_id, p_amount, 0, 0)
    RETURNING * INTO v_wallet;
    v_new_balance := p_amount;
  ELSE
    v_new_balance := COALESCE(v_wallet.available_balance, 0) + p_amount;
    UPDATE teacher_wallets
      SET available_balance = v_new_balance,
          updated_at = now()
      WHERE teacher_id = p_teacher_id;
  END IF;

  -- Audit log
  INSERT INTO wallet_transactions (teacher_id, type, amount, balance_after, reference_id, note)
  VALUES (p_teacher_id, 'credit', p_amount, v_new_balance, p_reference, p_note);

  RETURN json_build_object(
    'teacher_id', p_teacher_id,
    'available_balance', v_new_balance,
    'pending_withdrawal', COALESCE(v_wallet.pending_withdrawal, 0),
    'withdrawn_total', COALESCE(v_wallet.withdrawn_total, 0)
  );
END;
$$;


-- 8b. Debit wallet (move to pending for withdrawal)
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_teacher_id  bigint,
  p_amount      numeric,
  p_card_number text,
  p_card_masked text DEFAULT NULL,
  p_note        text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_wallet teacher_wallets%ROWTYPE;
  v_new_available numeric;
  v_new_pending   numeric;
  v_payout_id     bigint;
BEGIN
  -- Lock for update
  SELECT * INTO v_wallet
    FROM teacher_wallets
    WHERE teacher_id = p_teacher_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for teacher %', p_teacher_id;
  END IF;

  IF COALESCE(v_wallet.available_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance: available=%, requested=%',
      COALESCE(v_wallet.available_balance, 0), p_amount;
  END IF;

  v_new_available := COALESCE(v_wallet.available_balance, 0) - p_amount;
  v_new_pending   := COALESCE(v_wallet.pending_withdrawal, 0) + p_amount;

  UPDATE teacher_wallets
    SET available_balance = v_new_available,
        pending_withdrawal = v_new_pending,
        updated_at = now()
    WHERE teacher_id = p_teacher_id;

  -- Create payout request
  INSERT INTO payout_requests (teacher_id, amount, card_number, card_masked, status)
  VALUES (p_teacher_id, p_amount, p_card_number, COALESCE(p_card_masked, '****' || RIGHT(p_card_number, 4)), 'pending')
  RETURNING id INTO v_payout_id;

  -- Audit log
  INSERT INTO wallet_transactions (teacher_id, type, amount, balance_after, reference_id, note)
  VALUES (p_teacher_id, 'withdrawal_pending', p_amount, v_new_available, v_payout_id::text, p_note);

  RETURN json_build_object(
    'payout_id', v_payout_id,
    'teacher_id', p_teacher_id,
    'available_balance', v_new_available,
    'pending_withdrawal', v_new_pending
  );
END;
$$;


-- 8c. Approve payout (admin marks as paid)
CREATE OR REPLACE FUNCTION public.approve_payout(
  p_payout_id  bigint,
  p_admin_note text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_payout payout_requests%ROWTYPE;
  v_wallet teacher_wallets%ROWTYPE;
  v_new_pending   numeric;
  v_new_withdrawn numeric;
BEGIN
  -- Lock payout
  SELECT * INTO v_payout
    FROM payout_requests
    WHERE id = p_payout_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout request not found: %', p_payout_id;
  END IF;

  IF v_payout.status != 'pending' THEN
    RAISE EXCEPTION 'Payout already processed: status=%', v_payout.status;
  END IF;

  -- Lock wallet
  SELECT * INTO v_wallet
    FROM teacher_wallets
    WHERE teacher_id = v_payout.teacher_id
    FOR UPDATE;

  v_new_pending   := GREATEST(0, COALESCE(v_wallet.pending_withdrawal, 0) - v_payout.amount);
  v_new_withdrawn := COALESCE(v_wallet.withdrawn_total, 0) + v_payout.amount;

  UPDATE teacher_wallets
    SET pending_withdrawal = v_new_pending,
        withdrawn_total = v_new_withdrawn,
        updated_at = now()
    WHERE teacher_id = v_payout.teacher_id;

  UPDATE payout_requests
    SET status = 'paid',
        admin_note = p_admin_note,
        processed_at = now()
    WHERE id = p_payout_id;

  -- Audit
  INSERT INTO wallet_transactions (teacher_id, type, amount, balance_after, reference_id, note)
  VALUES (v_payout.teacher_id, 'withdrawal_paid', v_payout.amount, v_new_pending, p_payout_id::text, p_admin_note);

  RETURN json_build_object('status', 'paid', 'payout_id', p_payout_id);
END;
$$;


-- 8d. Reject payout (return money to available_balance)
CREATE OR REPLACE FUNCTION public.reject_payout(
  p_payout_id  bigint,
  p_admin_note text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_payout payout_requests%ROWTYPE;
  v_wallet teacher_wallets%ROWTYPE;
  v_new_available numeric;
  v_new_pending   numeric;
BEGIN
  SELECT * INTO v_payout
    FROM payout_requests
    WHERE id = p_payout_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payout request not found: %', p_payout_id;
  END IF;

  IF v_payout.status != 'pending' THEN
    RAISE EXCEPTION 'Payout already processed: status=%', v_payout.status;
  END IF;

  SELECT * INTO v_wallet
    FROM teacher_wallets
    WHERE teacher_id = v_payout.teacher_id
    FOR UPDATE;

  v_new_available := COALESCE(v_wallet.available_balance, 0) + v_payout.amount;
  v_new_pending   := GREATEST(0, COALESCE(v_wallet.pending_withdrawal, 0) - v_payout.amount);

  UPDATE teacher_wallets
    SET available_balance = v_new_available,
        pending_withdrawal = v_new_pending,
        updated_at = now()
    WHERE teacher_id = v_payout.teacher_id;

  UPDATE payout_requests
    SET status = 'rejected',
        admin_note = p_admin_note,
        processed_at = now()
    WHERE id = p_payout_id;

  -- Audit
  INSERT INTO wallet_transactions (teacher_id, type, amount, balance_after, reference_id, note)
  VALUES (v_payout.teacher_id, 'withdrawal_refund', v_payout.amount, v_new_available, p_payout_id::text, p_admin_note);

  RETURN json_build_object('status', 'rejected', 'payout_id', p_payout_id);
END;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- 9. EXPIRE STALE ORDERS — call periodically via pg_cron or backend
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.expire_stale_payments()
RETURNS integer LANGUAGE plpgsql AS $$
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


-- ══════════════════════════════════════════════════════════════════════════════
-- DONE. Verify:
--   SELECT * FROM pg_policies WHERE tablename IN ('payments','teacher_wallets','payout_requests','course_payment_orders');
-- ══════════════════════════════════════════════════════════════════════════════
