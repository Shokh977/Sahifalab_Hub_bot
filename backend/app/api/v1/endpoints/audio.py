"""
Endpoint to convert Telegram file_id → temporary direct download URL.

The Telegram Bot API `getFile` method returns a `file_path` that is valid
for at least 1 hour.  We cache results so repeated requests for the same
file_id don't hammer the Telegram API.
"""

import time
import logging
from fastapi import APIRouter, HTTPException
import httpx

from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

# ── Simple in-memory cache ────────────────────────────────────────────────────
# { file_id: (url, expires_at_unix) }
_cache: dict[str, tuple[str, float]] = {}
CACHE_TTL = 3600  # 1 hour


async def _resolve_file_url(file_id: str) -> str:
    """Call Telegram getFile and build the download URL."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        raise HTTPException(500, "TELEGRAM_BOT_TOKEN is not configured")

    # Check cache first
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

    # Store in cache
    _cache[file_id] = (download_url, time.time() + CACHE_TTL)
    return download_url


@router.get("/get-audio-link/{file_id}")
async def get_audio_link(file_id: str):
    """
    Convert a Telegram ``file_id`` into a temporary direct download URL.

    The URL is valid for ~1 hour (Telegram's guarantee).
    Results are cached server-side so subsequent requests are instant.
    """
    url = await _resolve_file_url(file_id)
    return {"ok": True, "url": url}
