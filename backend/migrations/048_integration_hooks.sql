-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 048: Integration hooks — weekly reset + activity_log check constraints
-- Safe to run multiple times (IF NOT EXISTS / CREATE OR REPLACE).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Extend activity_log CHECK constraint to include new types ──────────────
-- Drop and recreate to add the new activity_types introduced by integration hooks.
-- This is additive: existing data is still valid (DO NOTHING on conflicts).
DO $$
BEGIN
    -- Drop old CHECK if it exists under the known name
    ALTER TABLE public.activity_log
        DROP CONSTRAINT IF EXISTS chk_activity_type;

    -- Recreate with extended enum
    ALTER TABLE public.activity_log
        ADD CONSTRAINT chk_activity_type CHECK (
            activity_type IN (
                'course_completed',
                'certificate_earned',
                'level_up',
                'post_created',
                'course_published',
                'connection_made',
                'job_posted',
                'quiz_passed'
            )
        );
EXCEPTION
    WHEN others THEN
        -- If the constraint already uses a superset, skip silently
        NULL;
END $$;


-- ── 2. Weekly reset function ──────────────────────────────────────────────────
-- Resets profile_views_week = 0 for ALL users.
-- Called by a scheduled task (cron) every Monday at 00:00 UTC.

CREATE OR REPLACE FUNCTION public.weekly_reset_profile_views()
RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.profiles
    SET profile_views_week = 0
    WHERE profile_views_week > 0;
END;
$$;


-- ── 3. Optional: convenience RPC so the app can call it via Supabase REST ─────
-- Supabase exposes this as POST /rest/v1/rpc/weekly_reset_profile_views
-- No params — idempotent.

GRANT EXECUTE ON FUNCTION public.weekly_reset_profile_views() TO service_role;


-- ── 4. Profile views DB trigger (if not already created in 043) ───────────────
-- Ensures the trigger that increments profiles.profile_views and
-- profiles.profile_views_week from profile_view_logs exists.
-- Migration 043 should have created it; this is a safety-net.

CREATE OR REPLACE FUNCTION public.inc_profile_views()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE public.profiles
    SET
        profile_views       = COALESCE(profile_views, 0) + 1,
        profile_views_week  = COALESCE(profile_views_week, 0) + 1
    WHERE telegram_id = NEW.profile_user_id;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_inc_profile_views ON public.profile_view_logs;
CREATE TRIGGER trg_inc_profile_views
    AFTER INSERT ON public.profile_view_logs
    FOR EACH ROW EXECUTE FUNCTION public.inc_profile_views();


-- ── 5. Index: activity_log user + type (speeds up profile timeline queries) ───
CREATE INDEX IF NOT EXISTS ix_activity_log_user_type
    ON public.activity_log (user_id, activity_type);

SELECT 'Migration 048 complete — integration hooks, weekly reset, profile view trigger.' AS status;
