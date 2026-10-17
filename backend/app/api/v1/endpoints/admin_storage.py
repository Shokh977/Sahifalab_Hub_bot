"""
admin_storage.py — move files still hosted in Supabase Storage to Bunny.

Everything the app uploads today goes to Bunny (POST /api/upload/*), but
rows created before that still point at Supabase Storage URLs — book PDFs
and covers, ambient sounds, maybe avatars/images. Each view or play of those
is Supabase "Cached Egress", which pushed the org over its 5 GB quota.

Mounted at /api/admin/storage. Admin-only.

GET  /supabase-files  — read-only scan: every DB row/column whose value is a
                        Supabase Storage URL (tables that don't exist are
                        skipped via information_schema).
POST /migrate?limit=N — moves up to N distinct files: download from
                        Supabase → shrink (raster images → WebP, audio →
                        96 kbps MP3) → upload to Bunny → rewrite every row
                        that pointed at the old URL. Idempotent: migrated
                        rows no longer match the scan, so calling it again
                        continues where it stopped. The Supabase files are
                        NOT deleted — remove the buckets once the scan is
                        empty and the app checks out.

Handlers are plain `def` (thread pool): downloads and ffmpeg can take a
while and must never sit on the event loop.
"""
import hashlib
import logging
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.api.v1.endpoints.admin import verify_admin
from app.api.v1.endpoints.upload import (
    ALLOWED_AUDIO_MIME, RASTER_IMAGE_MIME, _AUDIO_EXT_MIME,
    _bunny_storage_url, _cdn_url, _compress_to_webp, _ffmpeg_to_mp3,
)
from app.models.admin_models import AdminUser

logger = logging.getLogger(__name__)

router = APIRouter()

SUPABASE_STORAGE_MARKER = ".supabase.co/storage/v1/object/"

# (table, primary key, url columns). Anything missing in this database is
# skipped, so app-era and Supabase-era tables can both be listed.
TARGETS: list[tuple[str, str, list[str]]] = [
    ("book",          "id",          ["file_url", "thumbnail_url"]),
    ("ambient_sound", "id",          ["url"]),
    ("hero_content",  "id",          ["image_url"]),
    ("announcements", "id",          ["image_url"]),
    ("profiles",      "telegram_id", ["photo_url", "cover_image_url"]),
    ("posts",         "id",          ["image_url"]),
    ("flashcards",    "id",          ["front_image", "back_image"]),
    ("courses",       "id",          ["thumbnail_url"]),
    ("lessons",       "id",          ["material_url", "video_url"]),
    ("challenges",    "id",          ["cover_image_url"]),
    ("resource",      "id",          ["url", "thumbnail_url"]),
]

_MAX_FILE_BYTES = 100 * 1024 * 1024
_EXT_MIME = {
    ".pdf": "application/pdf", ".epub": "application/epub+zip",
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
    ".webp": "image/webp", ".svg": "image/svg+xml", **_AUDIO_EXT_MIME,
}


def _existing_targets(db: Session) -> list[tuple[str, str, str]]:
    rows = db.execute(text("""
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'
    """)).fetchall()
    have = {(r.table_name, r.column_name) for r in rows}
    return [(t, pk, c) for t, pk, cols in TARGETS for c in cols if (t, c) in have and (t, pk) in have]


def _scan(db: Session) -> list[dict]:
    out = []
    for table, pk, col in _existing_targets(db):
        # position(), not LIKE '%…%': a bare % in text() SQL breaks under
        # pg8000 (documented in this codebase, see study_activity.py).
        for r in db.execute(text(
            f'SELECT "{pk}" AS id, "{col}" AS url FROM "{table}" '
            f'WHERE "{col}" IS NOT NULL AND position(:m in "{col}") > 0'
        ), {"m": SUPABASE_STORAGE_MARKER}).fetchall():
            out.append({"table": table, "id": r.id, "column": col, "url": r.url})
    return out


