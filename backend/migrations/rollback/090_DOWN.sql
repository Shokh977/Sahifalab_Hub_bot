-- 090_DOWN.sql — LAST RESORT schema rollback for 090_daily_quiz.sql.
--
-- As with 088/089 (see 088_089_DOWN.sql), the recommended rollback for a bad
-- deploy is: redeploy the PREVIOUS application code, leave this schema in
-- place. The old code never references any of these tables/columns — purely
-- additive, inert and harmless to a rolled-back app.
--
-- Running this after real users have played a quiz PERMANENTLY DELETES
-- every attempt, answer, and report on record. Only run this if you
-- specifically need the schema gone before any real traffic touched it.

DROP TABLE IF EXISTS daily_quiz_reports;
DROP TABLE IF EXISTS daily_quiz_attempts;
DROP TABLE IF EXISTS daily_quiz_questions;
DROP TABLE IF EXISTS daily_quizzes;

ALTER TABLE profiles
    DROP COLUMN IF EXISTS quiz_streak_days,
    DROP COLUMN IF EXISTS quiz_last_played_date;

-- NOT reverting ai_usage_log.user_id back to NOT NULL — any system-attributed
-- rows already written (NULL user_id) would violate it immediately, and
-- there's no compelling reason to force it back regardless.
