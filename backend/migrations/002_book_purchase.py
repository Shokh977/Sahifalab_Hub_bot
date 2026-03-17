"""
Migration: Create book_purchase table for tracking paid book purchases.
Run this in Supabase SQL Editor or via psql.
"""

UPGRADE_SQL = """
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

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_book_purchase_book_id     ON book_purchase(book_id);
CREATE INDEX IF NOT EXISTS idx_book_purchase_telegram_id ON book_purchase(telegram_id);
CREATE INDEX IF NOT EXISTS idx_book_purchase_order_id    ON book_purchase(order_id);
CREATE INDEX IF NOT EXISTS idx_book_purchase_status      ON book_purchase(status);
CREATE INDEX IF NOT EXISTS idx_book_purchase_provider    ON book_purchase(provider);
"""

DOWNGRADE_SQL = """
DROP TABLE IF EXISTS book_purchase;
"""

if __name__ == "__main__":
    print("=== Run this SQL in Supabase SQL Editor ===")
    print(UPGRADE_SQL)
