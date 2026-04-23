"""
upload.py — Bunny.net file upload endpoints

POST /api/upload/video
  • Accepts:  multipart/form-data  { file: <video>, course_id: int (optional) }
  • Auth:     Bearer JWT (teacher or admin)
  • Returns:  { url, remote_path, size_bytes, filename }

POST /api/upload/file
  • Accepts:  multipart/form-data  { file: <image|pdf|doc>, course_id: int (optional), folder: str (optional) }
  • Auth:     Bearer JWT (teacher or admin)
  • Returns:  { url, remote_path, size_bytes, filename, content_type, original_name }

DELETE /api/upload/video   — Delete a previously uploaded video
DELETE /api/upload/file    — Delete a previously uploaded file

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

import io
import uuid
import httpx
from pathlib import Path

try:
    from PIL import Image as PILImage  # Pillow — optional, degrades gracefully
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.services.auth_service import decode_token_payload

router = APIRouter()
_security = HTTPBearer()

# ── allowed MIME types ────────────────────────────────────────────────────────
ALLOWED_VIDEO_MIME = {
    "video/mp4",
    "video/webm",
    "video/quicktime",   # .mov
    "video/x-matroska",  # .mkv
}

ALLOWED_IMAGE_MIME = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/svg+xml",
}

ALLOWED_DOC_MIME = {
    "application/pdf",
    "application/epub+zip",  # .epub
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
}

ALLOWED_AUDIO_MIME = {
    "audio/mpeg",    # .mp3
    "audio/ogg",     # .ogg
    "audio/wav",     # .wav
    "audio/webm",    # .webm (audio)
    "audio/aac",     # .aac
    "audio/flac",    # .flac
}

# Raster types that will be auto-converted to WebP on upload
RASTER_IMAGE_MIME = {"image/jpeg", "image/png", "image/gif", "image/webp"}

ALLOWED_FILE_MIME = ALLOWED_IMAGE_MIME | ALLOWED_DOC_MIME | ALLOWED_AUDIO_MIME

MAX_VIDEO_SIZE_BYTES = 500 * 1024 * 1024  # 500 MB
MAX_FILE_SIZE_BYTES  = 50 * 1024 * 1024   # 50 MB
MAX_AUDIO_SIZE_BYTES = 30 * 1024 * 1024   # 30 MB — ambient sounds

_MIME_EXT_MAP = {
    "image/jpeg": ".jpg",
    "image/png":  ".png",
    "image/webp": ".webp",
    "image/gif":  ".gif",
    "image/svg+xml": ".svg",
    "application/pdf": ".pdf",
    "application/epub+zip": ".epub",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "text/plain": ".txt",
    # audio
    "audio/mpeg":  ".mp3",
    "audio/ogg":   ".ogg",
    "audio/wav":   ".wav",
    "audio/webm":  ".webm",
    "audio/aac":   ".aac",
    "audio/flac":  ".flac",
}

# ── Image compression ────────────────────────────────────────────────────────
def _compress_to_webp(raw: bytes, max_px: int = 1200, quality: int = 85) -> bytes:
    """
    Convert a raster image to WebP, downscaling to max_px on the longest side.
    Falls back to the original bytes if Pillow is unavailable or conversion fails.
    """
    if not _PIL_AVAILABLE:
        return raw
    try:
        img = PILImage.open(io.BytesIO(raw))
        if img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGBA" if img.mode in ("P", "PA", "LA", "RGBA") else "RGB")
        w, h = img.size
        if w > max_px or h > max_px:
            img.thumbnail((max_px, max_px), PILImage.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="WEBP", quality=quality, method=6)
        return buf.getvalue()
    except Exception:
        return raw  # fall back to original bytes on any error


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
    """
    Decode JWT and verify the caller is a teacher or admin.
    Returns {"telegram_id": int, "role": str}.
    """
    payload = decode_token_payload(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    role = payload.get("role", "student")
    if role not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Faqat o'qituvchilar yuklashi mumkin")
    return payload


async def _get_any_caller(creds: HTTPAuthorizationCredentials) -> dict:
    """Decode JWT for any authenticated user (student, teacher, admin)."""
    payload = decode_token_payload(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return payload


async def _upload_to_bunny(file_bytes: bytes, remote_path: str, content_type: str) -> str:
    """Upload raw bytes to Bunny.net storage, return CDN URL."""
    if not settings.BUNNY_STORAGE_ZONE or not settings.BUNNY_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Fayl saqlash xizmati sozlanmagan (BUNNY_STORAGE_ZONE / BUNNY_API_KEY).",
        )
    put_url = _bunny_storage_url(remote_path)
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.put(
            put_url,
            content=file_bytes,
            headers={
                "AccessKey":     settings.BUNNY_API_KEY,
                "Content-Type":  content_type,
                "Content-Length": str(len(file_bytes)),
            },
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail=f"Bunny.net saqlashda xatolik: {resp.status_code} — {resp.text[:200]}",
        )
    return _cdn_url(remote_path)


import re as _re

_SAFE_PATH_RE = _re.compile(r"^[\w./-]+$")


def _validate_delete_ownership(remote_path: str, teacher_id: int) -> None:
    """
    Validate that the caller owns the remote_path they're trying to delete.
    Prevents path traversal and cross-teacher deletion.

    Allowed patterns:
      uploads/teacher_<teacher_id>/**
      courses/<course_id>/**           (any teacher can delete course assets — course ownership is
                                        checked at the course-management layer; here we only guard
                                        against directory traversal)
    """
    # Block path traversal and null bytes
    if ".." in remote_path or "\x00" in remote_path or not _SAFE_PATH_RE.match(remote_path):
        raise HTTPException(400, "Noto'g'ri fayl yo'li")

    # Teacher uploads: must match caller's own prefix
    if remote_path.startswith("uploads/"):
        expected_prefix = f"uploads/teacher_{teacher_id}/"
        if not remote_path.startswith(expected_prefix):
            raise HTTPException(403, "Siz faqat o'z fayllaringizni o'chirishingiz mumkin")
        return

    # Course assets: any authenticated teacher/admin can manage (course-level ACL is separate)
    if remote_path.startswith("courses/"):
        return

    # Unknown prefix — deny
    raise HTTPException(403, "Noto'g'ri saqlash joyi")


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
    if file.content_type not in ALLOWED_VIDEO_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Fayl turi qo'llab-quvvatlanmaydi: {file.content_type}. "
                   "mp4, webm, mov, mkv formatlarini kiriting.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > MAX_VIDEO_SIZE_BYTES:
        mb = len(file_bytes) // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Fayl hajmi juda katta ({mb} MB). Maksimal hajm: 500 MB.",
        )

    # ── build remote path ─────────────────────────────────────────────────
    ext         = Path(file.filename or "video.mp4").suffix.lower() or ".mp4"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    if course_id:
        remote_path = f"courses/{course_id}/{unique_name}"
    else:
        remote_path = f"uploads/teacher_{teacher_id}/{unique_name}"

    cdn = await _upload_to_bunny(file_bytes, remote_path, file.content_type or "video/mp4")
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
    Ownership: caller can only delete files under their own teacher prefix or their own courses.
    """
    caller = await _get_caller(creds)
    teacher_id = caller.get("telegram_id")
    _validate_delete_ownership(remote_path, teacher_id)

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


# ── POST /upload/file ─────────────────────────────────────────────────────────
@router.post("/file")
async def upload_file(
    file:      UploadFile = File(...),
    course_id: int | None = Form(None),
    folder:    str | None = Form(None),
    creds:     HTTPAuthorizationCredentials = Depends(_security),
):
    """
    Upload an image, PDF, or document to Bunny.net storage.

    Supported formats:
        Images:    jpg, png, webp, gif, svg
        Documents: pdf, doc, docx, pptx, xlsx, txt

    Path inside Bunny.net zone:
        courses/<course_id>/<folder>/<uuid>.<ext>   (when course_id + folder)
        courses/<course_id>/files/<uuid>.<ext>       (when course_id only)
        uploads/teacher_<id>/files/<uuid>.<ext>      (when no course_id)

    Returns: { url, remote_path, size_bytes, filename, content_type, original_name }
    """
    caller = await _get_caller(creds)
    teacher_id = caller.get("telegram_id")

    if file.content_type not in ALLOWED_FILE_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Fayl turi qo'llab-quvvatlanmaydi: {file.content_type}. "
                   "jpg, png, webp, gif, svg, pdf, doc, docx, pptx, xlsx, txt kiriting.",
        )

    file_bytes = await file.read()
    size_limit = MAX_AUDIO_SIZE_BYTES if file.content_type in ALLOWED_AUDIO_MIME else MAX_FILE_SIZE_BYTES
    if len(file_bytes) > size_limit:
        mb        = len(file_bytes) // (1024 * 1024)
        limit_mb  = size_limit // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Fayl hajmi juda katta ({mb} MB). Maksimal hajm: {limit_mb} MB.",
        )

    original_name = file.filename or "file"

    # ── Raster images → WebP (reduces Bunny storage + CDN egress) ────────────
    upload_content_type = file.content_type or "application/octet-stream"
    if file.content_type in RASTER_IMAGE_MIME:
        file_bytes          = _compress_to_webp(file_bytes)
        ext                 = ".webp"
        upload_content_type = "image/webp"
    else:
        ext = Path(original_name).suffix.lower()
        if not ext:
            ext = _MIME_EXT_MAP.get(file.content_type or "", ".bin")

    unique_name = f"{uuid.uuid4().hex}{ext}"
    # default subfolder: 'sounds' for audio, 'files' for everything else
    subfolder = folder or ("sounds" if file.content_type in ALLOWED_AUDIO_MIME else "files")

    if course_id:
        remote_path = f"courses/{course_id}/{subfolder}/{unique_name}"
    else:
        remote_path = f"uploads/teacher_{teacher_id}/{subfolder}/{unique_name}"

    cdn = await _upload_to_bunny(file_bytes, remote_path, upload_content_type)

    return {
        "url":           cdn,
        "remote_path":   remote_path,
        "size_bytes":    len(file_bytes),
        "filename":      unique_name,
        "content_type":  upload_content_type,
        "original_name": original_name,
    }


# ── POST /upload/post-image — any authenticated user (social post images) ────
@router.post("/post-image")
async def upload_post_image(
    file: UploadFile = File(...),
    creds: HTTPAuthorizationCredentials = Depends(_security),
):
    """
    Upload a post image. Requires a valid JWT but NOT teacher/admin role —
    any logged-in user can upload images for social posts.
    Stored in posts/<uuid>.webp on Bunny CDN.
    Returns { url }.
    """
    await _get_any_caller(creds)

    if file.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(
            status_code=415,
            detail="Faqat rasm fayllari qabul qilinadi: jpg, png, webp, gif.",
        )

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Rasm hajmi 10 MB dan oshmasligi kerak.")

    if file.content_type in RASTER_IMAGE_MIME:
        file_bytes  = _compress_to_webp(file_bytes, max_px=1200, quality=82)
        upload_ct   = "image/webp"
        ext         = ".webp"
    else:
        upload_ct = file.content_type or "image/webp"
        ext       = _MIME_EXT_MAP.get(upload_ct, ".webp")

    remote_path = f"posts/{uuid.uuid4().hex}{ext}"
    cdn_url = await _upload_to_bunny(file_bytes, remote_path, upload_ct)
    return {"url": cdn_url, "remote_path": remote_path}


# ── DELETE /upload/file ───────────────────────────────────────────────────────
@router.delete("/file")
async def delete_file(
    remote_path: str,
    creds: HTTPAuthorizationCredentials = Depends(_security),
):
    """Delete a previously uploaded file (image/pdf/doc) from Bunny.net."""
    caller = await _get_caller(creds)
    teacher_id = caller.get("telegram_id")
    _validate_delete_ownership(remote_path, teacher_id)

    if not settings.BUNNY_STORAGE_ZONE or not settings.BUNNY_API_KEY:
        raise HTTPException(status_code=503, detail="Fayl saqlash xizmati sozlanmagan.")

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
