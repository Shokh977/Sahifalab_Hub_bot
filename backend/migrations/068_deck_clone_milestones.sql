-- 068_deck_clone_milestones.sql
-- step-14-public-flashcard-decks Part 8: tracks which clone-count milestones
-- (10/50/100) a deck has already paid the creator XP bonus for, so the
-- one-time award can't be re-triggered.

ALTER TABLE flashcard_decks
  ADD COLUMN IF NOT EXISTS clone_milestones_awarded INTEGER[] NOT NULL DEFAULT '{}';
