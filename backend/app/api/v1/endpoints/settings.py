"""
User settings endpoint — GET/PUT /api/settings
Stores notification prefs, privacy prefs, theme, language in profiles.user_settings JSONB.
"""

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.db.session import get_db
from app.services.auth_service import decode_token
from app.models.models import Profile

router = APIRouter(prefix="/settings", tags=["settings"])

_DEFAULTS = {
    "notification_prefs": {
        "messages": True,
        "connections": True,
        "courses": True,
        "weekly_digest": True,
        "endorsements": True,
    },
    "privacy_prefs": {
        "public_profile": True,
        "show_activity": True,
    },
    "preferred_theme": "dark",
    "preferred_language": "uz_latin",
}


def _require_user(authorization: str = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    tid = decode_token(authorization.split(" ", 1)[1])
    if not tid:
        raise HTTPException(401, "Invalid token")
    return tid


class SettingsUpdate(BaseModel):
    notification_prefs: Optional[dict] = None
    privacy_prefs: Optional[dict] = None
    preferred_theme: Optional[str] = None
    preferred_language: Optional[str] = None


@router.get("")
def get_settings(
    user_id: int = Depends(_require_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.telegram_id == user_id).first()
    if not profile:
        raise HTTPException(404, "Profile not found")
    saved = profile.user_settings or {}
    return {**_DEFAULTS, **saved}


@router.delete("/account")
def delete_account(
    user_id: int = Depends(_require_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.telegram_id == user_id).first()
    if not profile:
        raise HTTPException(404, "Profile not found")
    db.delete(profile)
    db.commit()
    return {"success": True}


@router.put("")
def update_settings(
    body: SettingsUpdate,
    user_id: int = Depends(_require_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.telegram_id == user_id).first()
    if not profile:
        raise HTTPException(404, "Profile not found")
    current = dict(profile.user_settings or {})
    if body.notification_prefs is not None:
        current["notification_prefs"] = body.notification_prefs
    if body.privacy_prefs is not None:
        current["privacy_prefs"] = body.privacy_prefs
    if body.preferred_theme is not None:
        current["preferred_theme"] = body.preferred_theme
    if body.preferred_language is not None:
        current["preferred_language"] = body.preferred_language
    profile.user_settings = current
    db.commit()
    return {**_DEFAULTS, **current}
