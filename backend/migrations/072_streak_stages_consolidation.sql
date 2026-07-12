-- 072_streak_stages_consolidation.sql
--
-- Consolidates the streak-milestone system onto the tree-stage system (one
-- event: tree evolves + XP awarded + badge granted, instead of two unrelated
-- systems that only coincidentally lined up on 4 of their 10/4/8/4 days).
--
-- MUST run after 070 (xp_logs now accepts 'STREAK_STAGE') and 071 (welcome/
-- deck-milestone backfill). Preserves ALL existing data:
--   - 2 real completions exist today (user 807466591: streak_7, streak_14,
--     verified live 2026-07-12) and MUST remain valid and unrevoked.
--   - No completions exist yet for streak_30 or streak_100.
--
-- ── Key-preservation decision (read before touching this file again) ───────
-- The naive approach — renaming streak_7/streak_14/streak_30's `key` values
-- to stage_3/stage_4/stage_5 — requires either dropping+recreating the FK on
-- user_stage_completions or relying on constraint deferrability we don't
-- have, both riskier than necessary for a purely cosmetic rename. Instead:
--   - The 3 existing rows (streak_7, streak_14, streak_30) KEEP their
--     original `key` values. Their required_days/bonus_xp are UNCHANGED
--     (nobody loses XP). Only their display text (title/description/icon)
--     and new stage_number are updated to match the canonical tree-stage
--     identity, since that's what the UI will render (Phase 3).
--   - The 7 new stages (1,2,6,7,8,9,10) get new `stage_N` keys — no prior
--     row exists for them, so no FK risk.
--   - Net effect: `key` is an internal identifier only, never shown to
--     users; `stage_number` (1-10) and `title` are what the UI actually
--     uses. Mixed key-naming is intentional and safe, not an oversight.
--
-- ── Stage 1 threshold decision ──────────────────────────────────────────────
-- Stage 1 (Urug') visually displays from streak_days = 0 (a brand-new user's
-- tree starts as a seed — see lib/treeTheme.ts TREE_STAGES[0].streakDays=0,
-- UNCHANGED, this migration does not touch the client). But the *award*
-- threshold here is set to required_days = 1 — a zero-streak user must not
-- receive stage-1 XP just for opening the app. The client's visual threshold
-- and the server's award threshold are intentionally different values for
-- stage 1 only; this is documented so nobody "fixes" it into a mismatch bug.
--
-- ── streak_100 decision ─────────────────────────────────────────────────────
-- No completions exist for it (verified live). Superseded by stage_8 (120
-- days, 1200 XP). Marked is_active = FALSE rather than deleted or repurposed,
-- so it remains valid/queryable if a completion is ever found, and so
-- historical xp_logs rows referencing it (if any exist) are never orphaned.

BEGIN;

-- 1. Rename tables + column. Postgres preserves all rows, indexes, and the
--    FK/UNIQUE constraints automatically across a RENAME.
ALTER TABLE streak_challenges          RENAME TO streak_stages;
ALTER TABLE user_challenge_completions RENAME TO user_stage_completions;
ALTER TABLE user_stage_completions     RENAME COLUMN challenge_key TO stage_key;

-- 2. New column for client tree-art mapping (1-10). Nullable for now; the
--    legacy streak_100 row intentionally has no stage_number (it's inactive
--    and outside the 1-10 sequence).
ALTER TABLE streak_stages ADD COLUMN IF NOT EXISTS stage_number SMALLINT;

-- 3. Update the 3 existing rows in place — required_days and bonus_xp are
--    UNCHANGED (preserves the value of existing completions). Only display
--    text and stage_number change.
UPDATE streak_stages SET
    title       = 'Yosh nihol',
    description = 'Nozik poya va birinchi barglar paydo bo''ladi.',
    icon        = '🌿',
    stage_number = 3
WHERE key = 'streak_7';

UPDATE streak_stages SET
    title       = 'O''suvchi daraxt',
    description = 'Haqiqiy tana, shoxlar va yosh toj.',
    icon        = '🌳',
    stage_number = 4
WHERE key = 'streak_14';

UPDATE streak_stages SET
    title       = 'Gullayotgan daraxt',
    description = 'Yashil barglar orasida maysalarda kichik gullar.',
    icon        = '🌸',
    stage_number = 5
WHERE key = 'streak_30';

-- 4. Deactivate the legacy 100-day row (superseded by stage_8 @ 120 days).
--    No completions exist for it today — nothing is revoked.
UPDATE streak_stages SET is_active = FALSE WHERE key = 'streak_100';

-- 5. Insert the 7 new stages (1, 2, 6, 7, 8, 9, 10). Names/thresholds taken
--    verbatim from lib/treeTheme.ts TREE_STAGES — do not invent new ones.
--    Stage 1's required_days is 1, not 0 — see decision note above.
INSERT INTO streak_stages (key, title, description, required_days, bonus_xp, icon, sort_order, is_active)
VALUES
    ('stage_1',  'O''zgarish urug''i',    'Issiq, sehrli tuproqda yorqin urug'' yotadi.',                1,   10,   '🌰', 0, TRUE),
    ('stage_2',  'Kichik ko''chat',       'Birinchi yashil novdalar nurga intiladi.',                    3,   25,   '🌱', 1, TRUE),
    ('stage_6',  'Sehrli daraxt',         'Barglar porlaydi; muloyim ko''k nur uyg''onadi.',             50,  500,  '✨', 5, TRUE),
    ('stage_7',  'Gullab-yashnagan',      'Gullar ochiladi va kapalaklar tashrif buyuradi.',             75,  750,  '🦋', 6, TRUE),
    ('stage_8',  'Qadimiy bilim',         'Oltin barglar va xotiradagi sehrli belgilar.',                120, 1200, '📜', 7, TRUE),
    ('stage_9',  'Samoviy daraxt',        'Suzuvchi nurlar osmon tojini o''rab turadi.',                 200, 2000, '☁️', 8, TRUE),
    ('stage_10', 'Abadiy dunyo daraxti',  'Afsonaviy dunyo daraxti — porloq va abadiy.',                 365, 5000, '🌟', 9, TRUE)
ON CONFLICT (key) DO NOTHING;

-- 6. Set stage_number and sort_order for the 3 preserved rows to their
--    correct position in the 1-10 sequence (done after insert so all 10
--    rows can be sanity-checked together at the end).
UPDATE streak_stages SET sort_order = 2 WHERE key = 'streak_7';   -- stage_number 3
UPDATE streak_stages SET sort_order = 3 WHERE key = 'streak_14';  -- stage_number 4
UPDATE streak_stages SET sort_order = 4 WHERE key = 'streak_30';  -- stage_number 5

COMMIT;

-- ── Post-migration sanity check — run this manually and confirm 10 rows,
--    stage_number 1-10 each exactly once, ordered by required_days ────────
-- SELECT key, stage_number, required_days, bonus_xp, title, is_active
-- FROM streak_stages ORDER BY sort_order;
