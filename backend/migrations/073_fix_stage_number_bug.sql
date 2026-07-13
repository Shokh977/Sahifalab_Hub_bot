-- 073_fix_stage_number_bug.sql
-- URGENT FIX for a bug in 072_streak_stages_consolidation.sql: the INSERT for
-- the 7 new stage rows (stage_1, stage_2, stage_6, stage_7, stage_8, stage_9,
-- stage_10) never included stage_number in its column list, so all 7 were
-- left NULL (only streak_7/14/30, updated via separate UPDATE statements in
-- that same migration, correctly got stage_number 3/4/5).
--
-- Live impact verified 2026-07-13: exactly one user (a synthetic test
-- account, telegram_id -631452292) hit this — they earned stage_1 for real
-- (user_stage_completions row is valid, xp_awarded=10 is correct), but the
-- badge-grant code built badge_key = f"stage_{stage_number}" against a NULL,
-- producing the literal string "stage_None" in user_badges. This migration:
--   1. Backfills stage_number for the 7 affected streak_stages rows.
--   2. Deletes the bogus "stage_None" badge row.
--   3. Grants the CORRECT "stage_1" badge to the same user so they aren't
--      shortchanged for something they legitimately earned.
-- No XP is touched — the XP award for that completion was already correct.

BEGIN;

UPDATE streak_stages SET stage_number = 1  WHERE key = 'stage_1';
UPDATE streak_stages SET stage_number = 2  WHERE key = 'stage_2';
UPDATE streak_stages SET stage_number = 6  WHERE key = 'stage_6';
UPDATE streak_stages SET stage_number = 7  WHERE key = 'stage_7';
UPDATE streak_stages SET stage_number = 8  WHERE key = 'stage_8';
UPDATE streak_stages SET stage_number = 9  WHERE key = 'stage_9';
UPDATE streak_stages SET stage_number = 10 WHERE key = 'stage_10';

-- Clean up the one bad badge row and grant the correct one in its place.
DELETE FROM user_badges WHERE badge_key = 'stage_None';

INSERT INTO user_badges (user_id, badge_key, granted_at)
SELECT usc.user_id, 'stage_1', usc.completed_at
FROM user_stage_completions usc
WHERE usc.stage_key = 'stage_1'
ON CONFLICT (user_id, badge_key) DO NOTHING;

COMMIT;

-- ── Post-fix sanity check — run manually and confirm all 10 rows have a
--    non-null stage_number (streak_100 excluded, it's inactive/legacy) ─────
-- SELECT key, stage_number, required_days, is_active FROM streak_stages ORDER BY sort_order;
