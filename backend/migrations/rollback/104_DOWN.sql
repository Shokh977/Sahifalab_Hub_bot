-- Reverts 104_deck_new_per_day.sql. Decks fall back to 10 new cards per session.
ALTER TABLE flashcard_decks DROP COLUMN IF EXISTS new_per_day;
