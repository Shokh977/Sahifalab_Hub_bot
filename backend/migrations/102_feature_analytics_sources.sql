-- 102_feature_analytics_sources.sql — where a deck and a study session came
-- from, for the admin "Xususiyatlar" analytics tab
-- (app/api/v1/endpoints/admin_feature_analytics.py).
--
-- flashcard_decks.source: manual | course | official | clone | ai_text |
-- ai_image | ai (AI decks created before this migration; text vs photo input
-- was never recorded for them).
--
-- focus_sessions.source: focus_timer | flashcards. record_study_activity()
-- writes a focus_sessions row for BOTH the focus timer and a finished
-- flashcard session, so until now the dashboard's "Taymer" count included
-- flashcard sessions. Rows from before this migration stay NULL: the two
-- kinds can't be told apart after the fact.
--
-- Both columns are written best-effort, in a SAVEPOINT, by
-- app/services/feature_analytics.py::tag_source() — so deploying the backend
-- before this migration is harmless (the tag is skipped and the analytics
-- endpoint falls back to deriving the deck source). Apply it anyway so new
-- rows get tagged. Safe to re-run.

ALTER TABLE flashcard_decks ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE focus_sessions  ADD COLUMN IF NOT EXISTS source TEXT;

-- Backfill decks. Order matters: a cloned AI deck is a clone. AI decks are
-- recognisable by the default icon /ai/flashcards/generate/confirm stamps
-- (neither client sends its own icon, and no icon picker offers 🤖).
UPDATE flashcard_decks SET source = 'clone'
 WHERE source IS NULL AND cloned_from_deck_id IS NOT NULL;
UPDATE flashcard_decks SET source = 'ai'
 WHERE source IS NULL AND icon = '🤖';
UPDATE flashcard_decks SET source = 'official'
 WHERE source IS NULL
   AND (badge_type = 'official'
        OR id IN (SELECT deck_id FROM deck_audit_log WHERE action = 'official_deck_created'));
UPDATE flashcard_decks SET source = 'course'
 WHERE source IS NULL AND course_id IS NOT NULL;
UPDATE flashcard_decks SET source = 'manual'
 WHERE source IS NULL;

-- The analytics tab scans these by time window.
CREATE INDEX IF NOT EXISTS idx_flashcard_reviews_reviewed_at ON flashcard_reviews (reviewed_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_feature_created ON ai_usage_log (feature, created_at);
