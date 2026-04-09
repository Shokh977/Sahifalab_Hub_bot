-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 040: book_read_progress
-- Tracks per-user reading position for the in-app book reader.
-- PDF  → page_number (integer)
-- EPUB → cfi (CFI string from epub.js)
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS book_read_progress (
    id          BIGSERIAL PRIMARY KEY,
    book_id     INTEGER   NOT NULL REFERENCES book(id) ON DELETE CASCADE,
    telegram_id BIGINT    NOT NULL,
    page_number INTEGER   NOT NULL DEFAULT 1,       -- PDF: last read page
    cfi         TEXT,                               -- EPUB: epub.js CFI string
    percent     FLOAT     NOT NULL DEFAULT 0,       -- 0–100 reading progress
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_book_read_progress UNIQUE (book_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_brp_telegram ON book_read_progress (telegram_id);
CREATE INDEX IF NOT EXISTS idx_brp_book     ON book_read_progress (book_id);
