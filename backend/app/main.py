from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import api_router
from app.core.config import settings
import app.models  # noqa: F401 — registers all models with SQLAlchemy Base
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="SAHIFALAB Telegram Mini App API",
    description="RESTful API for SAHIFALAB Telegram Mini App",
    version="1.0.0",
)

# CORS — allow Vercel frontend + localhost dev
# Supports wildcard Vercel preview URLs (*.vercel.app pattern)
import re as _re

def _make_cors_origins(origins: list[str]) -> list[str]:
    """Return exact origins only (no wildcards); starlette handles regexes separately."""
    return [o for o in origins if '*' not in o]

def _make_cors_regex(origins: list[str]) -> str | None:
    """Build a regex that matches wildcard entries like https://foo-*.vercel.app"""
    patterns = []
    for o in origins:
        if '*' in o:
            patterns.append(_re.escape(o).replace(r'\*', r'[^.]+'))
    if not patterns:
        return None
    return '|'.join(f'({p})' for p in patterns)

_cors_exact = _make_cors_origins(settings.CORS_ORIGINS)
_cors_regex = _make_cors_regex(settings.CORS_ORIGINS)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_exact,
    allow_origin_regex=_cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
