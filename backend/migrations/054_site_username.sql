-- 054_site_username.sql
-- Decouple the public profile handle from the Telegram username.
-- site_username is used in all profile URLs and public API responses.
-- username (Telegram) is kept for auth/internal use only, never exposed publicly.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS site_username TEXT;

-- Backfill: generate site_username from cleaned first_name + last-5-digits of telegram_id.
-- Using telegram_id suffix guarantees uniqueness since telegram_id is the PK.
UPDATE profiles
SET site_username = (
    CASE
        WHEN REGEXP_REPLACE(LOWER(COALESCE(first_name, '')), '[^a-z0-9]', '', 'g') = ''
            THEN 'user'
        ELSE LEFT(REGEXP_REPLACE(LOWER(first_name), '[^a-z0-9]', '', 'g'), 15)
    END
    || '_' ||
    (ABS(telegram_id) % 100000)::text
)
WHERE site_username IS NULL;

-- Safety net: any remaining NULLs get a fallback
UPDATE profiles
SET site_username = 'user_' || ABS(telegram_id)::text
WHERE site_username IS NULL OR site_username = '';

-- Resolve collisions: for every duplicate site_username (case-insensitive),
-- keep the row with the smallest telegram_id unchanged and give all others
-- the full telegram_id as suffix, which is globally unique.
UPDATE profiles
SET site_username = (
    LEFT(
        COALESCE(
            NULLIF(REGEXP_REPLACE(LOWER(first_name), '[^a-z0-9]', '', 'g'), ''),
            'user'
        ),
        15
    ) || '_' || ABS(telegram_id)::text
)
WHERE telegram_id IN (
    SELECT telegram_id
    FROM (
        SELECT
            telegram_id,
            ROW_NUMBER() OVER (
                PARTITION BY LOWER(site_username)
                ORDER BY telegram_id
            ) AS rn
        FROM profiles
    ) ranked
    WHERE rn > 1
);

-- Unique case-insensitive index for fast URL lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_site_username
    ON profiles (LOWER(site_username));
