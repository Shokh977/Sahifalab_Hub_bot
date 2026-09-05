-- 097_curated_facts.sql — curated fact bank for the "5 Savol" daily quiz's
-- two culturally sensitive categories (O'zbek adabiyoti, Tarix va meros).
--
-- Originally created via content-bot/migrations/004_curated_facts.sql
-- (already applied in production) when the admin tooling briefly lived in
-- that repo's Telegram bot. Moved here — content-bot is a separate,
-- unrelated product (a news/content channel bot) that only happened to
-- share this database; the admin CRUD for this table now lives in this
-- backend's own web dashboard (see app/api/v1/endpoints/admin_curated_facts.py),
-- so this backend should own the table's schema going forward. IF NOT
-- EXISTS makes this a safe no-op against the production DB where the table
-- already exists; required for a fresh environment that never ran
-- content-bot's migrations.
CREATE TABLE IF NOT EXISTS curated_facts (
    id           BIGSERIAL PRIMARY KEY,
    fact_text    TEXT NOT NULL,
    category     TEXT NOT NULL,                    -- 'ozbek_adabiyoti' | 'tarix_meros'
    source       TEXT NOT NULL,                     -- book/author/established reference
    verified     BOOLEAN NOT NULL DEFAULT FALSE,
    active       BOOLEAN NOT NULL DEFAULT TRUE,     -- soft-delete flag
    added_by     BIGINT,
    verified_by  BIGINT,
    verified_at  TIMESTAMPTZ,
    times_used   INTEGER NOT NULL DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curated_facts_category_verified
    ON curated_facts (category, verified, active);
