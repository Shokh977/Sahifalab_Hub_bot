"""
bunny_stream_service.py — Bunny Stream video management

Handles the full lifecycle of video streaming via Bunny Stream:
  1. create_video()     — Register a video placeholder in the Stream library
  2. upload_video()     — Upload raw bytes to the placeholder (starts transcoding)
  3. get_video()        — Fetch video metadata (status, duration, resolutions)
  4. delete_video()     — Remove a video from the Stream library
  5. signed_embed_url() — Generate a time-limited signed iframe embed URL
  6. signed_hls_url()   — Generate a signed direct HLS .m3u8 URL (for custom players)
  7. thumbnail_url()    — Public thumbnail URL from Stream CDN

Bunny Stream API reference:
  Base: https://video.bunnycdn.com
  Auth: Header  AccessKey: <library-api-key>

Token authentication (signed embed):
  token = SHA256_HEX(token_key + video_id + expiration_unix)
  URL:   https://iframe.mediadelivery.net/embed/{library_id}/{video_id}?token={token}&expires={exp}
"""

import hashlib
import time
import logging
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

STREAM_BASE = "https://video.bunnycdn.com"
EMBED_BASE = "https://iframe.mediadelivery.net/embed"


def _stream_headers() -> dict[str, str]:
    """Authorization headers for Bunny Stream API."""
    return {
        "AccessKey": settings.BUNNY_STREAM_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _ensure_stream_configured():
    """Raise if Stream library is not configured."""
    if not settings.BUNNY_STREAM_LIBRARY_ID or not settings.BUNNY_STREAM_API_KEY:
        raise ValueError(
            "Bunny Stream sozlanmagan. BUNNY_STREAM_LIBRARY_ID va "
            "BUNNY_STREAM_API_KEY muhit o'zgaruvchilarini sozlang."
        )


# ── 1. Create video placeholder ──────────────────────────────────────────────

async def create_video(title: str, collection_id: Optional[str] = None) -> dict:
    """
    POST /library/{libraryId}/videos
    Creates a video object in the Stream library. Returns the full video object
    including `guid` (the video ID used for upload, embed, etc.).
    """
    _ensure_stream_configured()
    lib_id = settings.BUNNY_STREAM_LIBRARY_ID
    url = f"{STREAM_BASE}/library/{lib_id}/videos"

    payload: dict = {"title": title}
    if collection_id:
        payload["collectionId"] = collection_id

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers=_stream_headers())

    if resp.status_code not in (200, 201):
        logger.error("Bunny Stream create_video failed: %s %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"Bunny Stream video yaratishda xatolik: {resp.status_code}")

    data = resp.json()
    logger.info("Bunny Stream video created: guid=%s title=%s", data.get("guid"), title)
    return data


# ── 2. Upload video bytes ────────────────────────────────────────────────────

async def upload_video(video_id: str, file_bytes: bytes) -> dict:
    """
    PUT /library/{libraryId}/videos/{videoId}
    Upload raw video bytes to the placeholder created by create_video().
    Body: application/octet-stream
    Triggers automatic transcoding (240p → 1080p adaptive HLS).
    """
    _ensure_stream_configured()
    lib_id = settings.BUNNY_STREAM_LIBRARY_ID
    url = f"{STREAM_BASE}/library/{lib_id}/videos/{video_id}"

    async with httpx.AsyncClient(timeout=600.0) as client:  # 10 min for large uploads
        resp = await client.put(
            url,
            content=file_bytes,
            headers={
                "AccessKey": settings.BUNNY_STREAM_API_KEY,
                "Content-Type": "application/octet-stream",
            },
        )

    if resp.status_code not in (200, 201):
        logger.error("Bunny Stream upload failed for %s: %s %s", video_id, resp.status_code, resp.text[:300])
        raise RuntimeError(f"Video yuklashda xatolik: {resp.status_code}")

    data = resp.json()
    logger.info("Bunny Stream video uploaded: guid=%s success=%s", video_id, data.get("success"))
    return data


# ── 3. Get video metadata ────────────────────────────────────────────────────

async def get_video(video_id: str) -> dict:
    """
    GET /library/{libraryId}/videos/{videoId}
    Returns full video metadata including status, duration, available resolutions.

    Status codes:
      0 = Created (waiting for upload)
      1 = Uploaded (queued for processing)
      2 = Processing (transcoding in progress)
      3 = Transcoding (legacy alias for Processing)
      4 = Finished (ready for playback)
      5 = Error
      6 = Upload failed
    """
    _ensure_stream_configured()
    lib_id = settings.BUNNY_STREAM_LIBRARY_ID
    url = f"{STREAM_BASE}/library/{lib_id}/videos/{video_id}"

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=_stream_headers())

    if resp.status_code == 404:
        return {"error": "not_found", "video_id": video_id}
    if resp.status_code != 200:
        logger.error("Bunny Stream get_video failed: %s %s", resp.status_code, resp.text[:300])
        raise RuntimeError(f"Video ma'lumotlarini olishda xatolik: {resp.status_code}")

    return resp.json()


