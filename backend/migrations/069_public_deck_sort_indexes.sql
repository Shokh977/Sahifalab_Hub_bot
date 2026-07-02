-- 069_public_deck_sort_indexes.sql
-- Add sort-specific partial indexes for the public deck browse endpoints.
--
-- The existing idx_flashcard_decks_public has columns (is_public, category, clone_count DESC).
-- Because category sits between is_public and clone_count, queries without a category filter
-- cannot use that index to satisfy ORDER BY clone_count DESC — PostgreSQL must scan the entire
-- partial index and sort the result. These new indexes allow index-scans directly in sort order.

-- Default "popular" sort (no category filter)
CREATE INDEX IF NOT EXISTS idx_public_decks_popular
    ON flashcard_decks(clone_count DESC, id)
    WHERE is_public = TRUE AND moderation_status = 'approved';

-- "Newest" sort (no category filter)
CREATE INDEX IF NOT EXISTS idx_public_decks_newest
    ON flashcard_decks(published_at DESC NULLS LAST, id)
    WHERE is_public = TRUE AND moderation_status = 'approved';

-- "Top rated" sort (query already filters rating_count >= 5)
CREATE INDEX IF NOT EXISTS idx_public_decks_top_rated
    ON flashcard_decks(rating_avg DESC, id)
    WHERE is_public = TRUE AND moderation_status = 'approved' AND rating_count >= 5;

-- Category-scoped sort indexes (used when the user picks a category tab)
CREATE INDEX IF NOT EXISTS idx_public_decks_cat_popular
    ON flashcard_decks(category, clone_count DESC)
    WHERE is_public = TRUE AND moderation_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_public_decks_cat_newest
    ON flashcard_decks(category, published_at DESC NULLS LAST)
    WHERE is_public = TRUE AND moderation_status = 'approved';

CREATE INDEX IF NOT EXISTS idx_public_decks_cat_top_rated
    ON flashcard_decks(category, rating_avg DESC)
    WHERE is_public = TRUE AND moderation_status = 'approved' AND rating_count >= 5;
