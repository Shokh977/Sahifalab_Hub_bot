-- 087_fix_telegram_id_integer_overflow.sql
-- Found while investigating the 2026-08-15 focus_sessions incident (unrelated
-- traceback that showed up in the same log window): book_rating.telegram_id
-- is a 32-bit INTEGER (max ~2.1 billion), and modern Telegram user IDs
-- routinely exceed that (e.g. 7984840136). Any query filtering/inserting on
-- one of these columns for an affected user throws
-- "value ... is out of range for type integer".
--
-- Same bug, same legacy-schema origin, found in three more columns that all
-- store raw Telegram IDs directly (not a local serial PK) — user.telegram_id,
-- book_purchase.telegram_id, user_quiz_completion.telegram_id.
-- book_read_progress.telegram_id was already BIGINT (a newer table) and
-- needs no change. ALTER COLUMN TYPE to BIGINT is safe here — strictly
-- widens the column, no data loss, no existing value can be out of range
-- for the new type.

ALTER TABLE "user"               ALTER COLUMN telegram_id TYPE BIGINT;
ALTER TABLE book_purchase        ALTER COLUMN telegram_id TYPE BIGINT;
ALTER TABLE book_rating          ALTER COLUMN telegram_id TYPE BIGINT;
ALTER TABLE user_quiz_completion ALTER COLUMN telegram_id TYPE BIGINT;
