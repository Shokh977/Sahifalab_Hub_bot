from pathlib import Path
from dotenv import load_dotenv

# Load .env from the project root (one level above backend/) or CWD
_root_env = Path(__file__).resolve().parents[2] / ".env"
if _root_env.is_file():
    load_dotenv(_root_env)
else:
    load_dotenv()  # fallback: CWD/.env

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from app.api.v1 import api_router
from app.core.config import settings
from app.middleware.rate_limiter import rate_limit_middleware
import app.models  # noqa: F401 — registers all models with SQLAlchemy Base
import logging

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

# GZip all responses ≥ 500 bytes — saves ~60-80% on JSON payloads
app.add_middleware(GZipMiddleware, minimum_size=500)

# Rate limiting — 100/min, 1000/hr, 10000/day per IP
app.middleware("http")(rate_limit_middleware)

# Include API routes
app.include_router(api_router, prefix="/api")

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

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


@app.on_event("startup")
async def startup_event():
    """Start background tasks on app startup."""
    asyncio.create_task(_expire_stale_payments_loop())
    logger.info("Background payment expiry task started")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
