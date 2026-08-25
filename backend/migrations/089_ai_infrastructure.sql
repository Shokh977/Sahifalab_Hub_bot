-- 089_ai_infrastructure.sql
-- Tables for the AI feature layer (spec Part 4/5/6): usage/cost logging,
-- response cache, per-user daily action counters, and weekly review output.
--
-- ai_usage_log   — one row per AI provider call (or cache hit), for unit
--                  economics and for the eventual subscription pricing.
-- ai_response_cache — hash-normalised-input -> output. TTL via expires_at;
--                  no Redis in this stack (requirements.txt has none), so
--                  this is a plain Postgres table, checked/expired lazily.
-- ai_daily_usage — per-user per-day action counters, mutated with the same
--                  atomic-UPDATE-with-WHERE-guard pattern as everything else
--                  in this codebase (freeze purchase, streak freeze). This,
--                  not the Tanga price, is the actual API-cost control.
-- weekly_reviews — one row per user per ISO week; the free, cron-generated
--                  "personal adviser" output (spec Part 6, feature 2).

CREATE TABLE IF NOT EXISTS ai_usage_log (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    feature         TEXT NOT NULL,          -- 'flashcard_gen' | 'weekly_review' | 'tutor_session' | ...
    model           TEXT NOT NULL,          -- e.g. 'gemini-flash-lite-latest'
    prompt_version  TEXT NOT NULL,          -- e.g. 'flashcard_gen.v1'
    input_tokens    INTEGER,
    output_tokens   INTEGER,
    cost_usd        NUMERIC(10, 6),
    latency_ms      INTEGER,
    cache_hit       BOOLEAN NOT NULL DEFAULT FALSE,
    outcome         TEXT NOT NULL,          -- 'success' | 'error' | 'timeout' | 'refused'
    error_detail    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_log_user_created ON ai_usage_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_feature_created ON ai_usage_log (feature, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_response_cache (
    cache_key    TEXT PRIMARY KEY,          -- sha256(feature || ':' || normalised_input)
    feature      TEXT NOT NULL,
    input_hash   TEXT NOT NULL,
    output       JSONB NOT NULL,
    hit_count    INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires ON ai_response_cache (expires_at);

-- One row per (user_id, usage_date). free_used/paid_used are incremented via
-- `INSERT ... ON CONFLICT DO UPDATE ... WHERE ai_daily_usage.<col> < :cap`,
-- the same guarded-UPDATE idiom used everywhere else, so the hard daily cap
-- can never be raced past.
CREATE TABLE IF NOT EXISTS ai_daily_usage (
    user_id     BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    usage_date  DATE NOT NULL,
    free_used   INTEGER NOT NULL DEFAULT 0,
    paid_used   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS weekly_reviews (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    week_start  DATE NOT NULL,              -- Monday of the reviewed ISO week
    content     JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reviews_user ON weekly_reviews (user_id, week_start DESC);
