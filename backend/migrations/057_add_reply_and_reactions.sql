-- Migration 057: Reply-to-message + message reactions
--
-- Adds:
--   direct_messages.reply_to_id  — nullable FK to self (quoted reply)
--   message_reactions             — per-message emoji reactions

ALTER TABLE direct_messages
    ADD COLUMN IF NOT EXISTS reply_to_id INT
        REFERENCES direct_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dm_reply_to ON direct_messages(reply_to_id)
    WHERE reply_to_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS message_reactions (
    id          SERIAL PRIMARY KEY,
    message_id  INT         NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
    user_id     BIGINT      NOT NULL,
    emoji       VARCHAR(10) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_msg_reactions_message ON message_reactions(message_id);
