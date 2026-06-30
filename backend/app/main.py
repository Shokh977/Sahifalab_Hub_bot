from pathlib import Path
from dotenv import load_dotenv

import os
import uvicorn

# Load .env from the project root (one level above backend/) or CWD
_root_env = Path(__file__).resolve().parents[2] / ".env"
if _root_env.is_file():
    load_dotenv(_root_env)
else:
    load_dotenv()  # fallback: CWD/.env

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from brotli_asgi import BrotliMiddleware
from app.api.v1 import api_router
from app.core.config import settings
from app.middleware.rate_limiter import rate_limit_middleware
import app.models  # noqa: F401 — registers all models with SQLAlchemy Base
import logging
import traceback

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="SAHIFALAB Telegram Mini App API",
    description="RESTful API for SAHIFALAB Telegram Mini App",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    # This API uses Bearer tokens (Authorization header), not cookie credentials.
    # Keep CORS permissive to avoid browser-blocked 500/4xx responses on uploads.
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Brotli compression (falls back to GZip for older clients)
# Brotli achieves ~15-20% better compression than GZip on JSON/text.
app.add_middleware(BrotliMiddleware, minimum_size=500)

# Rate limiting — 100/min, 1000/hr, 10000/day per IP
app.middleware("http")(rate_limit_middleware)


# ── Force HTTPS in redirect Location headers ──────────────────────────────────
# Railway terminates TLS at the proxy, so uvicorn sees plain HTTP.
# FastAPI's trailing-slash 307 redirects therefore use http:// in the Location
# header, which browsers block as mixed content.
@app.middleware("http")
async def _force_https_redirects(request: Request, call_next):
    response = await call_next(request)
    if response.status_code in (301, 302, 307, 308):
        loc = response.headers.get("location", "")
        if loc.startswith("http://") and "localhost" not in loc and "127.0.0.1" not in loc:
            response.headers["location"] = "https://" + loc[7:]
    # Allow Google Sign-In popup postMessage (COOP must not be same-origin)
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    return response


# ── Global exception handler — ensures CORS headers are always present ────────
# Without this, unhandled 500s bypass CORSMiddleware and browsers block the
# response as a CORS error, hiding the real problem from the frontend.
@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception on %s %s: %s\n%s",
                 request.method, request.url.path, exc, traceback.format_exc())
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        },
    )


# ── CDN Cache-Control headers ──────────────────────────────────────────────────
# These tell Bunny CDN edge nodes (and browsers) how long to cache each response.
# Paths not listed here get the default "no explicit caching" behavior.
_CACHE_RULES: list[tuple[str, str]] = [
    # Static catalogs — rarely change (revalidate via CDN purge after admin edits)
    ("/api/books",              "public, max-age=300, s-maxage=600, stale-while-revalidate=60"),
    ("/api/quizzes",            "public, max-age=300, s-maxage=600, stale-while-revalidate=60"),
    ("/api/resources",          "public, max-age=300, s-maxage=600, stale-while-revalidate=60"),
    ("/api/hero/all",           "public, max-age=300, s-maxage=600, stale-while-revalidate=60"),
    ("/api/audio/ambient",      "public, max-age=3600, s-maxage=3600"),
    # Semi-dynamic
    ("/api/courses/categories", "public, max-age=600, s-maxage=1800"),
    ("/api/courses",            "public, max-age=60, s-maxage=120, stale-while-revalidate=30"),
    ("/api/profiles/leaderboard", "public, max-age=60, s-maxage=120"),
    ("/api/profiles/dashboard-stats", "public, max-age=60, s-maxage=120"),
]


_NO_CACHE_SUFFIXES = (
    "/reviews", "/my-rating", "/progress", "/file", "/download",
    "/my-enrollment", "/my-progress", "/certificate",
)

