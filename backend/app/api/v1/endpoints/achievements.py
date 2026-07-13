"""
achievements.py — Achievement system.

GET /api/achievements — all achievement definitions with earned status for the caller.
                        Auto-grants newly-earned badges into user_badges (lazy grant).

The catalogue and grant logic live in app/services/badge_service.py — shared
with the Trofey Xonasi endpoints (GET /profile/me/badges, /profile/{username}/badges)
and the leaderboard/creator-card top-badge decoration.
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.services.badge_service import ACHIEVEMENTS, compute_and_grant_achievements

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
async def list_achievements(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Return all achievement definitions with per-user earned status."""
    metrics, granted = compute_and_grant_achievements(db, caller_id)

    result = []
    for ach in ACHIEVEMENTS:
        key          = ach["key"]
        current      = metrics.get(ach["metric"], 0)
        required     = ach["required_progress"]
        earned_at_dt = granted.get(key)

        result.append({
            "id":               ach["id"],
            "key":              ach["key"],
            "name":             ach["name"],
            "description":      ach["description"],
            "icon_url":         None,
            "tier":             ach["tier"],
            "sort_order":       ach["sort_order"],
            "requirement_text": ach["requirement_text"],
            "current_progress": min(current, required),
            "required_progress": required,
            "earned":           earned_at_dt is not None,
            "earned_at":        earned_at_dt.isoformat() if earned_at_dt else None,
        })

    return result
