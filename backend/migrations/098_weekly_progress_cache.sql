-- 098_weekly_progress_cache.sql — daily-refreshed cache for the TRUE
-- in-progress week's stats + AI comparison narrative (current_week_progress
-- in GET /api/ai/weekly-review). One row per user, overwritten in place
-- each day — this is a cache, not a history table (the completed-week
-- archive already exists as `weekly_reviews`, one row per (user, week_start),
-- and is unaffected by this migration).
--
-- Without this, current_week_progress was being recomputed (multiple
-- queries via gather_user_stats) AND — once the AI comparison narrative is
-- added — re-generated via a Gemini call on every single screen load.
-- computed_date lets the read path cheaply tell "still today's cache" from
-- "stale, needs refresh" without any TTL/expiry bookkeeping.
CREATE TABLE IF NOT EXISTS weekly_progress_cache (
    user_id       BIGINT PRIMARY KEY REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    week_start    DATE NOT NULL,
    computed_date DATE NOT NULL,
    content       JSONB NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
