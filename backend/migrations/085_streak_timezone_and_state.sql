-- 085_streak_timezone_and_state.sql
-- Per-user IANA timezone for cron-driven streak logic (auto-freeze, at-risk
-- push, reminder dedup), plus a guard column for the free 7-day milestone
-- freeze grant. See app/services/user_time.py and app/services/freeze_service.py.
--
-- `timezone` is intentionally NOT constrained by a CHECK — Postgres has no
-- built-in IANA validator without joining against pg_timezone_names, and no
-- other write path in this codebase validates in SQL. Validation happens in
-- the endpoint (PATCH /api/auth/me) via Python's zoneinfo.ZoneInfo.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone                   TEXT NOT NULL DEFAULT 'Asia/Tashkent',
  ADD COLUMN IF NOT EXISTS last_reminder_date          DATE,
  ADD COLUMN IF NOT EXISTS last_at_risk_push_date      DATE,
  ADD COLUMN IF NOT EXISTS last_freeze_milestone_days  INT  NOT NULL DEFAULT 0;
