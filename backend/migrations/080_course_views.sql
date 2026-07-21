-- 080_course_views.sql — per-student course view tracking for teacher analytics
--
-- Lets a teacher see exactly how many distinct students opened their course
-- page, and what fraction of those viewers went on to enroll/buy. One row
-- per (course_id, viewer_id) — view_count/last_viewed_at accumulate repeat
-- opens by the same student instead of creating duplicate rows, so
-- COUNT(*) over this table is always a unique-viewer count.

CREATE TABLE IF NOT EXISTS course_views (
    id              SERIAL PRIMARY KEY,
    course_id       INT    NOT NULL REFERENCES courses(id)   ON DELETE CASCADE,
    viewer_id       BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    view_count      INT    NOT NULL DEFAULT 1,
    first_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_course_view UNIQUE (course_id, viewer_id)
);
CREATE INDEX IF NOT EXISTS ix_course_views_course ON course_views(course_id);
CREATE INDEX IF NOT EXISTS ix_course_views_viewer ON course_views(viewer_id);
