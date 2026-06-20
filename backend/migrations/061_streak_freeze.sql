-- 061_streak_freeze.sql
-- Adds freeze_count and freeze_used_dates to profiles for the streak freeze system.
-- freeze_count: how many freezes the user currently holds
-- freeze_used_dates: dates on which a freeze was auto-consumed to protect the streak

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS freeze_count      INT    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS freeze_used_dates DATE[] NOT NULL DEFAULT '{}';

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_freeze_count_check;
ALTER TABLE profiles ADD  CONSTRAINT profiles_freeze_count_check CHECK (freeze_count >= 0);
