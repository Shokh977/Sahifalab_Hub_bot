-- 070_widen_xp_logs_source_constraint.sql
--
-- BUG FIX: xp_logs.source had CHECK (source IN ('DEEP_WORK','QUIZ','COURSE'))
-- (from 038_xp_gamification.sql), but two call sites have been writing
-- 'WELCOME' (app/api/v1/auth.py) and 'DECK_MILESTONE' (app/api/v1/endpoints/
-- flashcards.py) since their introduction. Both awards were violating this
-- constraint on every single call and failing -- silently, because both call
-- sites wrapped add_xp() in a bare `except Exception: pass`. Verified live
-- against the running database (2026-07-12): direct INSERT attempts with
-- source='WELCOME' and source='DECK_MILESTONE' both raised
-- "violates check constraint xp_logs_source_check" (Postgres code 23514).
--
-- This migration widens the constraint to the full, actually-used set of XP
-- sources, and adds 'STREAK_STAGE' (new source for step-20's stage-XP system,
-- see migration 071) so the milestone bonus is no longer indistinguishable
-- from ordinary DEEP_WORK XP in the ledger.
--
-- RULE: any new XP source added to the codebase MUST be added to this
-- constraint in the same migration/PR that introduces it. See the matching
-- comment on XpSource in app/services/xp_service.py.

ALTER TABLE xp_logs DROP CONSTRAINT IF EXISTS xp_logs_source_check;

ALTER TABLE xp_logs ADD CONSTRAINT xp_logs_source_check
    CHECK (source IN (
        'DEEP_WORK',      -- focus timer, flashcard session/mastery, planner task-done
        'QUIZ',           -- general quiz + lesson quiz/test
        'COURSE',         -- one-time course completion bonus
        'WELCOME',        -- one-time new-user welcome bonus (was silently failing)
        'DECK_MILESTONE', -- flashcard deck clone-count bonus (was silently failing)
        'STREAK_STAGE'    -- tree-stage milestone bonus (step-20)
    ));
