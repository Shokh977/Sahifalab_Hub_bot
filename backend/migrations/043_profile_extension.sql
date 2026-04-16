-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 043: User Profile Extension
-- Extends profiles with headline, location, cover image, website, view counters,
-- verification flag, and account_type enum.
-- Safe to run multiple times (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. New profile columns ────────────────────────────────────────────────────

-- headline: short tagline shown under name (e.g. "Marketing bo'yicha o'qituvchi | Lv.5")
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS headline VARCHAR(120);

-- NOTE: bio (TEXT) already exists from migration 030 — not added again.

-- location_city: Uzbekistan city (Toshkent, Samarqand, Buxoro, etc.)
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS location_city TEXT;

-- cover_image_url: profile banner/cover image
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS cover_image_url TEXT;

-- website_url: personal or portfolio link shown on profile
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS website_url TEXT;

-- profile_views: total all-time profile view count
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS profile_views INTEGER NOT NULL DEFAULT 0;

-- profile_views_week: rolling 7-day view count (reset by cron job)
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS profile_views_week INTEGER NOT NULL DEFAULT 0;

-- is_verified: admin-granted verification badge
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- account_type: product-level identity, separate from role (which controls permissions)
-- Values: student | teacher | company | admin
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'student';

-- ── 2. account_type check constraint ─────────────────────────────────────────

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_account_type_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_account_type_check
        CHECK (account_type IN ('student', 'teacher', 'company', 'admin'));

-- ── 3. Data migration: set account_type for existing users ───────────────────

-- Teachers: anyone who already owns at least one course row
UPDATE public.profiles p
SET account_type = 'teacher'
WHERE EXISTS (
    SELECT 1 FROM public.courses c
    WHERE c.teacher_id = p.telegram_id
)
AND account_type = 'student';    -- don't overwrite 'admin' or future values

-- Everyone else stays 'student' (already the column default, no UPDATE needed)

-- ── 4. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_profiles_account_type
    ON public.profiles (account_type);

CREATE INDEX IF NOT EXISTS idx_profiles_is_verified
    ON public.profiles (is_verified)
    WHERE is_verified = TRUE;    -- partial index — verified users are a minority

CREATE INDEX IF NOT EXISTS idx_profiles_views
    ON public.profiles (profile_views DESC);

-- ── 5. Verification queries (run after applying to confirm data integrity) ────
-- Uncomment and run manually in Supabase SQL Editor to verify:
--
-- -- Total users, breakdown by account_type
-- SELECT account_type, COUNT(*) FROM public.profiles GROUP BY 1 ORDER BY 2 DESC;
--
-- -- Confirm XP / level data is untouched (spot-check top 5)
-- SELECT telegram_id, first_name, total_xp, level, account_type
-- FROM public.profiles ORDER BY total_xp DESC LIMIT 5;
--
-- -- Confirm posts are intact
-- SELECT COUNT(*) AS post_count FROM public.posts;
--
-- -- Confirm no profile rows were deleted
-- SELECT COUNT(*) AS profile_count FROM public.profiles;
--
-- -- Confirm teacher backfill (should match number of distinct course teachers)
-- SELECT COUNT(*) AS teacher_count FROM public.profiles WHERE account_type = 'teacher';
-- SELECT COUNT(DISTINCT teacher_id) AS course_teachers FROM public.courses;

SELECT 'Migration 043 complete — profile extension applied.' AS status;