@router.get("/supabase-files")
def list_supabase_files(
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    items = _scan(db)
    return {"count": len(items), "distinct_files": len({i["url"] for i in items}), "items": items}


def _remote_path(table: str, column: str, url: str, ext: str) -> str:
    digest = hashlib.sha1(url.encode()).hexdigest()[:20]
    return f"migrated/{table}/{column}/{digest}{ext}"


def _guess_type(url: str, header_type: Optional[str]) -> tuple[str, str]:
    ext = Path(url.split("?")[0]).suffix.lower()
    ctype = (header_type or "").split(";")[0].strip().lower()
    if not ctype or ctype in ("application/octet-stream", "binary/octet-stream"):
        ctype = _EXT_MIME.get(ext, "application/octet-stream")
    return ctype, ext or ".bin"


def _move_one(client: httpx.Client, table: str, column: str, url: str) -> dict:
    res = client.get(url)
    if res.status_code != 200:
        raise RuntimeError(f"download {res.status_code}")
    data = res.content
    if len(data) > _MAX_FILE_BYTES:
        raise RuntimeError(f"too large ({len(data) // 1048576} MB)")
    ctype, ext = _guess_type(url, res.headers.get("content-type"))
    before = len(data)

    if ctype in RASTER_IMAGE_MIME:
        webp = _compress_to_webp(data)
        # _compress_to_webp hands back the original bytes when it can't
        # convert — only relabel when the output really is WebP.
        if webp[:4] == b"RIFF" and webp[8:12] == b"WEBP" and len(webp) < len(data):
            data, ctype, ext = webp, "image/webp", ".webp"
    elif ctype in ALLOWED_AUDIO_MIME or ctype == "audio/mp3":
        try:
            small = _ffmpeg_to_mp3(data, ext)
            if len(small) < len(data):
                data, ctype, ext = small, "audio/mpeg", ".mp3"
        except Exception as e:
            logger.warning("migrate: audio left as-is (%s): %s", url, e)

    remote = _remote_path(table, column, url, ext)
    put = client.put(
        _bunny_storage_url(remote), content=data,
        headers={"AccessKey": settings.BUNNY_API_KEY, "Content-Type": ctype},
    )
    if put.status_code not in (200, 201):
        raise RuntimeError(f"bunny {put.status_code}: {put.text[:120]}")
    return {"new_url": _cdn_url(remote), "bytes_before": before, "bytes_after": len(data)}


@router.post("/migrate")
def migrate_to_bunny(
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    if not settings.BUNNY_STORAGE_ZONE or not settings.BUNNY_API_KEY or not settings.BUNNY_CDN_HOSTNAME:
        raise HTTPException(503, "Bunny sozlanmagan (BUNNY_STORAGE_ZONE / BUNNY_API_KEY / BUNNY_CDN_HOSTNAME).")

    items = _scan(db)
    # One upload per distinct URL; every row/column that uses it is rewritten.
    by_url: dict[str, list[dict]] = {}
    for it in items:
        by_url.setdefault(it["url"], []).append(it)

    migrated, failed = [], []
    with httpx.Client(timeout=120.0, follow_redirects=True) as client:
        for url, uses in list(by_url.items())[:limit]:
            first = uses[0]
            try:
                moved = _move_one(client, first["table"], first["column"], url)
            except Exception as e:
                logger.warning("migrate failed for %s: %s", url, e)
                failed.append({"url": url, "error": str(e)[:200], "uses": len(uses)})
                continue
            for it in uses:
                db.execute(
                    text(f'UPDATE "{it["table"]}" SET "{it["column"]}" = :new WHERE "{it["column"]}" = :old'),
                    {"new": moved["new_url"], "old": url},
                )
            db.commit()
            migrated.append({"old_url": url, **moved,
                             "rows": [f'{u["table"]}.{u["column"]}#{u["id"]}' for u in uses]})

    remaining = len(by_url) - len(migrated)
    return {
        "migrated": migrated,
        "failed": failed,
        "remaining_files": remaining,
        "saved_bytes": sum(m["bytes_before"] - m["bytes_after"] for m in migrated),
    }
