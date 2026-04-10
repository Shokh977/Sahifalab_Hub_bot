-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 044: Security Hardening v2
--
-- 1. credit_wallet: reject non-positive p_amount (prevents negative-amount abuse)
-- 2. refund_wallet: dedicated RPC for reversals with balance guard
-- 3. processed_webhooks: DB-backed webhook dedup table
-- ──────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════
-- 1. REPLACE credit_wallet — now rejects p_amount <= 0
-- ═══════════════════════════════════════════════════════════════════

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
  -- Guard: only positive amounts allowed (use refund_wallet for reversals)
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'credit_wallet: p_amount must be > 0, got %', p_amount;
  END IF;

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


-- ═══════════════════════════════════════════════════════════════════
-- 2. NEW refund_wallet — safe reversal that guards against going below zero
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refund_wallet(
  p_teacher_id bigint,
  p_amount     numeric,
  p_reference  text DEFAULT NULL,
  p_note       text DEFAULT NULL
) RETURNS json LANGUAGE plpgsql AS $$
DECLARE
  v_wallet teacher_wallets%ROWTYPE;
  v_new_balance numeric;
BEGIN
  -- Guard: only positive amounts
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'refund_wallet: p_amount must be > 0, got %', p_amount;
  END IF;

  -- Lock the row
  SELECT * INTO v_wallet
    FROM teacher_wallets
    WHERE teacher_id = p_teacher_id
    FOR UPDATE;

  IF NOT FOUND THEN
    -- Nothing to refund if wallet doesn't exist
    RETURN json_build_object(
      'error', 'wallet_not_found',
      'teacher_id', p_teacher_id
    );
  END IF;

  -- Ensure balance doesn't go below zero
  v_new_balance := GREATEST(0, COALESCE(v_wallet.available_balance, 0) - p_amount);

  UPDATE teacher_wallets
    SET available_balance = v_new_balance,
        updated_at = now()
    WHERE teacher_id = p_teacher_id;

  -- Audit log
  INSERT INTO wallet_transactions (teacher_id, type, amount, balance_after, reference_id, note)
  VALUES (p_teacher_id, 'refund', p_amount, v_new_balance, p_reference, p_note);

  RETURN json_build_object(
    'teacher_id', p_teacher_id,
    'available_balance', v_new_balance,
    'refunded', p_amount,
    'pending_withdrawal', COALESCE(v_wallet.pending_withdrawal, 0),
    'withdrawn_total', COALESCE(v_wallet.withdrawn_total, 0)
  );
END;
$$;


-- ═══════════════════════════════════════════════════════════════════
-- 3. processed_webhooks — already created in 043_security_hardening.sql
--    Schema: (id, provider, transaction_id, processed_at)
--    UNIQUE (provider, transaction_id)
--    No changes needed — table is ready for use by payment_service.py
-- ===================================================================
