-- 096_daily_quiz_verification_upgrade.sql — 5-savol-quality-fixes brief.
--
-- candidates_generated/candidates_verified: per-day counters so the admin
-- dashboard can show an actual rejection-rate NUMBER (candidates generated
-- vs. candidates that survived cold+deep verification), not just the
-- free-text `notes` warning string added in 094. This is deliverable 1's
-- missing piece — the verifier was already running in production, but
-- nothing computed attrition as a metric or paged admin when it spiked.
--
-- curated_fact_id: links a question back to the admin-verified fact it was
-- formatted from (content-bot's `curated_facts` table — see that repo's
-- own migration; NOT a foreign key here on purpose, since curated_facts is
-- owned and migrated by a separate deploy pipeline sharing this same
-- Postgres instance, and this codebase avoids cross-repo migration-order
-- coupling). NULL for freeform-generated or manually-authored questions.
ALTER TABLE daily_quizzes
    ADD COLUMN IF NOT EXISTS candidates_generated INTEGER,
    ADD COLUMN IF NOT EXISTS candidates_verified   INTEGER;

ALTER TABLE daily_quiz_questions
    ADD COLUMN IF NOT EXISTS curated_fact_id BIGINT;
