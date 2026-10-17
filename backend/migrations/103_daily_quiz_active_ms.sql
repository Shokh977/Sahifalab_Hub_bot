-- 103_daily_quiz_active_ms.sql — foreground-only play time for "5 Savol".
--
-- elapsed_ms (server clock, delivered_at → submitted_at) stays the ranking
-- tie-break, unchanged. active_ms is what the player actually spent with the
-- quiz screen in the foreground, measured by the client (AppState) and
-- clamped to [0, elapsed_ms] by the server — used for the time metric in
-- the admin analytics only, never for ranking.
--
-- Written best-effort in a SAVEPOINT by daily_quiz_service._store_active_ms,
-- so the backend may deploy before this migration. NULL for rounds submitted
-- before it, and for older app builds that don't send it. Safe to re-run.

ALTER TABLE daily_quiz_attempts ADD COLUMN IF NOT EXISTS active_ms INTEGER;
