"""
admin_badges.py — admin catalog of Pro name badges (110_name_badges).
Mounted at /api/admin/badges. Admin-only (verify_admin, from admin.py).

GET    /        — every badge, inactive included
POST   /        — add a badge, or replace one's files (multipart: id, title,
                  unlock, season, streak_days, sort_order + dark, light,
                  static files). Files go to the CDN untouched — the generic
                  /upload/file re-encodes WebP, which would drop the animation.
PATCH  /{id}    — title / unlock / season / streak_days / sort_order / is_active

A new badge shows up in the app within a minute (cosmetics_service caches
the catalog for 60 s) and needs no app update.
"""
import io
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.endpoints.admin import verify_admin
from app.api.v1.endpoints.upload import _upload_to_bunny
from app.db.session import get_db
from app.services import cosmetics_service as cosmetics

try:
    from PIL import Image
except ImportError:  # Pillow is in requirements; keep the module importable regardless
    Image = None

router = APIRouter()

_ID_RE = re.compile(r"^[a-z0-9_]{2,24}$")
_UNLOCKS = {"free", "pro", "seasonal", "achievement"}
_SEASONS = {"navroz", "ramazon"}
_MAX_BYTES = 300 * 1024
_MAX_PX = 256


def _row(r) -> dict:
    return {
        "id": r.id, "title": r.title, "unlock": r.unlock, "season": r.season,
        "streak_days": r.streak_days, "dark": r.dark_url, "light": r.light_url,
        "static": r.static_url, "sort_order": r.sort_order, "is_active": r.is_active,
    }


def _check_rule(unlock: str, season: Optional[str], streak_days: Optional[int]) -> None:
    if unlock not in _UNLOCKS:
        raise HTTPException(400, "unlock: free, pro, seasonal yoki achievement")
    if unlock == "seasonal" and season not in _SEASONS:
        raise HTTPException(400, "Mavsumiy belgi uchun season: navroz yoki ramazon")
    if unlock == "achievement" and not streak_days:
        raise HTTPException(400, "Yutuq belgisi uchun streak_days kerak")


def _check_image(data: bytes, label: str, animated: bool) -> str:
    """Validate one badge file; returns its content type."""
    if len(data) > _MAX_BYTES:
        raise HTTPException(413, f"{label}: {len(data) // 1024} KB — eng ko'pi 300 KB")
    if Image is None:
        raise HTTPException(503, "Pillow o'rnatilmagan")
    try:
        im = Image.open(io.BytesIO(data))
        fmt, (w, h) = im.format, im.size
        frames = getattr(im, "n_frames", 1)
    except Exception:
        raise HTTPException(400, f"{label}: rasm o'qilmadi")
    if w != h or w > _MAX_PX:
        raise HTTPException(400, f"{label}: kvadrat va {_MAX_PX}px dan kichik bo'lsin ({w}×{h})")
    if animated:
        if fmt != "WEBP":
            raise HTTPException(400, f"{label}: animatsion WebP bo'lsin")
        if frames < 2:
            raise HTTPException(400, f"{label}: animatsiya topilmadi (1 kadr)")
        return "image/webp"
    if fmt not in ("PNG", "WEBP"):
        raise HTTPException(400, f"{label}: PNG yoki WebP bo'lsin")
    return "image/png" if fmt == "PNG" else "image/webp"


@router.get("")
def list_badges(admin=Depends(verify_admin), db: Session = Depends(get_db)):
    rows = db.execute(text("SELECT * FROM name_badges ORDER BY sort_order, created_at")).fetchall()
    return {"badges": [_row(r) for r in rows]}


@router.post("")
async def save_badge(
    id: str = Form(...),
    title: str = Form(...),
    unlock: str = Form("pro"),
    season: Optional[str] = Form(None),
    streak_days: Optional[int] = Form(None),
    sort_order: int = Form(100),
    dark: UploadFile = File(...),
    light: UploadFile = File(...),
    static: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    await verify_admin(authorization=authorization, db=db)
    if not _ID_RE.match(id) or id == "none":
        raise HTTPException(400, "id: 2–24 ta kichik lotin harf, raqam yoki _")
    title = title.strip()
    if not title or len(title) > 24:
        raise HTTPException(400, "Nomi 1–24 belgi bo'lsin")
    season = season or None
    _check_rule(unlock, season, streak_days)

    files = {"dark": await dark.read(), "light": await light.read(), "static": await static.read()}
    types = {
        "dark": _check_image(files["dark"], "Tungi fayl", animated=True),
        "light": _check_image(files["light"], "Kunduzgi fayl", animated=True),
        "static": _check_image(files["static"], "Statik kadr", animated=False),
    }
    # A new name per upload: the app caches files forever by URL.
    tag = uuid.uuid4().hex[:8]
    ext = {"image/webp": "webp", "image/png": "png"}
    urls = {}
    for key, suffix in (("dark", "-d"), ("light", "-l"), ("static", "")):
        urls[key] = await _upload_to_bunny(
            files[key], f"badges/{id}-{tag}{suffix}.{ext[types[key]]}", types[key],
        )

    def _write() -> dict:
        db.execute(text("""
            INSERT INTO name_badges (id, title, unlock, season, streak_days, sort_order,
                                     dark_url, light_url, static_url)
            VALUES (:id, :title, :unlock, :season, :streak, :sort, :dark, :light, :static)
            ON CONFLICT (id) DO UPDATE SET
              title = EXCLUDED.title, unlock = EXCLUDED.unlock, season = EXCLUDED.season,
              streak_days = EXCLUDED.streak_days, sort_order = EXCLUDED.sort_order,
              dark_url = EXCLUDED.dark_url, light_url = EXCLUDED.light_url,
              static_url = EXCLUDED.static_url, updated_at = NOW()
        """), {
            "id": id, "title": title, "unlock": unlock, "season": season, "streak": streak_days,
            "sort": sort_order, "dark": urls["dark"], "light": urls["light"], "static": urls["static"],
        })
        db.commit()
        cosmetics.sync_badges(db, force=True)
        return _row(db.execute(text("SELECT * FROM name_badges WHERE id = :id"), {"id": id}).fetchone())

    return await run_in_threadpool(_write)


class BadgePatch(BaseModel):
    title: Optional[str] = None
    unlock: Optional[str] = None
    season: Optional[str] = None
    streak_days: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


@router.patch("/{badge_id}")
def patch_badge(badge_id: str, body: BadgePatch, admin=Depends(verify_admin), db: Session = Depends(get_db)):
    row = db.execute(text("SELECT * FROM name_badges WHERE id = :id"), {"id": badge_id}).fetchone()
    if row is None:
        raise HTTPException(404, "Belgi topilmadi")
    merged = {**_row(row), **body.model_dump(exclude_unset=True)}
    if body.title is not None and not (0 < len(body.title.strip()) <= 24):
        raise HTTPException(400, "Nomi 1–24 belgi bo'lsin")
    _check_rule(merged["unlock"], merged["season"], merged["streak_days"])
    db.execute(text("""
        UPDATE name_badges SET title = :title, unlock = :unlock, season = :season,
               streak_days = :streak, sort_order = :sort, is_active = :active, updated_at = NOW()
        WHERE id = :id
    """), {
        "id": badge_id, "title": merged["title"].strip(), "unlock": merged["unlock"],
        "season": merged["season"], "streak": merged["streak_days"],
        "sort": merged["sort_order"], "active": merged["is_active"],
    })
    db.commit()
    cosmetics.sync_badges(db, force=True)
    return _row(db.execute(text("SELECT * FROM name_badges WHERE id = :id"), {"id": badge_id}).fetchone())
