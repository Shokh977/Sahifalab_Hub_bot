"""
admin_sponsor.py — the private Telegram channel "SAHIFALAB homiylari"
(111_sponsor_channel). Mounted at /api/admin/sponsor-channel. Admin-only
(verify_admin), which includes the pay bot's service key.

GET  /config              — {price, title}
PUT  /config              — {price} in so'm
POST /request             — open (or return) a buyer's request: {telegram_id, first_name, username}
GET  /access/{telegram_id} — {granted}: may this Telegram account join the channel?

Granting and cancelling go through the shared pending-enrollments endpoints
(admin.py). Sync handlers: FastAPI runs them in its threadpool, so the sync
DB session never blocks the event loop.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.v1.endpoints.admin import verify_admin
from app.api.v1.endpoints.enrollments import _generate_ref_code
from app.db.session import get_db
from app.models.admin_models import AdminUser
from app.services import sponsor_service as sponsor

router = APIRouter()


@router.get("/config")
def get_config(db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin)):
    return {"price": sponsor.current_price(db), "title": sponsor.TITLE}


class _ConfigBody(BaseModel):
    price: int


@router.put("/config")
def put_config(body: _ConfigBody, db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin)):
    if not sponsor.MIN_PRICE <= body.price <= sponsor.MAX_PRICE:
        raise HTTPException(status_code=400, detail=f"Narx {sponsor.MIN_PRICE} soʻmdan kam boʻlmasligi kerak")
    return {"price": sponsor.set_price(db, body.price), "title": sponsor.TITLE}


class _RequestBody(BaseModel):
    telegram_id: int
    first_name:  Optional[str] = None
    username:    Optional[str] = None


@router.post("/request")
def open_request(body: _RequestBody, db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin)):
    buyer = sponsor.buyer_label(body.first_name, body.username)
    return {
        **sponsor.open_request(db, body.telegram_id, _generate_ref_code(), buyer),
        "user_name": body.first_name or f"#{body.telegram_id}",
        "user_username": body.username,
    }


@router.get("/access/{telegram_id}")
def get_access(telegram_id: int, db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin)):
    return {"granted": sponsor.has_access(db, telegram_id)}
