-- 101_daily_quiz_variety.sql — 5-savol-expanded-categories spec + variety fix.
--
-- sub_topic: the one sub-topic of the day's category that generation was
-- seeded with (category_config.choose_sub_topic picks the least recently
-- used one per category, read back from this column).
--
-- concept_tag: category-prefixed tag for the fact a question is built on
-- (etymology_al_khwarizmi). generate_week blocks any tag used on another
-- day in the last 120 days and passes the category's last 50 tags to the
-- generator. NULL for questions generated before this migration.
--
-- Must be applied BEFORE deploying the backend that reads these columns.
ALTER TABLE daily_quizzes
    ADD COLUMN IF NOT EXISTS sub_topic TEXT;

ALTER TABLE daily_quiz_questions
    ADD COLUMN IF NOT EXISTS concept_tag TEXT;

CREATE INDEX IF NOT EXISTS idx_daily_quiz_questions_concept_tag
    ON daily_quiz_questions (concept_tag)
    WHERE concept_tag IS NOT NULL;
