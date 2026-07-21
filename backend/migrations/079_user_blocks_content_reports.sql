-- 079_user_blocks_content_reports.sql — block a user + report a post/user
--
-- Adds the trust-and-safety primitives the app was missing entirely: posting,
-- commenting, and direct messaging between strangers previously had no block
-- or report mechanism anywhere in the product.

CREATE TABLE IF NOT EXISTS user_blocks (
    id          SERIAL PRIMARY KEY,
    blocker_id  BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    blocked_id  BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_block UNIQUE (blocker_id, blocked_id),
    CONSTRAINT chk_no_self_block CHECK (blocker_id != blocked_id)
);
CREATE INDEX IF NOT EXISTS ix_user_blocks_blocker ON user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS ix_user_blocks_blocked ON user_blocks(blocked_id);

CREATE TABLE IF NOT EXISTS content_reports (
    id          SERIAL PRIMARY KEY,
    reporter_id BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('post', 'user')),
    target_id   BIGINT NOT NULL,
    reason      VARCHAR(50) NOT NULL,
    details     TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_content_reports_reporter ON content_reports(reporter_id);
CREATE INDEX IF NOT EXISTS ix_content_reports_target ON content_reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS ix_content_reports_status ON content_reports(status);
