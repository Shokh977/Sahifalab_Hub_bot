"""
Migration: Create book_purchase and book_rating tables.
Run this in Supabase SQL Editor or via psql.
"""

UPGRADE_SQL = """
-- ── Book Purchase (payment tracking) ────────────────────────────
CREATE TABLE IF NOT EXISTS book_purchase (
    id              SERIAL PRIMARY KEY,
    book_id         INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
    telegram_id     INTEGER NOT NULL,
    provider        VARCHAR(30) NOT NULL,       -- telegram_stars | click | payme
    provider_transaction_id VARCHAR(255),        -- external tx id
    order_id        VARCHAR(100) NOT NULL UNIQUE,
    amount          FLOAT NOT NULL,
    currency        VARCHAR(10) NOT NULL DEFAULT 'UZS',
    status          VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | completed | cancelled | refunded
    created_at      TIMESTAMP DEFAULT NOW(),
    completed_at    TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_book_purchase_book_id     ON book_purchase(book_id);
CREATE INDEX IF NOT EXISTS idx_book_purchase_telegram_id ON book_purchase(telegram_id);
CREATE INDEX IF NOT EXISTS idx_book_purchase_order_id    ON book_purchase(order_id);
CREATE INDEX IF NOT EXISTS idx_book_purchase_status      ON book_purchase(status);
CREATE INDEX IF NOT EXISTS idx_book_purchase_provider    ON book_purchase(provider);

-- ── Book Rating (user star ratings) ─────────────────────────────
CREATE TABLE IF NOT EXISTS book_rating (
    id              SERIAL PRIMARY KEY,
    book_id         INTEGER NOT NULL REFERENCES book(id) ON DELETE CASCADE,
    telegram_id     INTEGER NOT NULL,
    rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(book_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_book_rating_book_id     ON book_rating(book_id);
CREATE INDEX IF NOT EXISTS idx_book_rating_telegram_id ON book_rating(telegram_id);
"""

DOWNGRADE_SQL = """
DROP TABLE IF EXISTS book_rating;
DROP TABLE IF EXISTS book_purchase;
"""

if __name__ == "__main__":
    print("=== Run this SQL in Supabase SQL Editor ===")
    print(UPGRADE_SQL)
