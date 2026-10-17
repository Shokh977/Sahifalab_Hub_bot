-- 104_deck_new_per_day.sql — redesign Phase 6 (Kartalar).
--
-- Per-deck daily limit on brand-new cards. Asked when copying a big public
-- deck ("Kuniga nechta yangi karta?" 10/20/30) and editable on the deck.
-- NULL keeps the old rule (up to 10 new cards per study session), so every
-- existing deck behaves exactly as before. SM-2 itself is unchanged.
ALTER TABLE flashcard_decks ADD COLUMN IF NOT EXISTS new_per_day SMALLINT;
