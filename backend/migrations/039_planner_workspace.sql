-- ═══════════════════════════════════════════════════════════════════════════════
-- 039_planner_workspace.sql
-- Ish Joyi (Workspace) — Kanban planner + personal notes
--
-- Tables:
--   planner_tasks  — Kanban cards with columns, priority, optional course link
--   planner_notes  — Simple per-user notes (markdown/plain text)
-- ═══════════════════════════════════════════════════════════════════════════════


-- ── 1. planner_tasks ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planner_tasks (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  title        TEXT         NOT NULL,
  description  TEXT,
  status       TEXT         NOT NULL DEFAULT 'todo'
                            CHECK (status IN ('todo', 'in_progress', 'done')),
  priority     TEXT         NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('low', 'medium', 'high')),
  sort_order   INT          NOT NULL DEFAULT 0,
  -- Optional link to a course/lesson for "Play" button
  linked_course_id  INT,
  linked_lesson_id  INT,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS planner_tasks_user_status_idx
  ON planner_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS planner_tasks_user_sort_idx
  ON planner_tasks(user_id, sort_order);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION planner_tasks_update_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_planner_tasks_updated ON planner_tasks;
CREATE TRIGGER trg_planner_tasks_updated
  BEFORE UPDATE ON planner_tasks
  FOR EACH ROW EXECUTE FUNCTION planner_tasks_update_ts();


-- ── 2. planner_notes ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS planner_notes (
  id         BIGSERIAL    PRIMARY KEY,
  user_id    BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  title      TEXT         NOT NULL DEFAULT '',
  content    TEXT         NOT NULL DEFAULT '',
  sort_order INT          NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS planner_notes_user_idx ON planner_notes(user_id);

DROP TRIGGER IF EXISTS trg_planner_notes_updated ON planner_notes;
CREATE TRIGGER trg_planner_notes_updated
  BEFORE UPDATE ON planner_notes
  FOR EACH ROW EXECUTE FUNCTION planner_tasks_update_ts();


-- ── 3. RLS policies ─────────────────────────────────────────────────────────

ALTER TABLE planner_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_notes ENABLE ROW LEVEL SECURITY;

-- Tasks: users can only see/edit their own
CREATE POLICY planner_tasks_own ON planner_tasks
  FOR ALL USING  (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::BIGINT)
  WITH CHECK     (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::BIGINT);

-- Notes: same
CREATE POLICY planner_notes_own ON planner_notes
  FOR ALL USING  (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::BIGINT)
  WITH CHECK     (user_id = (current_setting('request.jwt.claims', true)::json->>'sub')::BIGINT);

-- Allow service_role (backend) to bypass RLS
CREATE POLICY planner_tasks_service ON planner_tasks
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY planner_notes_service ON planner_notes
  FOR ALL USING (true) WITH CHECK (true);
