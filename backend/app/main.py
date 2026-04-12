from pathlib import Path
from dotenv import load_dotenv

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
    """Start background tasks on app startup."""
    # ── SECRET_KEY guard ──────────────────────────────────────────────────
    # Warn loudly if the operator forgot to set a real SECRET_KEY, but do NOT
    # raise SystemExit — that causes Railway to return 503 on every request,
    # which browsers misreport as a CORS error and hides the real problem.
    _DEFAULT_SECRET = "CHANGE-ME-IN-PRODUCTION-SET-SECRET_KEY-ENV"
    if settings.SECRET_KEY == _DEFAULT_SECRET:
        logger.critical(
            "⚠️  SECURITY WARNING: SECRET_KEY is still the default placeholder! "
            "JWT tokens can be forged. Set a secure SECRET_KEY env var on Railway immediately."
        )

    # Ensure all ORM-declared tables exist (safe no-op if they already do)
    from app.db.session import init_db
    try:
        init_db()
        logger.info("Database tables verified / created")
    except Exception as e:
        logger.error("init_db() failed (non-fatal, tables may already exist): %s", e)

    asyncio.create_task(_expire_stale_payments_loop())
    asyncio.create_task(_organic_growth_loop())
    logger.info("Background payment expiry task started")
    logger.info("Background organic growth task started")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
