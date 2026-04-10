"""
stream.py — Bunny Stream video management endpoints

Routes:
  POST   /api/stream/create-video    — Create a video placeholder (returns videoId for upload)
  PUT    /api/stream/upload/{id}     — Upload video bytes to the placeholder
  GET    /api/stream/status/{id}     — Get encoding status + metadata
  DELETE /api/stream/delete/{id}     — Delete a video from Stream
  GET    /api/stream/embed/{id}      — Get signed embed URL (for playback)

Upload flow (2-step):
  1. Frontend calls POST /api/stream/create-video { title, course_id? }
     → Returns { video_id, library_id }
  2. Frontend uploads raw bytes to PUT /api/stream/upload/{video_id}
     → Returns { success, video_id, encoding_status }
  3. Frontend saves video_id to lesson via PATCH /api/lessons/{id} { bunny_video_id: video_id }
  4. On playback, backend returns signed embed URL via lesson detail endpoint
"""
import os
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Depends, Header, UploadFile, File, Form
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.config import settings
from app.services.auth_service import decode_token_payload
from app.services import bunny_stream_service as bss

logger = logging.getLogger(__name__)

router = APIRouter()
_security = HTTPBearer()

# Max video file size: 2 GB (Bunny Stream supports up to 10 GB)
MAX_STREAM_VIDEO_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB

ALLOWED_VIDEO_MIME = {
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-matroska",
    "video/x-msvideo",
    "video/mpeg",
}

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

ADMIN_IDS: list[int] = []
_raw = os.getenv("ADMIN_TELEGRAM_IDS", "")
if _raw:
    try:
        import json
        ADMIN_IDS = json.loads(_raw) if _raw.startswith("[") else [int(x.strip()) for x in _raw.split(",") if x.strip()]
    except Exception:
        pass


def _supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def _get_caller(creds: HTTPAuthorizationCredentials) -> dict:
    """Decode JWT and verify teacher/admin role."""
    payload = decode_token_payload(creds.credentials)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    role = payload.get("role", "student")
    if role not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Faqat o'qituvchilar yuklashi mumkin")
    return payload


def _ensure_stream():
    """Raise 503 if Bunny Stream is not configured."""
    if not settings.BUNNY_STREAM_LIBRARY_ID or not settings.BUNNY_STREAM_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Bunny Stream sozlanmagan. Admin bilan bog'laning.",
        )


async def _check_video_access(video_id: str, caller_id: int):
    """Verify the caller can access the lesson that owns this Bunny video."""
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={
                "bunny_video_id": f"eq.{video_id}",
                "select": "id,course_id,is_free",
                "limit": "1",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Video topilmadi")
    lesson = rows[0]

    # Free lessons are accessible to everyone
    if lesson.get("is_free"):
        return lesson

    # Check if caller is the course teacher or admin
    course_id = lesson["course_id"]
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}", "select": "teacher_id"},
            headers=_supabase_headers(),
        )
    crows = res.json() if res.status_code == 200 else []
    teacher_id = crows[0]["teacher_id"] if crows else None

    if caller_id == teacher_id or caller_id in ADMIN_IDS:
        return lesson

    # Check active enrollment
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            params={
                "course_id": f"eq.{course_id}",
                "student_id": f"eq.{caller_id}",
                "is_active": "eq.true",
                "select": "id",
                "limit": "1",
            },
            headers=_supabase_headers(),
        )
    erows = res.json() if res.status_code == 200 else []
    if not erows:
        raise HTTPException(
            status_code=403,
            detail="Bu videoni ko'rish uchun kursga yozilishingiz kerak",
        )
    return lesson


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateVideoRequest(BaseModel):
    title: str
    course_id: Optional[int] = None


class CreateVideoResponse(BaseModel):
    video_id: str
    library_id: int
    title: str
    thumbnail_url: str


# ── POST /stream/create-video ─────────────────────────────────────────────────

@router.post("/create-video", response_model=CreateVideoResponse)
async def create_video(
    body: CreateVideoRequest,
    creds: HTTPAuthorizationCredentials = Depends(_security),
):
    """
    Step 1 of upload: Create a video placeholder in Bunny Stream.
    Returns the video_id that the frontend uses for the upload step.
    """
    await _get_caller(creds)
    _ensure_stream()

    try:
        data = await bss.create_video(title=body.title)
    except Exception as e:
        logger.error("Stream create_video error: %s", e)
        raise HTTPException(status_code=502, detail="Video yaratishda xatolik yuz berdi")

    video_id = data.get("guid", "")
    if not video_id:
        raise HTTPException(status_code=502, detail="Bunny Stream video ID olinmadi")

    return CreateVideoResponse(
        video_id=video_id,
        library_id=settings.BUNNY_STREAM_LIBRARY_ID,
        title=body.title,
        thumbnail_url=bss.thumbnail_url(video_id),
    )


