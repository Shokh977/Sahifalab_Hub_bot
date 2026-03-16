# Vercel Python runtime v3+ detects ASGI apps by the variable name `app`.
# init_db() runs at module load time (cold start) — reliable on Vercel serverless.
import logging
from app.db.session import init_db, engine
import app.models  # noqa: F401 — ensure all models are registered before init_db
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    init_db()
    logger.info("✅ DB tables verified/created.")
except Exception as e:
    logger.error(f"⚠️  DB init error (non-fatal): {e}")

# Migration 002: rename ambient_sound.file_id → url (idempotent)
try:
    with engine.connect() as _conn:
        _row = _conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name='ambient_sound' AND column_name='file_id'"
        )).fetchone()
        if _row:
            _conn.execute(text("ALTER TABLE ambient_sound RENAME COLUMN file_id TO url"))
            _conn.execute(text("ALTER TABLE ambient_sound ALTER COLUMN url TYPE VARCHAR(1000)"))
            _conn.commit()
            logger.info("✅ Migration 002 applied: file_id → url")
except Exception as e:
    logger.error(f"⚠️  Migration 002 error (non-fatal): {e}")

from app.main import app  # noqa: F401 — re-exported for Vercel
