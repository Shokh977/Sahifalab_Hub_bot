-- 081_profile_registered_via.sql — track how each user first signed up
--
-- Feeds the admin dashboard's "how are people finding the app" breakdown:
-- mobile app vs. plain web browser vs. Telegram Mini App. Stamped once at
-- account creation (see auth.py's _upsert_profile) and never overwritten by
-- later logins. Existing rows stay NULL — the admin UI buckets those as
-- "unknown / before tracking" rather than guessing.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS registered_via VARCHAR(30);
CREATE INDEX IF NOT EXISTS ix_profiles_registered_via ON profiles(registered_via);
