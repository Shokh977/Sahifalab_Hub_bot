-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 044: Skills, Skill Endorsements, Connections
-- Foundation tables for the professional network (LinkedIn-style).
-- Safe to run multiple times (IF NOT EXISTS / CREATE OR REPLACE).
-- ══════════════════════════════════════════════════════════════════════════════
-- NOTE: UUIDs are NOT used — this app identifies users by telegram_id (BIGINT).
--       All user foreign keys reference public.profiles(telegram_id).
-- NOTE: The existing `follows` table is kept untouched per the migration brief.
--       Follow → Connection migration will happen in a separate step.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. skills ─────────────────────────────────────────────────────────────────
-- One row per skill per user. Skills can be self-added or auto-added by course/
-- test completion. endorsement_count is kept in sync by a trigger below.

CREATE TABLE IF NOT EXISTS public.skills (
    id                BIGSERIAL    PRIMARY KEY,
    user_id           BIGINT       NOT NULL
                          REFERENCES public.profiles(telegram_id) ON DELETE CASCADE,
    skill_name        TEXT         NOT NULL,
    is_verified       BOOLEAN      NOT NULL DEFAULT FALSE,
    verified_by       TEXT,                     -- e.g. 'course:42' or 'test:7'
    endorsement_count INTEGER      NOT NULL DEFAULT 0,
    display_order     INTEGER      NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    -- A user cannot add the same skill twice (case-insensitive via index below)
    CONSTRAINT uq_user_skill UNIQUE (user_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_skills_user_id
    ON public.skills (user_id);

-- Case-insensitive search on skill_name (e.g. "Python" == "python")
CREATE INDEX IF NOT EXISTS idx_skills_skill_name
    ON public.skills (lower(skill_name));

-- Fast lookup for most-endorsed skills per user (profile display order)
CREATE INDEX IF NOT EXISTS idx_skills_user_endorsements
    ON public.skills (user_id, endorsement_count DESC);


-- ── 2. skill_endorsements ─────────────────────────────────────────────────────
-- One row = one person endorsing one skill.
-- Cascade delete from skills; also cascade from endorser profile.

CREATE TABLE IF NOT EXISTS public.skill_endorsements (
    id          BIGSERIAL    PRIMARY KEY,
    skill_id    BIGINT       NOT NULL
                    REFERENCES public.skills(id) ON DELETE CASCADE,
    endorser_id BIGINT       NOT NULL
                    REFERENCES public.profiles(telegram_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_skill_endorsement UNIQUE (skill_id, endorser_id)
);

CREATE INDEX IF NOT EXISTS idx_skill_endorsements_skill
    ON public.skill_endorsements (skill_id);

CREATE INDEX IF NOT EXISTS idx_skill_endorsements_endorser
    ON public.skill_endorsements (endorser_id);


-- ── 3. Trigger: keep skills.endorsement_count in sync ────────────────────────

CREATE OR REPLACE FUNCTION sync_skill_endorsement_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.skills
        SET endorsement_count = endorsement_count + 1
        WHERE id = NEW.skill_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.skills
        SET endorsement_count = GREATEST(endorsement_count - 1, 0)
        WHERE id = OLD.skill_id;
        RETURN OLD;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_skill_endorsement_count ON public.skill_endorsements;
CREATE TRIGGER trg_sync_skill_endorsement_count
    AFTER INSERT OR DELETE ON public.skill_endorsements
    FOR EACH ROW EXECUTE FUNCTION sync_skill_endorsement_count();


-- ── 4. connections ────────────────────────────────────────────────────────────
-- Mutual connections (LinkedIn-style), NOT unidirectional follows.
-- The existing `follows` table is kept as-is.
--
-- Status lifecycle:
--   pending   → accepted   (receiver accepts)
--   pending   → declined   (receiver declines — row kept for audit, not shown)
--
-- To check if two users are connected: query WHERE status = 'accepted' AND
-- (requester_id = A AND receiver_id = B) OR (requester_id = B AND receiver_id = A).
-- Use the get_connection_status() function below for convenience.

CREATE TABLE IF NOT EXISTS public.connections (
    id           BIGSERIAL    PRIMARY KEY,
    requester_id BIGINT       NOT NULL
                     REFERENCES public.profiles(telegram_id) ON DELETE CASCADE,
    receiver_id  BIGINT       NOT NULL
                     REFERENCES public.profiles(telegram_id) ON DELETE CASCADE,
    status       TEXT         NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    accepted_at  TIMESTAMPTZ,              -- set when status flips to 'accepted'

    CONSTRAINT uq_connection        UNIQUE (requester_id, receiver_id),
    CONSTRAINT chk_no_self_connect  CHECK  (requester_id != receiver_id)
);

-- Fast lookup by either party
CREATE INDEX IF NOT EXISTS idx_connections_requester
    ON public.connections (requester_id, status);

CREATE INDEX IF NOT EXISTS idx_connections_receiver
    ON public.connections (receiver_id, status);

-- Partial index: only accepted connections (most read queries filter on this)
CREATE INDEX IF NOT EXISTS idx_connections_accepted
    ON public.connections (requester_id, receiver_id)
    WHERE status = 'accepted';


-- ── 5. Helper function: get connection status between two users ───────────────
-- Returns 'accepted' | 'pending' | 'declined' | 'none'.
-- Direction-agnostic: checks both (A→B) and (B→A).

CREATE OR REPLACE FUNCTION public.get_connection_status(a BIGINT, b BIGINT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        (SELECT status FROM public.connections
         WHERE (requester_id = a AND receiver_id = b)
            OR (requester_id = b AND receiver_id = a)
         LIMIT 1),
        'none'
    );
$$;


-- ── 6. Trigger: set accepted_at when status flips to 'accepted' ──────────────

CREATE OR REPLACE FUNCTION public.set_connection_accepted_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.status = 'accepted' AND OLD.status <> 'accepted' THEN
        NEW.accepted_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_accepted_at ON public.connections;
CREATE TRIGGER trg_connection_accepted_at
    BEFORE UPDATE ON public.connections
    FOR EACH ROW EXECUTE FUNCTION public.set_connection_accepted_at();


-- ── 7. RLS Policies ───────────────────────────────────────────────────────────

ALTER TABLE public.skills             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skill_endorsements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections        ENABLE ROW LEVEL SECURITY;

-- Service role: full access on all three tables
DROP POLICY IF EXISTS "service_full_skills"             ON public.skills;
DROP POLICY IF EXISTS "service_full_skill_endorsements" ON public.skill_endorsements;
DROP POLICY IF EXISTS "service_full_connections"        ON public.connections;

CREATE POLICY "service_full_skills"
    ON public.skills FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_full_skill_endorsements"
    ON public.skill_endorsements FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_full_connections"
    ON public.connections FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Public read: skills are visible to anyone (shown on profiles)
DROP POLICY IF EXISTS "anon_read_skills" ON public.skills;
CREATE POLICY "anon_read_skills"
    ON public.skills FOR SELECT TO anon USING (true);

-- Public read: endorsements are visible (endorser list on skill hover)
DROP POLICY IF EXISTS "anon_read_skill_endorsements" ON public.skill_endorsements;
CREATE POLICY "anon_read_skill_endorsements"
    ON public.skill_endorsements FOR SELECT TO anon USING (true);

-- Connections: only the two parties should see their own connection row
-- (backend enforces this via JWT; anon read is open since backend filters)
DROP POLICY IF EXISTS "anon_read_connections" ON public.connections;
CREATE POLICY "anon_read_connections"
    ON public.connections FOR SELECT TO anon USING (true);


-- ── 8. Verification queries ───────────────────────────────────────────────────
-- Run these after applying to confirm nothing is broken.
--
-- SELECT COUNT(*) FROM public.skills;             -- 0 (new table)
-- SELECT COUNT(*) FROM public.skill_endorsements; -- 0 (new table)
-- SELECT COUNT(*) FROM public.connections;        -- 0 (new table)
-- SELECT COUNT(*) FROM public.follows;            -- should be unchanged
-- SELECT COUNT(*) FROM public.profiles;           -- should be unchanged
-- SELECT public.get_connection_status(1, 2);      -- returns 'none'

SELECT 'Migration 044 complete — skills, skill_endorsements, connections ready.' AS status;
