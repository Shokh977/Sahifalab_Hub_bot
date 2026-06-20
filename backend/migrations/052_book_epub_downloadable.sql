-- Migration 052: Add is_downloadable to book table + allow EPUB uploads
-- is_downloadable = FALSE means the book can only be read in-app, not downloaded.

ALTER TABLE book
    ADD COLUMN IF NOT EXISTS is_downloadable BOOLEAN NOT NULL DEFAULT TRUE;
