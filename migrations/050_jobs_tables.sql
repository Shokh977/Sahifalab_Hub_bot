-- Migration 050: jobs and job_applications tables (Ish joyi feature)

CREATE TABLE IF NOT EXISTS jobs (
  id              BIGSERIAL    PRIMARY KEY,
  posted_by       BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  company_name    TEXT         NOT NULL,
  title           TEXT         NOT NULL,
  description     TEXT         NOT NULL,
  location        TEXT,
  job_type        VARCHAR(20)  NOT NULL DEFAULT 'full_time',
                  -- full_time | part_time | remote | freelance | internship
  salary_min      INTEGER,
  salary_max      INTEGER,
  salary_currency VARCHAR(10)  NOT NULL DEFAULT 'UZS',
  required_skills JSONB        NOT NULL DEFAULT '[]',
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,

  CONSTRAINT chk_salary_range
    CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min)
);

CREATE INDEX IF NOT EXISTS ix_jobs_posted_by       ON jobs(posted_by);
CREATE INDEX IF NOT EXISTS ix_jobs_active_created  ON jobs(is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_jobs_skills_gin      ON jobs USING GIN(required_skills);

CREATE TABLE IF NOT EXISTS job_applications (
  id           BIGSERIAL    PRIMARY KEY,
  job_id       BIGINT       NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  applicant_id BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  message      TEXT,
  status       VARCHAR(20)  NOT NULL DEFAULT 'applied',
                -- applied | viewed | shortlisted | rejected
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_job_application UNIQUE (job_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS ix_job_applications_job       ON job_applications(job_id, status);
CREATE INDEX IF NOT EXISTS ix_job_applications_applicant ON job_applications(applicant_id);
