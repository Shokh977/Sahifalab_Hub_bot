-- Migration 034: Analytics events infrastructure
--
-- Creates a unified analytics_events table for tracking:
--   • course_view       — when a user lands on CourseDetailPage (with source: lenta / search / external / direct)
--   • course_impression — when a course card appears in Lenta or Kashfiyot feed
--   • profile_visit     — when someone visits a teacher's public profile
--   • post_impression   — when a post appears on screen in Lenta (already partially tracked via views_count,
--                          but we need per-event granularity for CTR/funnel analytics)
--
-- All events are INSERT-only, append-only — cheap to write, easy to aggregate.
-- Indexes support the teacher analytics endpoint's time-windowed aggregations.

-- ─── 1. Core events table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS analytics_events (
    id            BIGSERIAL PRIMARY KEY,
    event_type    TEXT        NOT NULL,          -- 'course_view' | 'course_impression' | 'profile_visit' | 'post_impression'
    actor_id      BIGINT      NOT NULL DEFAULT 0, -- viewer's telegram_id (0 = anonymous)
    target_id     BIGINT      NOT NULL,          -- course_id, profile telegram_id, or post_id
    teacher_id    BIGINT      NOT NULL DEFAULT 0, -- denormalized owner for fast teacher-scoped queries
    source        TEXT        NOT NULL DEFAULT 'direct', -- 'lenta' | 'search' | 'external' | 'direct'
    meta          JSONB       NOT NULL DEFAULT '{}',     -- flexible extra data (referrer, city, etc.)
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Composite indexes for the teacher analytics queries
CREATE INDEX IF NOT EXISTS idx_ae_teacher_type_ts
    ON analytics_events (teacher_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ae_target_type
    ON analytics_events (target_id, event_type);

CREATE INDEX IF NOT EXISTS idx_ae_created_at
    ON analytics_events (created_at DESC);


-- ─── 2. Aggregation helper: teacher traffic funnel (last N days) ────────────

CREATE OR REPLACE FUNCTION teacher_traffic_funnel(
    p_teacher_id  BIGINT,
    p_days        INTEGER DEFAULT 30
)
RETURNS TABLE (
    impressions       BIGINT,
    course_views      BIGINT,
    enrollments       BIGINT,
    source_lenta      BIGINT,
    source_search     BIGINT,
    source_external   BIGINT,
    source_direct     BIGINT
) LANGUAGE sql STABLE AS $$
    WITH evt AS (
        SELECT *
        FROM   analytics_events
        WHERE  teacher_id = p_teacher_id
          AND  created_at > now() - (p_days || ' days')::INTERVAL
    )
    SELECT
        COALESCE(SUM(CASE WHEN event_type IN ('course_impression', 'post_impression') THEN 1 END), 0) AS impressions,
        COALESCE(SUM(CASE WHEN event_type = 'course_view' THEN 1 END), 0)                             AS course_views,
        -- enrollments come from course_enrollments, joined below
        (SELECT COUNT(*) FROM course_enrollments ce
         JOIN courses c ON c.id = ce.course_id
         WHERE c.teacher_id = p_teacher_id
           AND ce.created_at > now() - (p_days || ' days')::INTERVAL)                                  AS enrollments,
        COALESCE(SUM(CASE WHEN event_type = 'course_view' AND source = 'lenta'    THEN 1 END), 0)     AS source_lenta,
        COALESCE(SUM(CASE WHEN event_type = 'course_view' AND source = 'search'   THEN 1 END), 0)     AS source_search,
        COALESCE(SUM(CASE WHEN event_type = 'course_view' AND source = 'external' THEN 1 END), 0)     AS source_external,
        COALESCE(SUM(CASE WHEN event_type = 'course_view' AND source = 'direct'   THEN 1 END), 0)     AS source_direct
    FROM evt;
$$;


-- ─── 3. Growth correlation: daily post count + profile visits (last 30d) ────

CREATE OR REPLACE FUNCTION teacher_growth_correlation(
    p_teacher_id  BIGINT,
    p_days        INTEGER DEFAULT 30
)
RETURNS TABLE (
    day             DATE,
    posts_count     BIGINT,
    profile_visits  BIGINT
) LANGUAGE sql STABLE AS $$
    WITH days AS (
        SELECT generate_series(
            (CURRENT_DATE - (p_days - 1)),
            CURRENT_DATE,
            '1 day'::INTERVAL
        )::DATE AS d
    ),
    daily_posts AS (
        SELECT created_at::DATE AS d, COUNT(*) AS n
        FROM   posts
        WHERE  author_id = p_teacher_id
          AND  created_at >= (CURRENT_DATE - (p_days - 1))
        GROUP BY 1
    ),
    daily_visits AS (
        SELECT created_at::DATE AS d, COUNT(*) AS n
        FROM   analytics_events
        WHERE  target_id = p_teacher_id
          AND  teacher_id = p_teacher_id
          AND  event_type = 'profile_visit'
          AND  created_at >= (CURRENT_DATE - (p_days - 1))
        GROUP BY 1
    )
    SELECT
        days.d                          AS day,
        COALESCE(dp.n, 0)              AS posts_count,
        COALESCE(dv.n, 0)              AS profile_visits
    FROM days
    LEFT JOIN daily_posts  dp ON dp.d = days.d
    LEFT JOIN daily_visits dv ON dv.d = days.d
    ORDER BY days.d;
$$;


-- ─── 4. Student demographics helper ────────────────────────────────────────

CREATE OR REPLACE FUNCTION teacher_student_demographics(
    p_teacher_id BIGINT
)
RETURNS TABLE (
    level_bucket  TEXT,
    student_count BIGINT
) LANGUAGE sql STABLE AS $$
    WITH enrolled AS (
        SELECT DISTINCT ce.student_id
        FROM   course_enrollments ce
        JOIN   courses c ON c.id = ce.course_id
        WHERE  c.teacher_id = p_teacher_id
          AND  ce.is_active = true
    )
    SELECT
        CASE
            WHEN p.level BETWEEN 1 AND 5   THEN 'Boshlang''ich (1–5)'
            WHEN p.level BETWEEN 6 AND 15  THEN 'O''rta (6–15)'
            WHEN p.level BETWEEN 16 AND 30 THEN 'Yuqori (16–30)'
            ELSE 'Ekspert (30+)'
        END AS level_bucket,
        COUNT(*) AS student_count
    FROM enrolled e
    JOIN profiles p ON p.telegram_id = e.student_id
    GROUP BY 1
    ORDER BY MIN(p.level);
$$;


-- ─── 5. Batch insert helper for frontend bulk tracking ─────────────────────

CREATE OR REPLACE FUNCTION track_analytics_events(
    p_events JSONB
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO analytics_events (event_type, actor_id, target_id, teacher_id, source, meta)
    SELECT
        (e->>'event_type')::TEXT,
        COALESCE((e->>'actor_id')::BIGINT, 0),
        (e->>'target_id')::BIGINT,
        COALESCE((e->>'teacher_id')::BIGINT, 0),
        COALESCE(e->>'source', 'direct'),
        COALESCE((e->'meta')::JSONB, '{}')
    FROM jsonb_array_elements(p_events) AS e;
END;
$$;
