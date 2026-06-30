-- 066_public_flashcard_decks.sql
-- step-14-public-flashcard-decks: public deck library (publish, discover, clone, rate, report).
--
-- Adapted from the step-14 spec to match this codebase's actual conventions:
--   - flashcard_decks.id and profiles.telegram_id are BIGINT, not UUID — all new
--     tables use BIGSERIAL / BIGINT FKs to match, not gen_random_uuid().
--   - flashcard_decks.is_public already exists (added at table creation, step-11)
--     and is reused as-is rather than re-added.
--   - There is no separate `users` table; user identity is `profiles.telegram_id`.

-- ── Extend flashcard_decks for publishing/discovery/moderation ────────────────
ALTER TABLE flashcard_decks
  ADD COLUMN IF NOT EXISTS published_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_anonymous         BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS category             VARCHAR(50),
  ADD COLUMN IF NOT EXISTS badge_type           VARCHAR(20) NOT NULL DEFAULT 'none',
                            -- 'none' | 'official' | 'verified_creator'
  ADD COLUMN IF NOT EXISTS is_featured          BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_verified          BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS clone_count          INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_avg           REAL        NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS rating_count         INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cloned_from_deck_id  BIGINT      REFERENCES flashcard_decks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_status    VARCHAR(20) NOT NULL DEFAULT 'approved',
                            -- 'approved' | 'pending_review' | 'removed'
  ADD COLUMN IF NOT EXISTS removed_reason       TEXT;

CREATE INDEX IF NOT EXISTS idx_flashcard_decks_public ON flashcard_decks(is_public, category, clone_count DESC)
    WHERE is_public = TRUE AND moderation_status = 'approved';
CREATE INDEX IF NOT EXISTS idx_flashcard_decks_featured ON flashcard_decks(is_featured, published_at DESC)
    WHERE is_featured = TRUE;

-- ── Per-user publish ban (admin moderation action; default everyone can publish) ──
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS can_publish BOOLEAN NOT NULL DEFAULT TRUE;

-- ── Deck clones: tracks who cloned what, for attribution + the one-clone-per-user rule ──
CREATE TABLE IF NOT EXISTS deck_clones (
    id               BIGSERIAL   PRIMARY KEY,
    original_deck_id BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    cloned_deck_id   BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    cloned_by        BIGINT      NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(original_deck_id, cloned_by)
);

CREATE INDEX IF NOT EXISTS idx_deck_clones_original ON deck_clones(original_deck_id);
CREATE INDEX IF NOT EXISTS idx_deck_clones_user     ON deck_clones(cloned_by);

-- ── Deck ratings & reviews — only cloners may rate (enforced in API) ──────────
CREATE TABLE IF NOT EXISTS deck_ratings (
    id         BIGSERIAL   PRIMARY KEY,
    deck_id    BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    user_id    BIGINT      NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    rating     SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(deck_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_deck_ratings_deck ON deck_ratings(deck_id, created_at DESC);

-- ── Deck reports — moderation queue, 3+ pending reports auto-hides a deck ─────
CREATE TABLE IF NOT EXISTS deck_reports (
    id          BIGSERIAL   PRIMARY KEY,
    deck_id     BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
    reported_by BIGINT      NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    reason      VARCHAR(30) NOT NULL,
                -- 'spam' | 'errors' | 'inappropriate' | 'offensive' | 'copyright' | 'other'
    details     TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
                -- 'pending' | 'reviewed' | 'dismissed' | 'actioned'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by BIGINT      REFERENCES profiles(telegram_id),
    reviewed_at TIMESTAMPTZ,
    UNIQUE(deck_id, reported_by)
);

CREATE INDEX IF NOT EXISTS idx_deck_reports_pending ON deck_reports(status, created_at DESC) WHERE status = 'pending';
