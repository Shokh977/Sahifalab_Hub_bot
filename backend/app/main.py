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


@app.middleware("http")
async def cache_control_middleware(request, call_next):
    response = await call_next(request)
    path = request.url.path
    # Only apply to GET requests
    if request.method == "GET" and "Cache-Control" not in response.headers:
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


# ── Background task: expire stale payments ────────────────────────────────────
import asyncio

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
    logger.info("Background tasks started")


if __name__ == "__main__":
    # Pull the port from Railway's environment variables
    # Default to 8000 for local testing if the variable isn't found
    port = int(os.environ.get("PORT", 8000))
    
    # Use "main:app" string format to help with hot-reloading 
    # and ensure uvicorn binds to all interfaces (0.0.0.0)
    uvicorn.run("main:app", host="0.0.0.0", port=port, proxy_headers=True)