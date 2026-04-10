-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 041: Teacher Wallet & Payout System
-- Provides teacher earnings tracking, withdrawal requests, and admin approval.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 1. teacher_wallets — one row per teacher ─────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_wallets (
    id                  BIGSERIAL    PRIMARY KEY,
    teacher_id          BIGINT       NOT NULL UNIQUE,  -- profiles.telegram_id
    available_balance   NUMERIC(14,2) NOT NULL DEFAULT 0
        CHECK (available_balance >= 0),
    pending_withdrawal  NUMERIC(14,2) NOT NULL DEFAULT 0
        CHECK (pending_withdrawal >= 0),
    withdrawn_total     NUMERIC(14,2) NOT NULL DEFAULT 0
        CHECK (withdrawn_total >= 0),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tw_teacher ON teacher_wallets (teacher_id);

-- ── 2. payout_requests — withdrawal request queue ────────────────────────────
CREATE TABLE IF NOT EXISTS payout_requests (
    id              BIGSERIAL     PRIMARY KEY,
    teacher_id      BIGINT        NOT NULL,           -- profiles.telegram_id
    amount          NUMERIC(14,2) NOT NULL
        CHECK (amount > 0),
    card_number     VARCHAR(30)   NOT NULL,
    status          VARCHAR(20)   NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'rejected')),
    admin_note      TEXT,                              -- optional note by admin
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    processed_at    TIMESTAMPTZ,

    CONSTRAINT fk_payout_wallet
        FOREIGN KEY (teacher_id)
        REFERENCES teacher_wallets (teacher_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pr_teacher  ON payout_requests (teacher_id);
CREATE INDEX IF NOT EXISTS idx_pr_status   ON payout_requests (status);
CREATE INDEX IF NOT EXISTS idx_pr_created  ON payout_requests (created_at DESC);

-- ── 3. Helper: auto-update updated_at on teacher_wallets ─────────────────────
CREATE OR REPLACE FUNCTION update_teacher_wallet_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tw_updated ON teacher_wallets;
CREATE TRIGGER trg_tw_updated
    BEFORE UPDATE ON teacher_wallets
    FOR EACH ROW
    EXECUTE FUNCTION update_teacher_wallet_timestamp();

-- ── 4. RLS policies (if using Supabase Row Level Security) ───────────────────
ALTER TABLE teacher_wallets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests  ENABLE ROW LEVEL SECURITY;

-- Service-role can do everything
CREATE POLICY "service_role_tw" ON teacher_wallets
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_pr" ON payout_requests
    FOR ALL USING (true) WITH CHECK (true);
