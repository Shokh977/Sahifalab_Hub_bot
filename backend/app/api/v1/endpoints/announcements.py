from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from pydantic import BaseModel

from app.db.session import get_db
from app.models.admin_models import Announcement, AnnouncementView
from app.services.auth_service import decode_token_payload
from app.api.v1.endpoints.admin import verify_admin

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class AnnouncementCreate(BaseModel):
    title:      str
    body:       str
    image_url:  Optional[str] = None
    cta_text:   Optional[str] = None
    cta_link:   Optional[str] = None
    starts_at:  Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_active:  bool = True


class AnnouncementUpdate(BaseModel):
    title:      Optional[str] = None
    body:       Optional[str] = None
    image_url:  Optional[str] = None
    cta_text:   Optional[str] = None
    cta_link:   Optional[str] = None
    starts_at:  Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_active:  Optional[bool] = None


class AnnouncementOut(BaseModel):
    id:         int
    title:      str
    body:       str
    image_url:  Optional[str]
    cta_text:   Optional[str]
    cta_link:   Optional[str]
    starts_at:  Optional[datetime]
    expires_at: Optional[datetime]
    is_active:  bool
    created_at: datetime

    class Config:
        from_attributes = True


class AnnouncementAdminOut(AnnouncementOut):
    view_count: int = 0
    created_by: Optional[int]
    updated_at: datetime


# ── Auth helper ───────────────────────────────────────────────────────────────

def _caller_id(authorization: Optional[str]) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization required")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid auth header")
    payload = decode_token_payload(parts[1])
    uid = payload.get("telegram_id") or payload.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token")
    return int(uid)


# ── Public: active announcements ──────────────────────────────────────────────

@router.get("/active", response_model=List[AnnouncementOut])
def get_active_announcements(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Return all active, non-expired announcements. Requires login."""
    _caller_id(authorization)  # just enforce auth — no filtering by user here
    now = datetime.now(timezone.utc)
    rows = (
        db.query(Announcement)
        .filter(
            Announcement.is_active == True,
            (Announcement.starts_at == None) | (Announcement.starts_at <= now),
            (Announcement.expires_at == None) | (Announcement.expires_at > now),
        )
        .order_by(Announcement.created_at.desc())
        .all()
    )
    return rows


# ── Public: record a view ─────────────────────────────────────────────────────

@router.post("/{announcement_id}/seen", status_code=204)
def mark_seen(
    announcement_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Record that the calling user has seen this announcement (idempotent)."""
    user_id = _caller_id(authorization)
    ann = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    view = AnnouncementView(announcement_id=announcement_id, user_id=user_id)
    db.add(view)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()  # already recorded — that's fine


# ── Admin: CRUD ───────────────────────────────────────────────────────────────

@router.get("/admin", response_model=List[AnnouncementAdminOut])
def admin_list(
    admin=Depends(verify_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(Announcement).order_by(Announcement.created_at.desc()).all()
    result = []
    for ann in rows:
        view_count = db.query(AnnouncementView).filter(AnnouncementView.announcement_id == ann.id).count()
        out = AnnouncementAdminOut.model_validate(ann)
        out.view_count = view_count
        result.append(out)
    return result


@router.post("/admin", response_model=AnnouncementAdminOut, status_code=201)
def admin_create(
    data: AnnouncementCreate,
    admin=Depends(verify_admin),
    db: Session = Depends(get_db),
):
    ann = Announcement(**data.model_dump(), created_by=admin.telegram_id)
    db.add(ann)
    db.commit()
    db.refresh(ann)
    out = AnnouncementAdminOut.model_validate(ann)
    out.view_count = 0
    return out


@router.put("/admin/{ann_id}", response_model=AnnouncementAdminOut)
def admin_update(
    ann_id: int,
    data: AnnouncementUpdate,
    admin=Depends(verify_admin),
    db: Session = Depends(get_db),
):
    ann = db.query(Announcement).filter(Announcement.id == ann_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(ann, k, v)
    ann.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ann)
    view_count = db.query(AnnouncementView).filter(AnnouncementView.announcement_id == ann_id).count()
    out = AnnouncementAdminOut.model_validate(ann)
    out.view_count = view_count
    return out


@router.delete("/admin/{ann_id}", status_code=204)
def admin_delete(
    ann_id: int,
    admin=Depends(verify_admin),
    db: Session = Depends(get_db),
):
    ann = db.query(Announcement).filter(Announcement.id == ann_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(ann)
    db.commit()
