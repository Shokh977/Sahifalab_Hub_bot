-- Migration 051: poll_votes table (for voting on poll-type posts)

CREATE TABLE IF NOT EXISTS poll_votes (
  id         BIGSERIAL    PRIMARY KEY,
  post_id    INTEGER      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  option_idx INTEGER      NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_poll_vote UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_poll_votes_post ON poll_votes(post_id);
CREATE INDEX IF NOT EXISTS ix_poll_votes_user ON poll_votes(user_id);
