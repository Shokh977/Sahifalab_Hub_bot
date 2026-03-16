# Vercel Python runtime v3+ detects ASGI apps by the variable name `app`.
# init_db() runs at module load time (cold start) — reliable on Vercel serverless.
import logging
from app.db.session import init_db
import app.models  # noqa: F401 — ensure all models are registered before init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    init_db()
    logger.info("✅ DB tables verified/created.")
except Exception as e:
    logger.error(f"⚠️  DB init error (non-fatal): {e}")

from app.main import app  # noqa: F401 — re-exported for Vercel
