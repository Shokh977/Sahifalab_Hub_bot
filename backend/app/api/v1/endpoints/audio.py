"""
Ambient Sound endpoints:

Public:
  GET  /ambient-sounds           → list active sounds from DB
  GET  /get-audio-link/{file_id} → resolve Telegram file_id → direct URL

Admin:
  POST   /admin/ambient-sounds   → upload MP3 (multipart) → sendAudio → save file_id
  DELETE /admin/ambient-sounds/{id} → delete a sound
"""

import time
import logging
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.orm import Session
import httpx

from app.core.config import settings
from app.db.session import get_db
from app.models.admin_models import AmbientSound, AdminUser
from app.schemas.admin_schemas import AmbientSoundResponse

router = APIRouter()
logger = logging.getLogger(__name__)

# ── In-memory cache for getFile URLs ──────────────────────────────────────────
_cache: dict[str, tuple[str, float]] = {}
CACHE_TTL = 3600  # 1 hour


# ── Helper: verify admin (same logic as admin.py) ────────────────────────────
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


# ── Resolve file_id → URL ────────────────────────────────────────────────────
async def _resolve_file_url(file_id: str) -> str:
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise HTTPException(500, "TELEGRAM_BOT_TOKEN is not configured")
    if file_id in _cache:
        url, expires = _cache[file_id]
        if time.time() < expires:
            return url
    api_url = f"https://api.telegram.org/bot{token}/getFile"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(api_url, params={"file_id": file_id})
    if resp.status_code != 200:
        logger.error("Telegram getFile HTTP %s: %s", resp.status_code, resp.text)
        raise HTTPException(502, "Failed to reach Telegram API")
    data = resp.json()
    if not data.get("ok"):
        logger.error("Telegram getFile error: %s", data)
        raise HTTPException(400, data.get("description", "Telegram API error"))
    file_path = data["result"]["file_path"]
    download_url = f"https://api.telegram.org/file/bot{token}/{file_path}"
    _cache[file_id] = (download_url, time.time() + CACHE_TTL)
    return download_url


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


@router.get("/get-audio-link/{file_id}")
async def get_audio_link(file_id: str):
    """Convert a Telegram file_id into a temporary direct download URL."""
    url = await _resolve_file_url(file_id)
    return {"ok": True, "url": url}


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/admin/upload-config")
async def get_upload_config(
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """
    Return the Telegram bot token + storage chat_id so the **browser** can
    upload the audio file directly to the Telegram Bot API — completely
    bypassing Vercel's 4.5 MB serverless body-size limit.
    Admin-only.
    """
    await _verify_admin(telegram_id, db)
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise HTTPException(500, "TELEGRAM_BOT_TOKEN is not configured")
    chat_id = settings.STORAGE_CHAT_ID or telegram_id
    return {"token": token, "chat_id": chat_id}


from pydantic import BaseModel as _BM

class SaveSoundPayload(_BM):
    name: str
    emoji: str = "🎵"
    file_id: str


@router.post("/admin/ambient-sounds", response_model=AmbientSoundResponse, status_code=201)
async def save_ambient_sound(
    body: SaveSoundPayload,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """
    Save a sound whose MP3 was already uploaded directly from the browser
    to Telegram.  Only the resulting file_id is sent here.

    JSON body: { name, emoji, file_id }
    """
    admin = await _verify_admin(telegram_id, db)
    max_order = db.query(AmbientSound).count()
    sound = AmbientSound(
        name=body.name,
        emoji=body.emoji,
        file_id=body.file_id,
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