# ── PUT /stream/upload/{video_id} ────────────────────────────────────────────

@router.put("/upload/{video_id}")
async def upload_video(
    video_id: str,
    file: UploadFile = File(...),
    creds: HTTPAuthorizationCredentials = Depends(_security),
):
    """
    Step 2 of upload: Upload the raw video file to the placeholder.
    Triggers automatic transcoding to adaptive HLS (240p → 1080p).
    """
    await _get_caller(creds)
    _ensure_stream()

    # Validate MIME
    if file.content_type and file.content_type not in ALLOWED_VIDEO_MIME:
        raise HTTPException(
            status_code=415,
            detail=f"Video turi qo'llab-quvvatlanmaydi: {file.content_type}",
        )

    # Read file bytes
    file_bytes = await file.read()
    if len(file_bytes) > MAX_STREAM_VIDEO_BYTES:
        mb = len(file_bytes) // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"Video hajmi juda katta ({mb} MB). Maksimal: 2048 MB.",
        )

    try:
        result = await bss.upload_video(video_id, file_bytes)
    except Exception as e:
        logger.error("Stream upload error for %s: %s", video_id, e)
        raise HTTPException(status_code=502, detail="Video yuklashda xatolik yuz berdi")

    return {
        "success": True,
        "video_id": video_id,
        "encoding_status": "uploaded",
        "message": "Video yuklandi. Transkoding boshlandi.",
    }


# ── GET /stream/status/{video_id} ────────────────────────────────────────────

@router.get("/status/{video_id}")
async def get_video_status(
    video_id: str,
    creds: HTTPAuthorizationCredentials = Depends(_security),
):
    """
    Get the current encoding status and metadata of a Stream video.
    Frontend polls this until status=4 (finished).
    """
    await _get_caller(creds)
    _ensure_stream()

    try:
        data = await bss.get_video(video_id)
    except Exception as e:
        logger.error("Stream get_video error for %s: %s", video_id, e)
        raise HTTPException(status_code=502, detail="Video holati tekshirishda xatolik")

    if data.get("error") == "not_found":
        raise HTTPException(status_code=404, detail="Video topilmadi")

    status_code = data.get("status", 0)
    return {
        "video_id": video_id,
        "status": status_code,
        "status_label": bss.parse_encoding_status(status_code),
        "encode_progress": data.get("encodeProgress", 0),
        "duration_seconds": data.get("length", 0),
        "width": data.get("width", 0),
        "height": data.get("height", 0),
        "available_resolutions": data.get("availableResolutions", ""),
        "thumbnail_url": bss.thumbnail_url(video_id),
        "has_mp4_fallback": data.get("hasMP4Fallback", False),
        "storage_size_bytes": data.get("storageSize", 0),
    }


# ── GET /stream/embed/{video_id} ─────────────────────────────────────────────

@router.get("/embed/{video_id}")
async def get_embed_url(
    video_id: str,
    authorization: Optional[str] = Header(None),
):
    """
    Get a time-limited signed embed URL for the Bunny Stream player.
    This is called by the frontend when rendering the video player.
    The signed URL is valid for 4 hours.

    Security: verifies the caller is enrolled in (or owns) the course
    that contains the lesson linked to this bunny_video_id.
    """
    # Auth check — resolve caller identity
    if not authorization:
        raise HTTPException(status_code=401, detail="Avtorizatsiya talab qilinadi")
    from app.services.auth_service import decode_token
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Noto'g'ri avtorizatsiya")
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(status_code=401, detail="Token muddati tugagan")

    _ensure_stream()

    # Enrollment / ownership check — raises 403 if not authorized
    await _check_video_access(video_id, tid)

    embed = bss.signed_embed_url(video_id, expires_seconds=14400)
    hls = bss.signed_hls_url(video_id, expires_seconds=14400)
    thumb = bss.thumbnail_url(video_id)

    return {
        "video_id": video_id,
        "embed_url": embed,
        "hls_url": hls,
        "thumbnail_url": thumb,
        "expires_in": 14400,
    }


# ── DELETE /stream/delete/{video_id} ─────────────────────────────────────────

@router.delete("/delete/{video_id}")
async def delete_stream_video(
    video_id: str,
    creds: HTTPAuthorizationCredentials = Depends(_security),
):
    """Delete a video from Bunny Stream. Teacher/admin only."""
    await _get_caller(creds)
    _ensure_stream()

    try:
        result = await bss.delete_video(video_id)
    except Exception as e:
        logger.error("Stream delete error for %s: %s", video_id, e)
        raise HTTPException(status_code=502, detail="Video o'chirishda xatolik yuz berdi")

    return {
        "deleted": True,
        "video_id": video_id,
    }
