-- 090_daily_quiz.sql — "5 Savol" daily AI quiz (5-savol-daily-quiz-spec.md).
--
-- daily_quizzes         — one row per calendar day (publish_date), holds the
--                         5 published questions for that day via FK.
-- daily_quiz_questions  — belongs to a daily_quiz. Generated+verified rows
--                         accumulate here in 'draft' quizzes for the coming
--                         week; admin edits/approves the quiz as a whole
--                         (spec: "admin skims and approves, edits, or
--                         rejects" ~35 questions/week, not a per-question
--                         approval workflow).
-- daily_quiz_attempts   — one per (user, quiz) — the UNIQUE constraint IS
--                         the idempotency mechanism (spec: "submission is
--                         idempotent; a replay returns the original
--                         result") — no separate idempotency_key column
--                         needed, unlike Tanga's ledger, because the
--                         natural domain key already serves that role.
-- daily_quiz_reports    — one per (question, user); crossing report_count
--                         threshold auto-voids a question (app logic).
--
-- `status`/`difficulty`/`reason` are plain TEXT, not CHECK-constrained
-- enums — this codebase has a documented, repeated incident (xp_logs.source,
-- see 088_tanga_currency.sql's docstring) where a value used in code but
-- missing from a CHECK constraint made an INSERT fail silently. Valid
-- values are enumerated in app/services/daily_quiz_service.py instead.

CREATE TABLE IF NOT EXISTS daily_quizzes (
    id            BIGSERIAL PRIMARY KEY,
    quiz_number   INTEGER NOT NULL UNIQUE,      -- sequential, shown on the share card ("#47")
    publish_date  DATE NOT NULL UNIQUE,         -- the UTC calendar day this quiz is live
    theme         TEXT NOT NULL,                -- 'kitoblar' | 'miya_xotira' | 'psixologiya' | ...
    status        TEXT NOT NULL DEFAULT 'draft', -- draft -> verified -> approved -> published -> closed | voided
    published_at  TIMESTAMPTZ,                  -- set by the daily rollover cron, not publish_date's midnight
    closed_at     TIMESTAMPTZ,                  -- set when the window actually closes
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at   TIMESTAMPTZ,
    approved_by   BIGINT REFERENCES profiles(telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_quizzes_status ON daily_quizzes (status, publish_date);

CREATE TABLE IF NOT EXISTS daily_quiz_questions (
    id              BIGSERIAL PRIMARY KEY,
    quiz_id         BIGINT NOT NULL REFERENCES daily_quizzes(id) ON DELETE CASCADE,
    position        SMALLINT NOT NULL,          -- 0-4, display order
    question_text   TEXT NOT NULL,
    options         JSONB NOT NULL,             -- ["...", "...", "...", "..."] — 4 options, canonical order
    correct_index   SMALLINT NOT NULL,          -- 0-3, into the canonical `options` order above
    explanation     TEXT NOT NULL,              -- one line, shown only after window close
    source          TEXT NOT NULL,              -- specific book/study/fact cited
    difficulty      TEXT NOT NULL,              -- 'easy' | 'medium' | 'hard'
    verified        BOOLEAN NOT NULL DEFAULT FALSE,   -- did the cold second-call agree with correct_index?
    verify_model_answer SMALLINT,               -- what the cold verification call answered, for admin review
    report_count    INTEGER NOT NULL DEFAULT 0,
    voided          BOOLEAN NOT NULL DEFAULT FALSE,    -- live void after reports — refunded, excluded from scoring
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (quiz_id, position)
);

CREATE TABLE IF NOT EXISTS daily_quiz_attempts (
    id             BIGSERIAL PRIMARY KEY,
    user_id        BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    quiz_id        BIGINT NOT NULL REFERENCES daily_quizzes(id) ON DELETE CASCADE,
    delivered_at   TIMESTAMPTZ NOT NULL,        -- set on first GET /today call — server clock starts here
    submitted_at   TIMESTAMPTZ,
    elapsed_ms     INTEGER,                     -- server-computed: submitted_at - delivered_at, never client-reported
    -- [{"question_id": 123, "selected_index": 2}, ...] — option order is
    -- per-user-shuffled at delivery time, so selected_index is relative to
    -- the shuffled order the user actually saw, resolved back to
    -- options[correct_index] at scoring time, never trusted as "the" index.
    answers        JSONB,
    correct_count  SMALLINT,
    tanga_awarded  INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, quiz_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_quiz_attempts_quiz_scoring
    ON daily_quiz_attempts (quiz_id, correct_count DESC, elapsed_ms ASC);

CREATE TABLE IF NOT EXISTS daily_quiz_reports (
    id           BIGSERIAL PRIMARY KEY,
    question_id  BIGINT NOT NULL REFERENCES daily_quiz_questions(id) ON DELETE CASCADE,
    user_id      BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    reason       TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (question_id, user_id)
);

-- Play streak — deliberately separate from streak_days (the study streak).
-- A 60-second quiz must not be able to keep a study streak alive by proxy.
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS quiz_streak_days      INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quiz_last_played_date DATE;

-- Quiz generation/verification calls have no single end-user to attribute
-- cost to (spec: "one generation serves all users") — ai_usage_log.user_id
-- was NOT NULL because every prior AI feature (flashcard_gen, weekly_review)
-- is per-user. Nullable here, specifically for system-triggered rows; every
-- existing per-user call site is unaffected (still always passes a real id).
ALTER TABLE ai_usage_log ALTER COLUMN user_id DROP NOT NULL;