@app.middleware("http")
async def cache_control_middleware(request, call_next):
    response = await call_next(request)
    path = request.url.path
    # Only apply to GET requests; skip user-specific endpoints entirely
    if request.method == "GET" and "Cache-Control" not in response.headers:
        if not any(path.endswith(s) for s in _NO_CACHE_SUFFIXES):
            for prefix, header in _CACHE_RULES:
                if path.startswith(prefix):
                    response.headers["Cache-Control"] = header
                    break
    return response

# Include API routes
app.include_router(api_router, prefix="/api")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/ping")
async def ping():
    """Lightweight keepalive — used by Railway health-checks and uptime monitors."""
    return "pong"

@app.get("/")
async def root():
    return {
        "message": "SAHIFALAB Telegram Mini App API",
        "version": "1.0.0",
        "docs": "/docs",
    }


# ── Background task: sync all enrolled counts once on startup ────────────────
import asyncio


async def _sync_all_enrolled_counts():
    """On startup, recount active enrollments and patch courses.enrolled_count in Supabase."""
    import httpx, os
    supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not supabase_url or not supabase_key:
        return
    headers = {
        "apikey": supabase_key,
        "Authorization": f"Bearer {supabase_key}",
        "Content-Type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Fetch all active enrollments grouped by course_id
            resp = await client.get(
                f"{supabase_url}/rest/v1/course_enrollments",
                params={"select": "course_id", "is_active": "eq.true"},
                headers=headers,
            )
            if resp.status_code >= 400:
                return
            rows = resp.json()
            # Count per course
            counts: dict[int, int] = {}
            for row in rows:
                cid = row.get("course_id")
                if cid:
                    counts[cid] = counts.get(cid, 0) + 1
            # Patch each course
            for course_id, count in counts.items():
                await client.patch(
                    f"{supabase_url}/rest/v1/courses",
                    params={"id": f"eq.{course_id}"},
                    json={"enrolled_count": count},
                    headers=headers,
                )
        import logging
        logging.getLogger(__name__).info("[STARTUP] enrolled_count synced for %d courses", len(counts))
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning("[STARTUP] enrolled_count sync failed: %s", exc)

async def _expire_stale_payments_loop():
    """Periodically expire payments that have been pending for too long."""
    import httpx, os
    from datetime import datetime, UTC
    while True:
        try:
            await asyncio.sleep(300)  # Run every 5 minutes
            supabase_url = os.getenv("SUPABASE_URL", "").rstrip("/")
            supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
            if not supabase_url or not supabase_key:
                continue
            now = datetime.now(UTC).isoformat()
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.patch(
                    f"{supabase_url}/rest/v1/payments",
                    params={
                        "status": "eq.pending",
                        "expires_at": f"lt.{now}",
                    },
                    json={"status": "expired"},
                    headers={
                        "apikey": supabase_key,
                        "Authorization": f"Bearer {supabase_key}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    },
                )
            if res.status_code in (200, 204):
                logger.debug("[Expiry] Expired stale pending payments")
        except Exception as e:
            logger.error("[Expiry] Error: %s", e)


async def _organic_growth_loop():
    """Simulate organic view growth every 10 minutes (backend-only, no client trigger)."""
    from app.db.session import SessionLocal
    from app.services.social_service import simulate_organic_growth
    while True:
        try:
            await asyncio.sleep(600)  # every 10 minutes
            db = SessionLocal()
            try:
                simulate_organic_growth(db)
                logger.debug("[OrganicGrowth] Tick executed")
            finally:
                db.close()
        except Exception as e:
            logger.error("[OrganicGrowth] Error: %s", e)


@app.on_event("startup")
async def startup_event():
    """Ensure auth_codes schema is current, then start background tasks."""
    # ── SECRET_KEY guard ─────────────────────────────────────────────────────
    _DEFAULT_SECRET = "CHANGE-ME-IN-PRODUCTION-SET-SECRET_KEY-ENV"
    if settings.SECRET_KEY == _DEFAULT_SECRET:
        logger.critical(
            "SECURITY WARNING: SECRET_KEY is still the default placeholder! "
            "JWT tokens can be forged. Set a secure SECRET_KEY env var on Railway."
        )

    from app.db.session import engine
    from sqlalchemy import text as _sa_text
    import secrets
    from datetime import datetime, UTC, timedelta

    # ── All DB startup work in ONE connection ─────────────────────────────────
    # NullPool opens a new TCP+SSL handshake per engine.begin() call.
    # Supabase roundtrip ≈ 2–3 s per connection; Railway health-check window = 30 s.
    # The old startup opened 6+ connections and reliably exceeded the window.
    # Everything below is one transaction: CREATE TABLE + ALTER TABLE × 6 + smoke test.
    #
    # PostgreSQL DDL is transactional, and ALTER TABLE … ADD COLUMN IF NOT EXISTS
    # emits a NOTICE (not an ERROR) when the column already exists, so the
    # transaction is never aborted by these idempotent statements.
    try:
        if engine.dialect.name != "sqlite":
            with engine.begin() as conn:
                # 1. Create auth_codes with full schema if it doesn't exist yet
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS auth_codes (
                        code        VARCHAR(64)   PRIMARY KEY,
                        telegram_id BIGINT,
                        first_name  VARCHAR(255),
                        username    VARCHAR(255),
                        photo_url   VARCHAR(1000),
                        used        BOOLEAN NOT NULL DEFAULT FALSE,
                        expires_at  TIMESTAMPTZ NOT NULL,
                        created_at  TIMESTAMPTZ
                    )
                """))
                # 2. Add any columns absent from older schema versions
                for _col in [
                    "ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS telegram_id BIGINT",
                    "ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS first_name VARCHAR(255)",
                    "ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS username VARCHAR(255)",
                    "ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS photo_url VARCHAR(1000)",
                    "ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT FALSE",
                    "ALTER TABLE auth_codes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ",
                ]:
                    conn.execute(_sa_text(_col))
                # 3. Smoke test — confirms the full schema accepts writes
                _tc = "diag_" + secrets.token_hex(3)
                conn.execute(_sa_text(
                    "INSERT INTO auth_codes (code, expires_at) VALUES (:c, :e)"
                ), {"c": _tc, "e": datetime.now(UTC) + timedelta(seconds=10)})
                conn.execute(_sa_text("DELETE FROM auth_codes WHERE code = :c"), {"c": _tc})
                # 4. user_settings column (migration 052)
                conn.execute(_sa_text(
                    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS user_settings JSONB"
                ))
                # 5. poll_votes table (migration 051)
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS poll_votes (
                        id         BIGSERIAL    PRIMARY KEY,
                        post_id    INTEGER      NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
                        user_id    BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        option_idx INTEGER      NOT NULL,
                        created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                        CONSTRAINT uq_poll_vote UNIQUE (post_id, user_id)
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_poll_votes_post ON poll_votes(post_id)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_poll_votes_user ON poll_votes(user_id)"
                ))
                # 6. user_experiences table (migration 053)
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS user_experiences (
                        id          BIGSERIAL    PRIMARY KEY,
                        user_id     BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        company     VARCHAR(200) NOT NULL,
                        title       VARCHAR(200) NOT NULL,
                        start_date  VARCHAR(20),
                        end_date    VARCHAR(20),
                        is_current  BOOLEAN      NOT NULL DEFAULT FALSE,
                        description TEXT,
                        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_user_experiences_user ON user_experiences(user_id)"
                ))
                # 7. user_education table (migration 053)
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS user_education (
                        id             BIGSERIAL    PRIMARY KEY,
                        user_id        BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        school         VARCHAR(200) NOT NULL,
                        degree         VARCHAR(200),
                        field_of_study VARCHAR(200),
                        start_year     INTEGER,
                        end_year       INTEGER,
                        description    TEXT,
                        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_user_education_user ON user_education(user_id)"
                ))
                # 8. Widen telegram_id columns that were declared as INTEGER (32-bit)
                #    to BIGINT — Telegram IDs now exceed 2^31 and overflow INTEGER.
                for _widen in [
                    "ALTER TABLE user_quiz_completion ALTER COLUMN telegram_id TYPE BIGINT",
                ]:
                    try:
                        conn.execute(_sa_text(_widen))
                    except Exception:
                        pass  # already BIGINT or column missing — safe to skip
                # 9. Calendar fields for planner_tasks
                for _col in [
                    "ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ",
                    "ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 30",
                ]:
                    try:
                        conn.execute(_sa_text(_col))
                    except Exception:
                        pass
                # 10. Jobs tables
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS jobs (
                        id              BIGSERIAL    PRIMARY KEY,
                        posted_by       BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        company_name    TEXT         NOT NULL,
                        title           TEXT         NOT NULL,
                        description     TEXT         NOT NULL,
                        location        TEXT,
                        job_type        VARCHAR(20)  NOT NULL DEFAULT 'full_time',
                        salary_min      INTEGER,
                        salary_max      INTEGER,
                        salary_currency VARCHAR(10)  NOT NULL DEFAULT 'UZS',
                        required_skills JSONB        NOT NULL DEFAULT '[]',
                        is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
                        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                        expires_at      TIMESTAMPTZ,
                        CONSTRAINT chk_salary_range
                            CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min)
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_jobs_posted_by ON jobs(posted_by)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_jobs_active_created ON jobs(is_active, created_at)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_jobs_skills ON jobs USING GIN(required_skills)"
                ))
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS job_applications (
                        id           BIGSERIAL   PRIMARY KEY,
                        job_id       BIGINT      NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
                        applicant_id BIGINT      NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        message      TEXT,
                        status       VARCHAR(20) NOT NULL DEFAULT 'applied',
                        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        CONSTRAINT uq_job_application UNIQUE (job_id, applicant_id)
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_job_applications_job ON job_applications(job_id, status)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_job_applications_applicant ON job_applications(applicant_id)"
                ))
                # 11. Focus session tracking (055_focus_sessions)
                for _col in [
                    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_goal_minutes INTEGER NOT NULL DEFAULT 20",
                    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_days INTEGER NOT NULL DEFAULT 0",
                    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS streak_last_date DATE",
                ]:
                    try:
                        conn.execute(_sa_text(_col))
                    except Exception:
                        pass
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS focus_sessions (
                        id           BIGSERIAL    PRIMARY KEY,
                        user_id      BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        minutes      INTEGER      NOT NULL CHECK (minutes > 0),
                        xp_awarded   INTEGER      NOT NULL DEFAULT 0,
                        session_date DATE         NOT NULL DEFAULT CURRENT_DATE,
                        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_focus_sessions_user_date ON focus_sessions(user_id, session_date)"
                ))
                # 12. Streak freeze columns (061_streak_freeze)
                conn.execute(_sa_text(
                    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS freeze_count INT NOT NULL DEFAULT 0"
                ))
                conn.execute(_sa_text(
                    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS freeze_used_dates DATE[] NOT NULL DEFAULT '{}'"
                ))
                try:
                    conn.execute(_sa_text(
                        "ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_freeze_count_check"
                    ))
                    conn.execute(_sa_text(
                        "ALTER TABLE profiles ADD CONSTRAINT profiles_freeze_count_check CHECK (freeze_count >= 0)"
                    ))
                except Exception:
                    pass  # constraint may already exist with same definition
                # 13. Flashcard system (step-11-flashcards)
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS flashcard_decks (
                        id             BIGSERIAL    PRIMARY KEY,
                        user_id        BIGINT       NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        title          VARCHAR(200) NOT NULL,
                        description    TEXT,
                        color          VARCHAR(7)   NOT NULL DEFAULT '#F5A623',
                        icon           VARCHAR(50),
                        card_count     INTEGER      NOT NULL DEFAULT 0,
                        mastered_count INTEGER      NOT NULL DEFAULT 0,
                        is_public      BOOLEAN      NOT NULL DEFAULT FALSE,
                        course_id      INTEGER,
                        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                        updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_flashcard_decks_user ON flashcard_decks(user_id)"
                ))
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS flashcards (
                        id            BIGSERIAL   PRIMARY KEY,
                        deck_id       BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
                        front_text    TEXT        NOT NULL,
                        back_text     TEXT        NOT NULL,
                        front_image   VARCHAR(500),
                        back_image    VARCHAR(500),
                        position      INTEGER     NOT NULL DEFAULT 0,
                        ease_factor   REAL        NOT NULL DEFAULT 2.5,
                        interval_days INTEGER     NOT NULL DEFAULT 0,
                        repetitions   INTEGER     NOT NULL DEFAULT 0,
                        next_review   TIMESTAMPTZ,
                        last_reviewed TIMESTAMPTZ,
                        status        VARCHAR(20) NOT NULL DEFAULT 'new',
                        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_flashcards_deck ON flashcards(deck_id)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_flashcards_deck_status ON flashcards(deck_id, status)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_flashcards_next_review ON flashcards(next_review)"
                ))
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS flashcard_reviews (
                        id            BIGSERIAL   PRIMARY KEY,
                        user_id       BIGINT      NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        card_id       BIGINT      NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
                        deck_id       BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
                        rating        SMALLINT    NOT NULL,
                        reviewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        time_spent_ms INTEGER
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_flashcard_reviews_user ON flashcard_reviews(user_id, reviewed_at)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_flashcard_reviews_deck ON flashcard_reviews(deck_id)"
                ))
                # 14. Pending enrollments (step-12-admin-manual-enrollment)
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS pending_enrollments (
                        id                BIGSERIAL    PRIMARY KEY,
                        user_id           BIGINT       NOT NULL,
                        course_id         INTEGER      NOT NULL,
                        reference_code    VARCHAR(20)  UNIQUE NOT NULL,
                        expected_amount   BIGINT       NOT NULL DEFAULT 0,
                        status            VARCHAR(20)  NOT NULL DEFAULT 'awaiting_payment',
                        admin_notes       TEXT,
                        actual_amount     BIGINT,
                        payment_method    VARCHAR(50),
                        payment_proof_url VARCHAR(500),
                        processed_by      BIGINT,
                        processed_at      TIMESTAMPTZ,
                        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                        expires_at        TIMESTAMPTZ  NOT NULL
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_pending_enroll_status ON pending_enrollments(status, created_at DESC)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_pending_enroll_user_course ON pending_enrollments(user_id, course_id)"
                ))
                # 15. Enrollment audit log
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS enrollment_audit_log (
                        id                SERIAL       PRIMARY KEY,
                        action            VARCHAR(50)  NOT NULL,
                        target_id         INTEGER,
                        admin_telegram_id BIGINT,
                        user_telegram_id  BIGINT,
                        course_id         INTEGER,
                        details           JSONB,
                        created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                    )
                """))
                # 16. Lesson quiz + attempts (course lesson test system)
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS lesson_quiz (
                        id             SERIAL       PRIMARY KEY,
                        lesson_id      INTEGER      NOT NULL UNIQUE,
                        title          VARCHAR(255) NOT NULL DEFAULT 'Test',
                        questions      JSONB        NOT NULL DEFAULT '[]',
                        time_limit_min INTEGER,
                        passing_score  INTEGER      NOT NULL DEFAULT 70,
                        is_final       BOOLEAN      NOT NULL DEFAULT FALSE,
                        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
                        updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_lesson_quiz_lesson ON lesson_quiz(lesson_id)"
                ))
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS lesson_quiz_attempt (
                        id           SERIAL      PRIMARY KEY,
                        lesson_id    INTEGER     NOT NULL,
                        telegram_id  BIGINT      NOT NULL,
                        started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        submitted_at TIMESTAMPTZ,
                        answers      JSONB,
                        score_pct    FLOAT,
                        passed       BOOLEAN,
                        xp_awarded   INTEGER     NOT NULL DEFAULT 0
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_lesson_quiz_attempt_lesson ON lesson_quiz_attempt(lesson_id)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS ix_lesson_quiz_attempt_user ON lesson_quiz_attempt(telegram_id)"
                ))
                # 17. Public flashcard deck library (066_public_flashcard_decks)
                conn.execute(_sa_text("""
                    ALTER TABLE flashcard_decks
                        ADD COLUMN IF NOT EXISTS published_at        TIMESTAMPTZ,
                        ADD COLUMN IF NOT EXISTS is_anonymous         BOOLEAN     NOT NULL DEFAULT FALSE,
                        ADD COLUMN IF NOT EXISTS category             VARCHAR(50),
                        ADD COLUMN IF NOT EXISTS badge_type           VARCHAR(20) NOT NULL DEFAULT 'none',
                        ADD COLUMN IF NOT EXISTS is_featured          BOOLEAN     NOT NULL DEFAULT FALSE,
                        ADD COLUMN IF NOT EXISTS is_verified          BOOLEAN     NOT NULL DEFAULT FALSE,
                        ADD COLUMN IF NOT EXISTS clone_count          INTEGER     NOT NULL DEFAULT 0,
                        ADD COLUMN IF NOT EXISTS rating_avg           REAL        NOT NULL DEFAULT 0.0,
                        ADD COLUMN IF NOT EXISTS rating_count         INTEGER     NOT NULL DEFAULT 0,
                        ADD COLUMN IF NOT EXISTS cloned_from_deck_id  BIGINT      REFERENCES flashcard_decks(id) ON DELETE SET NULL,
                        ADD COLUMN IF NOT EXISTS moderation_status    VARCHAR(20) NOT NULL DEFAULT 'approved',
                        ADD COLUMN IF NOT EXISTS removed_reason       TEXT
                """))
                conn.execute(_sa_text("""
                    CREATE INDEX IF NOT EXISTS idx_flashcard_decks_public ON flashcard_decks(is_public, category, clone_count DESC)
                        WHERE is_public = TRUE AND moderation_status = 'approved'
                """))
                conn.execute(_sa_text("""
                    CREATE INDEX IF NOT EXISTS idx_flashcard_decks_featured ON flashcard_decks(is_featured, published_at DESC)
                        WHERE is_featured = TRUE
                """))
                conn.execute(_sa_text(
                    "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_publish BOOLEAN NOT NULL DEFAULT TRUE"
                ))
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS deck_clones (
                        id               BIGSERIAL   PRIMARY KEY,
                        original_deck_id BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
                        cloned_deck_id   BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
                        cloned_by        BIGINT      NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE(original_deck_id, cloned_by)
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS idx_deck_clones_original ON deck_clones(original_deck_id)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS idx_deck_clones_user ON deck_clones(cloned_by)"
                ))
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS deck_ratings (
                        id         BIGSERIAL   PRIMARY KEY,
                        deck_id    BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
                        user_id    BIGINT      NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        rating     SMALLINT    NOT NULL CHECK (rating BETWEEN 1 AND 5),
                        comment    TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE(deck_id, user_id)
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS idx_deck_ratings_deck ON deck_ratings(deck_id, created_at DESC)"
                ))
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS deck_reports (
                        id          BIGSERIAL   PRIMARY KEY,
                        deck_id     BIGINT      NOT NULL REFERENCES flashcard_decks(id) ON DELETE CASCADE,
                        reported_by BIGINT      NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
                        reason      VARCHAR(30) NOT NULL,
                        details     TEXT,
                        status      VARCHAR(20) NOT NULL DEFAULT 'pending',
                        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        reviewed_by BIGINT      REFERENCES profiles(telegram_id),
                        reviewed_at TIMESTAMPTZ,
                        UNIQUE(deck_id, reported_by)
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS idx_deck_reports_pending ON deck_reports(status, created_at DESC) WHERE status = 'pending'"
                ))
                # 18. Deck moderation audit log (067_deck_audit_log)
                conn.execute(_sa_text("""
                    CREATE TABLE IF NOT EXISTS deck_audit_log (
                        id                 BIGSERIAL    PRIMARY KEY,
                        deck_id            BIGINT,
                        action             VARCHAR(50)  NOT NULL,
                        admin_telegram_id  BIGINT,
                        details            JSONB,
                        created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
                    )
                """))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS idx_deck_audit_log_deck ON deck_audit_log(deck_id)"
                ))
                conn.execute(_sa_text(
                    "CREATE INDEX IF NOT EXISTS idx_deck_audit_log_admin ON deck_audit_log(admin_telegram_id)"
                ))
            logger.info("[STARTUP] auth_codes ready (create + migrate + smoke-test OK)")
        else:
            # SQLite fallback — use ORM create_all (no SSL overhead)
            from app.db.session import init_db
            init_db()
            logger.info("[STARTUP] SQLite fallback — init_db OK")
    except Exception as e:
        logger.exception("[STARTUP] auth_codes setup FAILED: %s", e)

    asyncio.create_task(_expire_stale_payments_loop())
    asyncio.create_task(_organic_growth_loop())
    asyncio.create_task(_sync_all_enrolled_counts())

    # ── APScheduler: streak reminder + weekly report ──────────────────────────
    _start_cron_scheduler()

    logger.info("Background tasks started")


