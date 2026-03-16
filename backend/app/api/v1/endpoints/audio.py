"""
Ambient Sound endpoints:

Public:
  GET  /ambient-sounds              → list active sounds from DB

Admin:
  POST   /admin/ambient-sounds      → save { name, emoji, url } to DB
  DELETE /admin/ambient-sounds/{id} → delete a sound
"""

import re
import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.models.admin_models import AmbientSound, AdminUser
from app.schemas.admin_schemas import AmbientSoundResponse

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Helper: verify admin ───────────────────────────────────────────────────────
async def _verify_admin(telegram_id: int, db: Session):
    if telegram_id in settings.ADMIN_TELEGRAM_IDS:
        admin = db.query(AdminUser).filter(AdminUser.telegram_id == telegram_id).first()
        if not admin:
            admin = AdminUser(telegram_id=telegram_id, role="admin", is_active=True)
            db.add(admin)
            db.commit()
            db.refresh(admin)
        return admin
    admin = db.query(AdminUser).filter(
        AdminUser.telegram_id == telegram_id,
        AdminUser.is_active == True,
    ).first()
    if not admin:
        raise HTTPException(403, "Admin access required")
    return admin


# ── Google Drive URL conversion ────────────────────────────────────────────────
_DRIVE_PATTERNS = [
    r"drive\.google\.com/file/d/([\w-]+)",        # /file/d/FILE_ID/view
    r"drive\.google\.com/open\?id=([\w-]+)",      # ?id=FILE_ID
    r"drive\.google\.com/uc\?.*id=([\w-]+)",      # already a uc link
]

def _convert_drive_url(url: str) -> str:
    """Convert any Google Drive share link to a direct download/stream URL."""
    for pattern in _DRIVE_PATTERNS:
        m = re.search(pattern, url)
        if m:
            file_id = m.group(1)
            return f"https://drive.google.com/uc?export=download&id={file_id}"
    return url  # not a Drive link — return as-is


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/ambient-sounds", response_model=list[AmbientSoundResponse])
async def list_ambient_sounds(db: Session = Depends(get_db)):
    """Return all active ambient sounds (for StudyPage)."""
    return (
        db.query(AmbientSound)
        .filter(AmbientSound.is_active == True)
        .order_by(AmbientSound.display_order, AmbientSound.id)
        .all()
    )


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

from pydantic import BaseModel as _BM

class SaveSoundPayload(_BM):
    name: str
    emoji: str = "🎵"
    url: str   # Google Drive share link OR any direct audio URL


@router.post("/admin/ambient-sounds", response_model=AmbientSoundResponse, status_code=201)
async def save_ambient_sound(
    body: SaveSoundPayload,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """
    Save an ambient sound by URL.
    Accepts a Google Drive share link or any direct audio URL.
    Google Drive links are converted to stream URLs automatically.

    JSON body: { name, emoji, url }
    """
    admin = await _verify_admin(telegram_id, db)
    direct_url = _convert_drive_url(body.url.strip())
    max_order = db.query(AmbientSound).count()
    sound = AmbientSound(
        name=body.name,
        emoji=body.emoji,
        url=direct_url,
        display_order=max_order,
        is_active=True,
        created_by=admin.telegram_id,
    )
    db.add(sound)
    db.commit()
    db.refresh(sound)
    return sound


@router.delete("/admin/ambient-sounds/{sound_id}", status_code=204)
async def delete_ambient_sound(
    sound_id: int,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Delete an ambient sound by ID."""
    await _verify_admin(telegram_id, db)
    sound = db.query(AmbientSound).filter(AmbientSound.id == sound_id).first()
    if not sound:
        raise HTTPException(404, "Sound not found")
    db.delete(sound)
    db.commit()

