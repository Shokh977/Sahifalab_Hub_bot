-- 095_donation_payment_methods.sql — Qo'llab-quvvatlash (donation) feature.
--
-- Donations are manual bank transfers — no payment processor, no Play
-- Billing. This table only holds the bank/card details an admin publishes
-- for users to copy and pay via their own banking app.
--
-- Non-negotiable product rule, enforced in application code (see
-- app/services/donation_service.py and its tests): a donation unlocks
-- NOTHING. No code path here may write to tanga_balance, total_xp, or any
-- entitlement table. This schema deliberately has no FK to profiles for
-- "who donated" — there is no donor identity to attach a reward to.
--
-- payment_methods.is_active lets an admin hide a method without deleting it
-- (deleting loses history/audit continuity). A partial unique index on
-- account_number (active rows only) catches accidental duplicate entry —
-- an admin re-pasting the same card under a new row.
--
-- payment_method_audit_log mirrors this codebase's existing per-entity
-- audit log pattern (deck_audit_log, migration 067) — a rogue or mistaken
-- change to a card number must be visible and attributable after the fact,
-- since if admin access is ever compromised, swapping a card number
-- silently redirects every donation.

-- gen_random_uuid() is native to Postgres 13+ (moved into core, no longer
-- needs the pgcrypto extension) — this codebase's Supabase/Railway target
-- and this repo's local test Postgres are both well past that version.

CREATE TABLE IF NOT EXISTS payment_methods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name       TEXT NOT NULL,
    account_number  TEXT NOT NULL,          -- raw, unformatted digits (+ letters for IBAN)
    number_type     TEXT NOT NULL,          -- 'card' | 'account' | 'iban'
    holder_name     TEXT NOT NULL,
    currency        TEXT NOT NULL,          -- 'UZS' | 'KRW' | 'EUR' | 'USD' | ...
    region          TEXT NOT NULL,          -- 'uz' | 'kr' | 'intl'
    swift           TEXT,
    note            TEXT,                   -- optional line shown under the copy row
    sort_order      INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      BIGINT,                 -- admin telegram_id, no FK (admin table is separate/external)
    updated_by      BIGINT
);

-- Catches accidental duplicate entry among currently-visible methods only —
-- a deactivated method's old number doesn't block re-adding it later.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_payment_methods_active_account
    ON payment_methods (account_number) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_payment_methods_active_sort
    ON payment_methods (is_active, sort_order);

CREATE TABLE IF NOT EXISTS payment_method_audit_log (
    id                 BIGSERIAL PRIMARY KEY,
    payment_method_id  UUID,
    action             VARCHAR(50) NOT NULL,   -- 'create' | 'update' | 'delete' | 'reorder'
    admin_telegram_id  BIGINT,
    old_value          JSONB,
    new_value          JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_method_audit_log_method ON payment_method_audit_log(payment_method_id);
CREATE INDEX IF NOT EXISTS idx_payment_method_audit_log_admin  ON payment_method_audit_log(admin_telegram_id);

-- Remote-config gate for the in-app donation screen (Play policy risk —
-- see the accompanying report). Defaults OFF: no flag flip, no screen, no
-- route, no menu entry reachable. The web page (sahifalab.uz/qollab-
-- quvvatlash) is the primary shipping target and is NOT gated by this —
-- it carries zero Play Store risk.
INSERT INTO app_config (key, value, description)
VALUES (
    'donation_screen_enabled', 'false'::jsonb,
    'Gates the in-app Qo''llab-quvvatlash screen (Play policy risk — see 095 migration header). Flip to true only after confirming the Play Console policy position.'
)
ON CONFLICT (key) DO NOTHING;
