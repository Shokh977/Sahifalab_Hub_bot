"""
activity.py — User activity feed.

GET /api/activity?limit=20&offset=0
  Returns the caller's activity log, newest-first, with offset pagination.
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token

router = APIRouter()


async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return telegram_id


@router.get("")
async def list_activity(
    limit:     int = Query(20, ge=1, le=100),
    offset:    int = Query(0, ge=0),
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Return paginated activity feed for the authenticated user."""

    rows = db.execute(
        text("""
            SELECT id, activity_type, metadata, created_at
            FROM activity_log
            WHERE user_id = :uid
            ORDER BY created_at DESC
            LIMIT :lim OFFSET :off
        """),
        {"uid": caller_id, "lim": limit, "off": offset},
    ).fetchall()

    total_row = db.execute(
        text("SELECT COUNT(*) FROM activity_log WHERE user_id = :uid"),
        {"uid": caller_id},
    ).fetchone()
    total = int(total_row[0]) if total_row else 0

    items = [
        {
            "id":            r.id,
            "activity_type": r.activity_type,
            "metadata":      r.metadata,
            "created_at":    r.created_at.isoformat(),
        }
        for r in rows
    ]

    return {
        "items":    items,
        "total":    total,
        "offset":   offset,
        "has_more": (offset + limit) < total,
    }
