from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1 import api_router
from app.core.config import settings
from app.db.session import init_db
import app.models  # noqa: F401 — registers all models with SQLAlchemy Base
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Init DB tables immediately (works with Vercel serverless + lifespan="off")
try:
    init_db()
    logger.info("Database tables ready ✅")
except Exception as e:
    logger.warning(f"DB init skipped (no DB yet): {e}")

app = FastAPI(
    title="SAHIFALAB Telegram Mini App API",
    description="RESTful API for SAHIFALAB Telegram Mini App",
    version="1.0.0",
)

# CORS — allow Vercel frontend + localhost dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
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
