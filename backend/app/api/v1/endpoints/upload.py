"""
upload.py — Bunny.net video upload endpoint

POST /api/upload/video
  • Accepts:  multipart/form-data  { file: <video>, course_id: int (optional, for path org) }
  • Auth:     Bearer JWT (teacher or admin)
  • Returns:  { url: "https://<cdn_hostname>/courses/<course_id>/<uuid>.<ext>" }

Bunny.net Storage API reference:
  PUT  https://<region>.storage.bunnycdn.com/<zone>/<path>
  Header: AccessKey: <api_key>
  Body:   raw file bytes

Storage region endpoints:
  de  → storage.bunnycdn.com       (Frankfurt, default)
  ny  → ny.storage.bunnycdn.com
  la  → la.storage.bunnycdn.com
  sg  → sg.storage.bunnycdn.com
  syd → syd.storage.bunnycdn.com
  br  → br.storage.bunnycdn.com
  jh  → jh.storage.bunnycdn.com
"""

import uuid
import httpx
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.services.auth_service import decode_token

router = APIRouter()
_security = HTTPBearer()

# ── allowed MIME types ────────────────────────────────────────────────────────
ALLOWED_MIME = {
    "video/mp4",
    "video/webm",
    "video/quicktime",   # .mov
    "video/x-matroska",  # .mkv
}
MAX_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB

# Bunny.net region → hostname map
REGION_HOST: dict[str, str] = {
    "de":  "storage.bunnycdn.com",
    "ny":  "ny.storage.bunnycdn.com",
    "la":  "la.storage.bunnycdn.com",
    "sg":  "sg.storage.bunnycdn.com",
    "syd": "syd.storage.bunnycdn.com",
    "br":  "br.storage.bunnycdn.com",
    "jh":  "jh.storage.bunnycdn.com",
}


def _bunny_storage_url(remote_path: str) -> str:
    """Build the Bunny.net Storage API PUT URL for remote_path."""
    region  = settings.BUNNY_STORAGE_REGION or "de"
    host    = REGION_HOST.get(region, "storage.bunnycdn.com")
    zone    = settings.BUNNY_STORAGE_ZONE
    return f"https://{host}/{zone}/{remote_path}"


def _cdn_url(remote_path: str) -> str:
    """Build the public CDN URL for the uploaded file."""
    hostname = settings.BUNNY_CDN_HOSTNAME.rstrip("/")
    return f"https://{hostname}/{remote_path}"


async def _get_caller(creds: HTTPAuthorizationCredentials) -> dict:
    """Decode JWT and verify the caller is a teacher or admin."""
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    role = payload.get("role", "student")
    if role not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Faqat o'qituvchilar yuklashi mumkin")
    return payload


# ── POST /upload/video ────────────────────────────────────────────────────────
@router.post("/video")
async def upload_video(
    file:      UploadFile = File(...),
    course_id: int | None = Form(None),
    creds:     HTTPAuthorizationCredentials = Depends(_security),
):
    """
    Upload a video to Bunny.net storage and return its CDN URL.

    Path inside Bunny.net zone:
        courses/<course_id>/<uuid>.<ext>   (when course_id provided)
        uploads/<uuid>.<ext>               (when no course_id)
    """
    # ── auth ──────────────────────────────────────────────────────────────
    caller = await _get_caller(creds)
    teacher_id = caller.get("telegram_id")

    # ── validate MIME & size ──────────────────────────────────────────────
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Fayl turi qo'llab-quvvatlanmaydi: {file.content_type}. "
                   "mp4, webm, mov, mkv formatlarini kiriting.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_SIZE_BYTES:
        mb = len(file_bytes) // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Fayl hajmi juda katta ({mb} MB). Maksimal hajm: 500 MB.",
        )

    # ── check Bunny.net config ────────────────────────────────────────────
    if not settings.BUNNY_STORAGE_ZONE or not settings.BUNNY_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Video saqlash xizmati sozlanmagan (BUNNY_STORAGE_ZONE / BUNNY_API_KEY).",
        )

    # ── build remote path ─────────────────────────────────────────────────
    ext         = Path(file.filename or "video.mp4").suffix.lower() or ".mp4"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    if course_id:
        remote_path = f"courses/{course_id}/{unique_name}"
    else:
        remote_path = f"uploads/teacher_{teacher_id}/{unique_name}"

    # ── upload to Bunny.net ───────────────────────────────────────────────
    put_url = _bunny_storage_url(remote_path)

    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.put(
            put_url,
            content=file_bytes,
            headers={
                "AccessKey":     settings.BUNNY_API_KEY,
                "Content-Type":  file.content_type or "video/mp4",
                "Content-Length": str(len(file_bytes)),
            },
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"Bunny.net saqlashda xatolik: {resp.status_code} — {resp.text[:200]}",
        )

    cdn = _cdn_url(remote_path)
    return {
        "url":         cdn,
        "remote_path": remote_path,
        "size_bytes":  len(file_bytes),
        "filename":    unique_name,
    }


# ── DELETE /upload/video ──────────────────────────────────────────────────────
@router.delete("/video")
async def delete_video(
    remote_path: str,
    creds: HTTPAuthorizationCredentials = Depends(_security),
):
    """
    Delete a previously uploaded video from Bunny.net.
    remote_path must be the value returned by the upload endpoint.
    """
    await _get_caller(creds)

    if not settings.BUNNY_STORAGE_ZONE or not settings.BUNNY_API_KEY:
        raise HTTPException(status_code=503, detail="Video saqlash xizmati sozlanmagan.")

    del_url = _bunny_storage_url(remote_path)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.delete(
            del_url,
            headers={"AccessKey": settings.BUNNY_API_KEY},
        )

    if resp.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"O'chirishda xatolik: {resp.status_code} — {resp.text[:200]}",
        )

    return {"deleted": True, "remote_path": remote_path}
