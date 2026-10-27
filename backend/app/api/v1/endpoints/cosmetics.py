"""
cosmetics.py — public cosmetics catalog data the app can't ship with.

GET /api/cosmetics/badges                 — active name badges (110), catalog order
GET /api/cosmetics/badge-files/{name}     — the 10 starter badge files bundled
                                            with the backend (uploaded ones are on the CDN)

Badge URLs may be relative (starter files): the app resolves them against
the API host. Files never change under the same name (a re-upload gets a
new name), so they're served as immutable.
"""
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services import cosmetics_service as cosmetics

router = APIRouter()

_FILES = Path(__file__).resolve().parents[3] / "static" / "badges"
_NAME_RE = re.compile(r"^[a-z0-9_]{2,24}(-[dl])?\.(webp|png)$")


@router.get("/badges")
def list_badges(db: Session = Depends(get_db)):
    """Active badges with their files and unlock rule. Cached 60 s server-side."""
    return {"badges": cosmetics.sync_badges(db)}


@router.get("/badge-files/{name}")
def badge_file(name: str):
    if not _NAME_RE.match(name):
        raise HTTPException(status_code=404, detail="Topilmadi")
    path = _FILES / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Topilmadi")
    return FileResponse(
        path,
        media_type="image/webp" if name.endswith(".webp") else "image/png",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )
