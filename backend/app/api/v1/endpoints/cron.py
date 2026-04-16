"""
cron.py — Scheduled / internal maintenance endpoints.

Routes (secret-key protected, NOT JWT):
  POST /api/cron/weekly-reset   — reset profile_views_week for all users

Authentication: CRON_SECRET env var must be provided in X-Cron-Secret header.
Configure Railway cron job to call:
    POST https://<your-app>.railway.app/api/cron/weekly-reset
    X-Cron-Secret: <CRON_SECRET>
    Schedule: 0 0 * * 1   (every Monday at 00:00 UTC)
"""

import os
import logging

from fastapi import APIRouter, Header, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends
from sqlalchemy import text

from app.db.session import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cron", tags=["cron"])

CRON_SECRET = os.getenv("CRON_SECRET", "")


def _require_cron_secret(x_cron_secret: str = Header(None)):
    """Validate the shared secret. Blocks all callers without it."""
    if not CRON_SECRET:
        # Safety: if CRON_SECRET not configured, block all calls
        raise HTTPException(status_code=503, detail="Cron not configured")
    if x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=403, detail="Invalid cron secret")


@router.post("/weekly-reset")
def weekly_reset(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    HOOK 8 — Weekly reset.

    Resets profile_views_week = 0 for all users.
    Calls the Postgres function created in migration 048.
    """
    try:
        db.execute(text("SELECT public.weekly_reset_profile_views()"))
        db.commit()
        logger.info("weekly_reset: profile_views_week reset complete")
        return {"ok": True, "action": "profile_views_week reset"}
    except Exception as exc:
        db.rollback()
        logger.error("weekly_reset failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Reset failed: {exc}")
