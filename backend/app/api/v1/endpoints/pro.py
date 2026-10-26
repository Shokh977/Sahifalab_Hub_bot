"""
pro.py — Sahifalab Pro one-time passes (107_pro_orders). Mounted at /pro.

  GET  /pro/plans          — the 1 / 3 / 12-month passes with prices (public)
  GET  /pro/status         — your Pro (is_pro, pro_until, days_left) and any open request
  POST /pro/request-code   — a PAY-XXXX-YYYY code for a pass (idempotent per open request)

The admin grants a paid request in the existing pending-enrollments queue
(admin.py), which calls pro_service.grant_pro. Sync handlers: FastAPI runs
them in its threadpool, so the sync DB session never blocks the event loop.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.endpoints.enrollments import TELEGRAM_BOT_URL, _generate_ref_code
from app.db.session import get_db
from app.services import cosmetics_service as cosmetics
from app.services import pro_service
from app.services.auth_service import decode_token

router = APIRouter(tags=["pro"])

MAX_OPEN_REQUESTS = 3


def _require_user(authorization: Optional[str]) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Avtorizatsiya talab qilinadi")
    tid = decode_token(authorization.split(" ", 1)[1])
    if not tid:
        raise HTTPException(status_code=401, detail="Avtorizatsiya talab qilinadi")
    return tid


def _require_enabled(db: Session) -> None:
    if not cosmetics.looks_enabled(db):
        raise HTTPException(status_code=503, detail="Pro hali yoqilmagan")


@router.get("/plans")
def get_plans(db: Session = Depends(get_db)):
    return {"plans": pro_service.plans_payload(db)}


@router.get("/status")
def get_status(authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user_id = _require_user(authorization)
    _require_enabled(db)
    _, pro_until = cosmetics.read_look_row(db, user_id)
    active = cosmetics.pro_active(pro_until)
    days_left = 0
    if active and pro_until is not None:
        end = pro_until if pro_until.tzinfo else pro_until.replace(tzinfo=timezone.utc)
        days_left = max(0, (end - datetime.now(timezone.utc)).days + 1)
    return {
        "is_pro": active,
        "pro_until": pro_until.isoformat() if pro_until else None,
        "days_left": days_left,
        "pending": pro_service.open_pro_request(db, user_id),
    }


class RequestCodeBody(BaseModel):
    months: int


@router.post("/request-code")
def request_code(body: RequestCodeBody, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    user_id = _require_user(authorization)
    _require_enabled(db)
    if body.months not in pro_service.PLAN_MONTHS:
        raise HTTPException(status_code=400, detail="Bunday Pro muddati yoʻq")

    open_req = pro_service.open_pro_request(db, user_id)
    if open_req and open_req["months"] == body.months:
        return {**open_req, "telegram_bot_url": TELEGRAM_BOT_URL}
    if open_req:
        # A different pass: the old request is replaced, not stacked.
        db.execute(text("""
            UPDATE pending_enrollments SET status = 'cancelled', admin_notes = 'Boshqa Pro muddati tanlandi'
            WHERE user_id = :uid AND product = 'pro' AND status = 'awaiting_payment'
        """), {"uid": user_id})

    active = db.execute(text("""
        SELECT COUNT(*) FROM pending_enrollments
        WHERE user_id = :uid AND status IN ('awaiting_payment', 'paid') AND expires_at > NOW()
    """), {"uid": user_id}).scalar() or 0
    if active >= MAX_OPEN_REQUESTS:
        db.rollback()
        raise HTTPException(
            status_code=429,
            detail="Bir vaqtda 3 tadan ortiq toʻlov soʻroviga ega boʻla olmaysiz. "
                   "Avvalgi soʻrovni bekor qiling yoki 24 soat kuting.",
        )

    price = pro_service.plan_prices(db)[body.months]
    code = _generate_ref_code()
    expires_at = datetime.now(timezone.utc) + pro_service.CODE_TTL
    db.execute(text("""
        INSERT INTO pending_enrollments
          (user_id, course_id, product, pro_months, reference_code, expected_amount, status, expires_at)
        VALUES (:uid, NULL, 'pro', :months, :code, :amount, 'awaiting_payment', :expires)
    """), {"uid": user_id, "months": body.months, "code": code, "amount": price, "expires": expires_at})
    db.commit()
    return {
        "reference_code": code,
        "status": "awaiting_payment",
        "expires_at": expires_at.isoformat(),
        "months": body.months,
        "amount": price,
        "telegram_bot_url": TELEGRAM_BOT_URL,
    }
