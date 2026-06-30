-- 067_deck_audit_log.sql
-- step-14-public-flashcard-decks Part 7: admin moderation audit trail.
-- Mirrors the existing per-entity audit log pattern (book_audit_log, quiz_audit_log).

CREATE TABLE IF NOT EXISTS deck_audit_log (
    id                 BIGSERIAL    PRIMARY KEY,
    deck_id            BIGINT,
    action             VARCHAR(50)  NOT NULL,
    admin_telegram_id  BIGINT,
    details            JSONB,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deck_audit_log_deck  ON deck_audit_log(deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_audit_log_admin ON deck_audit_log(admin_telegram_id);
