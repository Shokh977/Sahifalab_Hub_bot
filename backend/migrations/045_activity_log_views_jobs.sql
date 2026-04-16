-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 045: Activity Log, Profile View Log, Jobs, Job Applications
--                + certificate share_token / skill_tags
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- All user FKs reference profiles(telegram_id) BIGINT — UUIDs are not used.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. activity_log ───────────────────────────────────────────────────────────
-- Append-only audit trail of every significant user action.
-- Drives the profile timeline (ORDER BY created_at DESC).
-- UNIQUE on (user_id, activity_type, reference_id, reference_type) makes the
-- backfill idempotent via ON CONFLICT DO NOTHING.
-- Note: NULL reference_id rows are NOT covered by the unique constraint
--       (SQL treats NULLs as distinct), which is intentional for repeatable
--       events like 'level_up' that have no single source reference.

CREATE TABLE IF NOT EXISTS public.activity_log (
    id             BIGSERIAL    PRIMARY KEY,
    user_id        BIGINT       NOT NULL
                       REFERENCES public.profiles(telegram_id) ON DELETE CASCADE,
    activity_type  TEXT         NOT NULL
                       CHECK (activity_type IN (
                           'certificate_earned',
                           'course_enrolled',
                           'course_completed',
                           'post_created',
                           'level_up',
                           'achievement_unlocked',
                           'skill_added',
                           'connection_made',
                           'job_posted'
                       )),
    reference_id   TEXT,        -- ID of the related entity (cast to text)
    reference_type TEXT         CHECK (reference_type IN (
                           'course', 'post', 'test', 'achievement', 'job',
                           'certificate', 'skill', 'connection'
                       )),
    metadata       JSONB,       -- extra display data (title, image_url, etc.)
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_activity_log_source
        UNIQUE (user_id, activity_type, reference_id, reference_type)
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user_created
    ON public.activity_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_log_type
    ON public.activity_log (activity_type);


-- ── 2. profile_view_logs ──────────────────────────────────────────────────────
-- Per-visit log used to compute profile_views and profile_views_week on profiles.
-- Named 'profile_view_logs' (not 'profile_views') to avoid confusion with the
-- profiles.profile_views integer counter column added in migration 043.
-- A trigger keeps profiles.profile_views in sync on every INSERT.
-- viewer_user_id = NULL means an anonymous / logged-out visitor.

CREATE TABLE IF NOT EXISTS public.profile_view_logs (
    id              BIGSERIAL    PRIMARY KEY,
    profile_user_id BIGINT       NOT NULL
                        REFERENCES public.profiles(telegram_id) ON DELETE CASCADE,
    viewer_user_id  BIGINT       REFERENCES public.profiles(telegram_id) ON DELETE SET NULL,
    viewed_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pvl_profile_viewed
    ON public.profile_view_logs (profile_user_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_pvl_viewer
    ON public.profile_view_logs (viewer_user_id)
    WHERE viewer_user_id IS NOT NULL;


-- ── 3. Trigger: keep profiles.profile_views in sync ──────────────────────────

CREATE OR REPLACE FUNCTION public.increment_profile_views()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Don't count self-views
    IF NEW.viewer_user_id IS DISTINCT FROM NEW.profile_user_id THEN
        UPDATE public.profiles
        SET profile_views      = profile_views      + 1,
            profile_views_week = profile_views_week + 1
        WHERE telegram_id = NEW.profile_user_id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_profile_views ON public.profile_view_logs;
CREATE TRIGGER trg_increment_profile_views
    AFTER INSERT ON public.profile_view_logs
    FOR EACH ROW EXECUTE FUNCTION public.increment_profile_views();


-- ── 4. jobs ───────────────────────────────────────────────────────────────────
-- Job postings. posted_by links to the user/company who created the listing.
-- required_skills is a JSONB array of skill name strings (e.g. ["Python","SQL"]).

CREATE TABLE IF NOT EXISTS public.jobs (
    id               BIGSERIAL    PRIMARY KEY,
    posted_by        BIGINT       NOT NULL
                         REFERENCES public.profiles(telegram_id) ON DELETE CASCADE,
    company_name     TEXT         NOT NULL,
    title            TEXT         NOT NULL,
    description      TEXT         NOT NULL,
    location         TEXT,
    job_type         TEXT         NOT NULL DEFAULT 'full_time'
                         CHECK (job_type IN (
                             'full_time', 'part_time', 'remote',
                             'freelance', 'internship'
                         )),
    salary_min       INTEGER,
    salary_max       INTEGER,
    salary_currency  TEXT         NOT NULL DEFAULT 'UZS',
    required_skills  JSONB        NOT NULL DEFAULT '[]',
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ,

    CONSTRAINT chk_salary_range CHECK (
        salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min
    )
);

CREATE INDEX IF NOT EXISTS idx_jobs_posted_by
    ON public.jobs (posted_by);

CREATE INDEX IF NOT EXISTS idx_jobs_active_created
    ON public.jobs (is_active, created_at DESC)
    WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_jobs_job_type
    ON public.jobs (job_type);

-- GIN index for fast JSONB skill matching (e.g. required_skills @> '["Python"]')
CREATE INDEX IF NOT EXISTS idx_jobs_required_skills
    ON public.jobs USING GIN (required_skills);


-- ── 5. job_applications ───────────────────────────────────────────────────────
-- One row per (applicant, job). Status tracks recruiter pipeline step.

CREATE TABLE IF NOT EXISTS public.job_applications (
    id           BIGSERIAL    PRIMARY KEY,
    job_id       BIGINT       NOT NULL
                     REFERENCES public.jobs(id) ON DELETE CASCADE,
    applicant_id BIGINT       NOT NULL
                     REFERENCES public.profiles(telegram_id) ON DELETE CASCADE,
    message      TEXT,
    status       TEXT         NOT NULL DEFAULT 'applied'
                     CHECK (status IN ('applied', 'viewed', 'shortlisted', 'rejected')),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_job_application UNIQUE (job_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_job_applications_job
    ON public.job_applications (job_id, status);

CREATE INDEX IF NOT EXISTS idx_job_applications_applicant
    ON public.job_applications (applicant_id);


-- ── 6. RLS Policies ───────────────────────────────────────────────────────────

ALTER TABLE public.activity_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_view_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_applications   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_activity_log"      ON public.activity_log;
DROP POLICY IF EXISTS "service_full_profile_view_logs" ON public.profile_view_logs;
DROP POLICY IF EXISTS "service_full_jobs"              ON public.jobs;
DROP POLICY IF EXISTS "service_full_job_applications"  ON public.job_applications;

CREATE POLICY "service_full_activity_log"
    ON public.activity_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_full_profile_view_logs"
    ON public.profile_view_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_full_jobs"
    ON public.jobs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_full_job_applications"
    ON public.job_applications FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Activity log: public read (shown on profile pages)
DROP POLICY IF EXISTS "anon_read_activity_log" ON public.activity_log;
CREATE POLICY "anon_read_activity_log"
    ON public.activity_log FOR SELECT TO anon USING (true);

-- Jobs: public read for active listings
DROP POLICY IF EXISTS "anon_read_jobs" ON public.jobs;
CREATE POLICY "anon_read_jobs"
    ON public.jobs FOR SELECT TO anon USING (is_active = TRUE);


-- ── 7. Extend course_certificates: share_token + skill_tags ──────────────────
-- share_token: 12-char hex string for the public share URL (e.g. /c/a1b2c3d4e5f6)
-- skill_tags:  JSONB array of skill names this certificate verifies

ALTER TABLE public.course_certificates
    ADD COLUMN IF NOT EXISTS share_token VARCHAR(12) UNIQUE;

ALTER TABLE public.course_certificates
    ADD COLUMN IF NOT EXISTS skill_tags JSONB DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_course_certificates_share_token
    ON public.course_certificates (share_token)
    WHERE share_token IS NOT NULL;

-- Generate share_token for all existing certificates that don't have one.
-- Uses 6 random bytes → 12 hex chars (281 trillion combinations).
UPDATE public.course_certificates
SET share_token = lower(encode(gen_random_bytes(6), 'hex'))
WHERE share_token IS NULL;


-- ── 8. Backfill activity_log from existing data ───────────────────────────────
-- ON CONFLICT DO NOTHING makes this idempotent — safe to re-run.
-- Uses original created_at timestamps for historically accurate timelines.

-- 8a. certificate_earned — one entry per issued certificate
INSERT INTO public.activity_log
    (user_id, activity_type, reference_id, reference_type, metadata, created_at)
SELECT
    cc.student_id,
    'certificate_earned',
    cc.certificate_id,
    'certificate',
    jsonb_build_object(
        'course_id',   cc.course_id,
        'certificate_id', cc.certificate_id
    ),
    cc.issued_at
FROM public.course_certificates cc
ON CONFLICT (user_id, activity_type, reference_id, reference_type)
DO NOTHING;

-- 8b. course_enrolled — one entry per enrollment
INSERT INTO public.activity_log
    (user_id, activity_type, reference_id, reference_type, metadata, created_at)
SELECT
    ce.student_id,
    'course_enrolled',
    ce.course_id::text,
    'course',
    jsonb_build_object('course_id', ce.course_id),
    ce.created_at
FROM public.course_enrollments ce
ON CONFLICT (user_id, activity_type, reference_id, reference_type)
DO NOTHING;

-- 8c. post_created — one entry per post
INSERT INTO public.activity_log
    (user_id, activity_type, reference_id, reference_type, metadata, created_at)
SELECT
    p.author_id,
    'post_created',
    p.id::text,
    'post',
    jsonb_build_object(
        'post_id', p.id,
        'preview', left(p.content, 100)   -- first 100 chars for timeline preview
    ),
    p.created_at
FROM public.posts p
ON CONFLICT (user_id, activity_type, reference_id, reference_type)
DO NOTHING;


-- ── 9. Verification queries ───────────────────────────────────────────────────
--
-- -- New table row counts
-- SELECT COUNT(*) FROM public.activity_log;        -- should be > 0 after backfill
-- SELECT COUNT(*) FROM public.profile_view_logs;   -- 0 (new table)
-- SELECT COUNT(*) FROM public.jobs;                -- 0 (new table)
-- SELECT COUNT(*) FROM public.job_applications;    -- 0 (new table)
--
-- -- Backfill breakdown
-- SELECT activity_type, COUNT(*) FROM public.activity_log GROUP BY 1 ORDER BY 2 DESC;
--
-- -- Confirm share tokens were generated
-- SELECT COUNT(*) FROM public.course_certificates WHERE share_token IS NULL; -- should be 0
--
-- -- Confirm existing data is intact
-- SELECT COUNT(*) FROM public.profiles;
-- SELECT COUNT(*) FROM public.posts;
-- SELECT COUNT(*) FROM public.course_enrollments;
-- SELECT COUNT(*) FROM public.course_certificates;

SELECT 'Migration 045 complete — activity_log, profile_view_logs, jobs, job_applications ready.' AS status;
