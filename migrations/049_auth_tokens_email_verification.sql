-- Migration 049: auth_tokens table + email verification columns on profiles
-- Run once against the production database before deploying the new auth code.

-- 1. New columns on profiles (additive — safe to run on existing data)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_verified       BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS password_changed_at  TIMESTAMPTZ DEFAULT NULL;

-- 2. Auth tokens table (verification + password-reset one-time tokens)
CREATE TABLE IF NOT EXISTS auth_tokens (
  id         VARCHAR(64)  PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  token      VARCHAR(64)  UNIQUE NOT NULL,
  type       VARCHAR(30)  NOT NULL,     -- 'email_verification' | 'password_reset'
  expires_at TIMESTAMPTZ  NOT NULL,
  used_at    TIMESTAMPTZ  DEFAULT NULL,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_tokens_token   ON auth_tokens(token);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user    ON auth_tokens(user_id, type);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);

-- 3. Auto-cleanup: remove tokens older than 7 days past their expiry
--    (Call this from a daily cron or Supabase scheduled function.)
CREATE OR REPLACE FUNCTION cleanup_expired_auth_tokens()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM auth_tokens
  WHERE expires_at < NOW() - INTERVAL '7 days';
END;
$$;
