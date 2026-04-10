-- Migration 047: Add xp_claimed flag to planner_tasks
--
-- SECURITY FIX: Prevents XP farming by toggling task status done→todo→done.
-- Once XP is awarded for completing a task, xp_claimed is set to TRUE and
-- no further XP will be awarded even if the task is moved back and completed again.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.planner_tasks
  ADD COLUMN IF NOT EXISTS xp_claimed BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.planner_tasks.xp_claimed IS
  'TRUE after XP was awarded for completing this task. Prevents farming via done→todo→done loop.';
