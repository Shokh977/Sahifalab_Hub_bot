-- 105_question_submissions.sql — "Siz ham savol yuboring": user-submitted
-- 5 Savol questions, and the admin swap of an approved one into an
-- already-scheduled future quiz.
--
-- question_submissions    — one row per user-written question (question, 4
--                           options, the submitter's correct index). The AI
--                           review only ADVISES (ai_verdict / ai_confidence);
--                           nothing reaches a quiz without an admin approve +
--                           swap. Status: pending_review -> approved ->
--                           scheduled -> published, or rejected | duplicate.
-- daily_quiz_question_pool — verified AI questions not currently in any quiz:
--                           the question a swap displaces (never deleted), and
--                           generate_week's verified-but-unselected leftovers.
--                           generate_week seeds new days from it first, and
--                           unswap/rebalance pick from it.
-- daily_quiz_swap_log     — audit: every swap / unswap / rebalance, who, when,
--                           question in, question out.
-- question_assist_requests — the distractor-assist cap (rolling 24 h, server
--                           time), reserved BEFORE the AI call.
--
-- Ids are BIGSERIAL like every other table here (the brief's uuid columns
-- would not join daily_quizzes / daily_quiz_questions, which are BIGINT).
-- daily_quiz_questions already has a `source` column (the cited source of
-- the fact), so the AI-vs-user marker is `origin`, not `source`.
--
-- Status / origin are plain TEXT, not CHECK-constrained (same reason as
-- 090_daily_quiz.sql: a value used in code but missing from a CHECK made
-- an INSERT fail silently once). Valid values are listed in
-- app/services/question_submission_service.py.
--
-- Must be applied BEFORE deploying the backend that reads these columns.

CREATE TABLE IF NOT EXISTS question_submissions (
    id                  BIGSERIAL PRIMARY KEY,
    telegram_id         BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    question_text       TEXT NOT NULL,
    options             JSONB NOT NULL,             -- 4 strings, the submitter's order
    correct_index       SMALLINT NOT NULL,          -- 0..3 into `options`
    explanation         TEXT,                       -- optional, one line
    source_note         TEXT,                       -- optional "qayerdan bilasiz?"
    attribution_name    TEXT,                       -- display name snapshot at submit time
    is_anonymous        BOOLEAN NOT NULL DEFAULT FALSE,
    used_ai_assist      BOOLEAN NOT NULL DEFAULT FALSE,

    status              TEXT NOT NULL DEFAULT 'pending_review',
    rejection_reason    TEXT,                       -- internal only, never sent to the user
    ai_verdict          JSONB,                      -- advisory checks
    ai_confidence       TEXT,                       -- high | medium | low | unverifiable
    ai_reviewed_at      TIMESTAMPTZ,                -- NULL = review not done yet (the sweep retries)
    ai_review_attempts  SMALLINT NOT NULL DEFAULT 0,
    category            TEXT,                       -- AI-assigned, admin-editable (category_config key)
    difficulty          TEXT,                       -- easy | medium | hard
    concept_tag         TEXT,                       -- same scheme as generated questions

    quiz_question_id    BIGINT,                     -- daily_quiz_questions.id once swapped in
    scheduled_quiz_id   BIGINT,                     -- daily_quizzes.id
    scheduled_position  SMALLINT,                   -- 0..4
    published_at        TIMESTAMPTZ,
    reward_granted      BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by         BIGINT,                     -- admin telegram_id of the approve/reject
    reviewed_at         TIMESTAMPTZ,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_submissions_user
    ON question_submissions (telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_question_submissions_status
    ON question_submissions (status, created_at);
CREATE INDEX IF NOT EXISTS idx_question_submissions_concept_tag
    ON question_submissions (concept_tag) WHERE concept_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_question_submissions_scheduled_quiz
    ON question_submissions (scheduled_quiz_id) WHERE scheduled_quiz_id IS NOT NULL;

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS questions_published_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE daily_quiz_questions
    ADD COLUMN IF NOT EXISTS origin        TEXT NOT NULL DEFAULT 'ai',   -- 'ai' | 'user'
    ADD COLUMN IF NOT EXISTS submission_id BIGINT REFERENCES question_submissions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_daily_quiz_questions_submission
    ON daily_quiz_questions (submission_id) WHERE submission_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS daily_quiz_question_pool (
    id                  BIGSERIAL PRIMARY KEY,
    theme               TEXT NOT NULL,              -- category key the question was generated for
    question_text       TEXT NOT NULL,
    options             JSONB NOT NULL,
    correct_index       SMALLINT NOT NULL,
    explanation         TEXT NOT NULL,
    source              TEXT NOT NULL,
    difficulty          TEXT NOT NULL,
    verify_model_answer SMALLINT,
    curated_fact_id     BIGINT,
    concept_tag         TEXT,
    reason              TEXT NOT NULL,              -- 'displaced' | 'leftover'
    origin_quiz_id      BIGINT,                     -- the day it came from
    origin_position     SMALLINT,
    status              TEXT NOT NULL DEFAULT 'available',  -- 'available' | 'used'
    used_quiz_id        BIGINT,
    used_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_quiz_question_pool_available
    ON daily_quiz_question_pool (theme, difficulty, created_at) WHERE status = 'available';

CREATE TABLE IF NOT EXISTS daily_quiz_swap_log (
    id              BIGSERIAL PRIMARY KEY,
    action          TEXT NOT NULL,                  -- 'swap' | 'unswap' | 'rebalance'
    admin_id        BIGINT,                         -- telegram_id of the admin (bot calls: the acting admin)
    via             TEXT NOT NULL DEFAULT 'web',    -- 'web' | 'bot'
    quiz_id         BIGINT NOT NULL,
    position        SMALLINT NOT NULL,
    question_in     JSONB NOT NULL,
    question_out    JSONB,
    submission_id   BIGINT,
    pool_in_id      BIGINT,                         -- pool row that went INTO the quiz (unswap/rebalance)
    pool_out_id     BIGINT,                         -- pool row the displaced question became
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_quiz_swap_log_quiz ON daily_quiz_swap_log (quiz_id, position, created_at DESC);

CREATE TABLE IF NOT EXISTS question_assist_requests (
    id           BIGSERIAL PRIMARY KEY,
    telegram_id  BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
    outcome      TEXT NOT NULL DEFAULT 'reserved',  -- 'reserved' | 'success' | 'error'
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_question_assist_requests_user
    ON question_assist_requests (telegram_id, created_at DESC);

-- Every limit, the reward and the per-quiz cap: changeable without a deploy.
INSERT INTO app_config (key, value, description) VALUES
    ('question_submissions', '{
        "enabled": true,
        "daily_limit": 3,
        "max_pending": 10,
        "assist_daily_limit": 5,
        "assist_in_ui": false,
        "reward_tanga": 25,
        "max_user_per_quiz": 2,
        "dedup_days": 120,
        "min_seconds_between": 20
    }'::jsonb,
     '"Siz ham savol yuboring": daily_limit = submissions per rolling 24 h; '
     'max_pending = pending_review at once; assist_daily_limit = AI distractor '
     'suggestions per rolling 24 h; assist_in_ui = show that button in the form '
     '(off by default); reward_tanga = paid on publication only; '
     'max_user_per_quiz = user-sourced questions allowed in one 5 Savol; '
     'dedup_days = concept-tag lookback; min_seconds_between = per-user throttle. '
     'See app/services/question_submission_service.py.')
ON CONFLICT (key) DO NOTHING;
