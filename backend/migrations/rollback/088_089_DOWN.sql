-- 088_089_DOWN.sql — LAST RESORT schema rollback for 088_tanga_currency.sql
-- and 089_ai_infrastructure.sql.
--
-- DO NOT RUN THIS AS YOUR ROLLBACK PLAN. Read DEPLOY_RUNBOOK.md first.
--
-- The recommended rollback for a bad Tanga/AI deploy is: redeploy the
-- PREVIOUS application code, and leave this schema in place. The old code
-- never references tanga_balance, tanga_transactions, app_config, or any
-- of the ai_* tables — they are purely additive columns/tables, inert and
-- harmless to a rolled-back app. That path is instant, requires no DB
-- write, and loses zero data.
--
-- This script is for the rare case where you specifically need the SCHEMA
-- itself gone (e.g. a compliance request, or starting over after a botched
-- migration before any real traffic touched it). Running it after real
-- production traffic has flowed through Tanga:
--   - PERMANENTLY DELETES the tanga_transactions ledger — every spend/grant
--     record, gone. This is exactly the data the ledger exists to protect
--     ("my Tanga disappeared" support cases become unanswerable).
--   - PERMANENTLY DELETES ai_usage_log — the only record of AI cost/usage,
--     needed for the eventual subscription pricing.
--   - Any tanga_balance a user held that diverged from total_xp (i.e. any
--     spend since deploy) is silently discarded — total_xp is NOT
--     recalculated to compensate.
--
-- If you are running this after real traffic: export tanga_transactions
-- and ai_usage_log to cold storage FIRST. This script does not do that
-- for you.

BEGIN;

DROP TABLE IF EXISTS weekly_reviews;
DROP TABLE IF EXISTS ai_daily_usage;
DROP TABLE IF EXISTS ai_response_cache;
DROP TABLE IF EXISTS ai_usage_log;

DROP TABLE IF EXISTS app_config;
DROP TABLE IF EXISTS tanga_transactions;
ALTER TABLE profiles DROP COLUMN IF EXISTS tanga_balance;

COMMIT;
