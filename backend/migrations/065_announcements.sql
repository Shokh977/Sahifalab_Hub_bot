-- 065: Broadcast announcements shown as modal in the mobile app

CREATE TABLE IF NOT EXISTS announcements (
    id         SERIAL PRIMARY KEY,
    title      VARCHAR(300)  NOT NULL,
    body       TEXT          NOT NULL,
    image_url  VARCHAR(1000),
    cta_text   VARCHAR(100),
    cta_link   VARCHAR(1000),
    starts_at  TIMESTAMPTZ,          -- NULL = show immediately
    expires_at TIMESTAMPTZ,          -- NULL = never expires
    is_active  BOOLEAN       NOT NULL DEFAULT TRUE,
    created_by BIGINT,               -- admin telegram_id
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcement_views (
    id              SERIAL PRIMARY KEY,
    announcement_id INTEGER     NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id         BIGINT      NOT NULL,
    seen_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ann_view UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ann_views_ann_id ON announcement_views(announcement_id);
