"""
xp.py — XP award and gamification endpoints.

POST /api/xp/add              — award XP via server-side anti-cheat RPC
GET  /api/xp/daily/{uid}      — today's quiz XP budget & remaining quizzes
GET  /api/xp/badges/{uid}     — all earned badges for a user
"""

from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.services.xp_service import (
    add_xp,
    focus_minutes_to_xp,
    DEFAULT_QUIZ_XP,
    DEFAULT_COURSE_XP,
    QUIZ_DAILY_CAP,
)

router = APIRouter()


# ── Auth helper ───────────────────────────────────────────────────────────────

async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    """Extract telegram_id from Bearer JWT. Raises 401 on failure."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return telegram_id


# ── Request / Response models ─────────────────────────────────────────────────

class AddXpRequest(BaseModel):
    telegram_id:   int
    source:        str            # 'DEEP_WORK' | 'QUIZ' | 'COURSE'
    amount:        Optional[int]  = None    # override; omit to use defaults
    focus_minutes: Optional[float] = None  # DEEP_WORK only; server computes XP
    reference_id:  Optional[int]  = None   # COURSE only: course_id for dedup


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/add")
async def award_xp(
    body: AddXpRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """
    Award XP through the server-side anti-cheat function.
    telegram_id is taken from the JWT — body.telegram_id is ignored.

    Source rules:
      DEEP_WORK : send focus_minutes (XP = round(minutes × 1.66)) or explicit amount
      QUIZ      : flat 25 XP per quiz, hard-capped at 100 XP / UTC day
      COURSE    : flat 200 XP, one-time per reference_id (course_id)
    """
    # Use JWT-derived identity, never trust client-supplied telegram_id
    telegram_id = caller_id
    source = body.source.upper()

    if source not in ("DEEP_WORK", "QUIZ", "COURSE"):
        raise HTTPException(status_code=422, detail=f"Unknown source: {body.source}")

    # ── Compute canonical amount per source ───────────────────────────────────
    if source == "DEEP_WORK":
        if body.focus_minutes is not None:
            amount = focus_minutes_to_xp(body.focus_minutes)
        elif body.amount is not None:
            amount = body.amount
        else:
            raise HTTPException(
                status_code=422,
                detail="DEEP_WORK requires focus_minutes or amount",
            )

    elif source == "QUIZ":
        amount = body.amount if body.amount is not None else DEFAULT_QUIZ_XP

    else:  # COURSE
        amount = body.amount if body.amount is not None else DEFAULT_COURSE_XP
        if body.reference_id is None:
            raise HTTPException(
                status_code=422,
                detail="COURSE requires reference_id (course_id)",
            )

    # ── Call the Postgres RPC ─────────────────────────────────────────────────
    try:
        result = add_xp(
            db,
            user_id=telegram_id,
            source=source,
            amount=amount,
            reference_id=body.reference_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {
        "ok":        True,
        "new_xp":    result["new_xp"],
        "new_level": result["new_level"],
        "xp_added":  result["xp_added"],
        "capped":    result["xp_added"] < amount,   # True when daily/one-time limit hit
    }


@router.get("/daily/{telegram_id}")
async def get_daily_xp_status(telegram_id: int, db: Session = Depends(get_db)):
    """Return today's quiz XP used and remaining allowance."""
    row = db.execute(
        text("""
            SELECT daily_quiz_xp, daily_quiz_xp_reset_at
            FROM   profiles
            WHERE  telegram_id = :uid
        """),
        {"uid": telegram_id},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Profile not found")

    today      = datetime.now(UTC).date()
    reset_date = row.daily_quiz_xp_reset_at.date() if row.daily_quiz_xp_reset_at else None
    daily_used = int(row.daily_quiz_xp) if reset_date == today else 0

    return {
        "daily_quiz_xp":        daily_used,
        "daily_quiz_xp_limit":  QUIZ_DAILY_CAP,
        "daily_quiz_remaining": max(0, QUIZ_DAILY_CAP - daily_used),
        "quizzes_remaining":    max(0, (QUIZ_DAILY_CAP - daily_used) // DEFAULT_QUIZ_XP),
    }


@router.get("/badges/{telegram_id}")
async def get_user_badges(telegram_id: int, db: Session = Depends(get_db)):
    """Return all badges earned by a user, newest first."""
    rows = db.execute(
        text("""
            SELECT badge_key, granted_at
            FROM   user_badges
            WHERE  user_id = :uid
            ORDER BY granted_at DESC
        """),
        {"uid": telegram_id},
    ).fetchall()

    return [
        {
            "badge_key":  r.badge_key,
            "granted_at": r.granted_at.isoformat() if r.granted_at else None,
        }
        for r in rows
    ]