# ── 4. Delete video ──────────────────────────────────────────────────────────

async def delete_video(video_id: str) -> dict:
    """
    DELETE /library/{libraryId}/videos/{videoId}
    Permanently removes the video and all transcoded variants.
    """
    _ensure_stream_configured()
    lib_id = settings.BUNNY_STREAM_LIBRARY_ID
    url = f"{STREAM_BASE}/library/{lib_id}/videos/{video_id}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.delete(
            url,
            headers={"AccessKey": settings.BUNNY_STREAM_API_KEY},
        )

    if resp.status_code not in (200, 204):
        logger.error("Bunny Stream delete failed for %s: %s %s", video_id, resp.status_code, resp.text[:200])
        raise RuntimeError(f"Video o'chirishda xatolik: {resp.status_code}")

    data = resp.json() if resp.text else {"success": True}
    logger.info("Bunny Stream video deleted: guid=%s", video_id)
    return data


# ── 5. Signed embed URL (iframe player) ──────────────────────────────────────

def signed_embed_url(
    video_id: str,
    expires_seconds: int = 14400,  # 4 hours default
    autoplay: bool = False,
    preload: bool = True,
    responsive: bool = True,
) -> str:
    """
    Generate a time-limited signed Bunny Stream embed URL.

    Algorithm:
      token = SHA256_HEX(token_key + video_id + expiration_unix)
      url = https://iframe.mediadelivery.net/embed/{lib_id}/{video_id}
            ?token={token}&expires={exp}&autoplay=...&preload=...

    If token_key is empty (token auth disabled), returns an unsigned URL.
    """
    lib_id = settings.BUNNY_STREAM_LIBRARY_ID
    base = f"{EMBED_BASE}/{lib_id}/{video_id}"

    params: list[str] = []

    # Sign if token key is configured
    if settings.BUNNY_STREAM_TOKEN_KEY:
        exp = int(time.time()) + expires_seconds
        raw = f"{settings.BUNNY_STREAM_TOKEN_KEY}{video_id}{exp}"
        token = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        params.append(f"token={token}")
        params.append(f"expires={exp}")

    # Player params
    if autoplay:
        params.append("autoplay=true")
    if preload:
        params.append("preload=true")
    if responsive:
        params.append("responsive=true")

    qs = "&".join(params)
    return f"{base}?{qs}" if qs else base


# ── 6. Signed HLS URL (for custom players) ───────────────────────────────────

def signed_hls_url(video_id: str, expires_seconds: int = 14400) -> str:
    """
    Generate a signed direct HLS .m3u8 URL for use with custom players (hls.js).

    URL pattern:
      https://{cdn_host}/{video_id}/playlist.m3u8?token=...&expires=...
    """
    cdn_host = settings.BUNNY_STREAM_CDN_HOST
    if not cdn_host:
        # Fallback to the embed approach if CDN host not set
        return signed_embed_url(video_id, expires_seconds)

    base = f"https://{cdn_host}/{video_id}/playlist.m3u8"

    if settings.BUNNY_STREAM_TOKEN_KEY:
        exp = int(time.time()) + expires_seconds
        raw = f"{settings.BUNNY_STREAM_TOKEN_KEY}{video_id}{exp}"
        token = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        return f"{base}?token={token}&expires={exp}"

    return base


# ── 7. Thumbnail URL ─────────────────────────────────────────────────────────

def thumbnail_url(video_id: str) -> str:
    """
    Public thumbnail URL for a Stream video.
    Bunny auto-generates thumbnails at: https://vz-{id}.b-cdn.net/{video_id}/thumbnail.jpg
    """
    cdn_host = settings.BUNNY_STREAM_CDN_HOST
    if cdn_host:
        return f"https://{cdn_host}/{video_id}/thumbnail.jpg"
    # Fallback: Bunny's default thumbnail endpoint
    lib_id = settings.BUNNY_STREAM_LIBRARY_ID
    return f"https://video.bunnycdn.com/library/{lib_id}/videos/{video_id}/thumbnail"


# ── Encoding status helper ────────────────────────────────────────────────────

ENCODING_STATUS = {
    0: "created",       # Placeholder created, waiting for upload
    1: "uploaded",      # File uploaded, queued for transcoding
    2: "processing",    # Transcoding in progress
    3: "transcoding",   # Legacy alias for processing
    4: "finished",      # Ready for playback
    5: "error",         # Transcoding failed
    6: "upload_failed", # Upload failed
}


def parse_encoding_status(status_code: int) -> str:
    """Convert numeric status to human-readable string."""
    return ENCODING_STATUS.get(status_code, f"unknown_{status_code}")