def _start_cron_scheduler():
    """Start APScheduler for streak reminders and weekly reports."""
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
    from apscheduler.triggers.cron  import CronTrigger
    from app.api.v1.endpoints.cron  import send_streak_reminders, send_weekly_reports
    from app.db.session             import get_db

    cron_secret = os.getenv("CRON_SECRET", "")
    if not cron_secret:
        logger.warning("[SCHEDULER] CRON_SECRET not set — scheduled jobs will not run")
        return

    def _db():
        """Return a single DB session for scheduled jobs."""
        return next(get_db())

    async def _run_streak_reminder():
        db = _db()
        try:
            result = await send_streak_reminders(db=db, _=None)
            logger.info("[SCHEDULER] streak-reminder: %s", result)
        except Exception as exc:
            logger.error("[SCHEDULER] streak-reminder failed: %s", exc)
        finally:
            db.close()

    async def _run_weekly_report():
        db = _db()
        try:
            result = await send_weekly_reports(db=db, _=None)
            logger.info("[SCHEDULER] weekly-report: %s", result)
        except Exception as exc:
            logger.error("[SCHEDULER] weekly-report failed: %s", exc)
        finally:
            db.close()

    scheduler = AsyncIOScheduler(timezone="UTC")
    # Daily 15:00 UTC ≈ 20:00 Tashkent
    scheduler.add_job(_run_streak_reminder, CronTrigger(hour=15, minute=0))
    # Every Monday 08:00 UTC
    scheduler.add_job(_run_weekly_report,   CronTrigger(day_of_week="mon", hour=8, minute=0))
    scheduler.start()
    logger.info("[SCHEDULER] APScheduler started — streak @15:00 UTC daily, report @08:00 UTC Monday")


if __name__ == "__main__":
    # Pull the port from Railway's environment variables
    # Default to 8000 for local testing if the variable isn't found
    port = int(os.environ.get("PORT", 8000))
    
    # Use "main:app" string format to help with hot-reloading 
    # and ensure uvicorn binds to all interfaces (0.0.0.0)
    uvicorn.run("main:app", host="0.0.0.0", port=port, proxy_headers=True)