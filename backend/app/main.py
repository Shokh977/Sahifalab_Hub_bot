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

app.add_middleware(
    CORSMiddleware,
    # This API uses Bearer tokens (Authorization header), not cookie credentials.
    # Keep CORS permissive to avoid browser-blocked 500/4xx responses on uploads.
    allow_origins=["*"],
    allow_credentials=False,
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
