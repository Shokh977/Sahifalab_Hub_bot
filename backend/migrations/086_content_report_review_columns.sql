-- 086_content_report_review_columns.sql
-- content_reports (079_user_blocks_content_reports.sql) has always been
-- write-only: POST /api/v1/social/reports inserts into it, but nothing ever
-- reads it back — there was no admin endpoint or UI page for post/user
-- reports at all. Adding the review-tracking columns deck_reports already
-- has (066_public_flashcard_decks.sql) so GET/POST /api/admin/reports can
-- follow the exact same pattern as the existing deck-reports admin queue.

ALTER TABLE content_reports
  ADD COLUMN IF NOT EXISTS reviewed_by BIGINT      REFERENCES profiles(telegram_id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
