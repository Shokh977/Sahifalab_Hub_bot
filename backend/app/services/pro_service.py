"""
pro_service.py — Sahifalab Pro one-time passes (107_pro_orders).

A pass is bought through the manual payment queue: the app asks for a
PAY-XXXX-YYYY code (a pending_enrollments row with product = 'pro'), the
user pays and sends the receipt to the pay bot, an admin grants it. Granting
extends profiles.pro_until by the pass length — from now, or from the
current end if Pro is still active, so buying early never loses days.

Prices come from app_config 'pro_plans' ({"1": so'm, "3": …, "12": …}).
"""
import calendar
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.config_service import get_config

PLAN_MONTHS = (1, 3, 12)
DEFAULT_PRICES = {1: 29000, 3: 69000, 12: 199000}
CODE_TTL = timedelta(hours=24)


def plan_prices(db: Session) -> dict[int, int]:
    raw: Any = get_config(db, "pro_plans", None)
    prices = dict(DEFAULT_PRICES)
    if isinstance(raw, dict):
        for months in PLAN_MONTHS:
            value = raw.get(str(months))
            if isinstance(value, (int, float)) and value > 0:
                prices[months] = int(value)
    return prices


def plans_payload(db: Session) -> list[dict]:
    prices = plan_prices(db)
    monthly = prices[1]
    out = []
    for months in PLAN_MONTHS:
        price = prices[months]
        full = monthly * months
        out.append({
            "months": months,
            "price": price,
            "per_month": round(price / months),
            "saving_percent": max(0, round((1 - price / full) * 100)) if full else 0,
        })
    return out


def add_months(d: datetime, months: int) -> datetime:
    """Same day `months` later, clamped to the month's last day (31 Jan + 1 → 28/29 Feb)."""
    total = d.month - 1 + months
    year, month = d.year + total // 12, total % 12 + 1
    return d.replace(year=year, month=month, day=min(d.day, calendar.monthrange(year, month)[1]))


def extended_until(current: Optional[datetime], months: int, now: Optional[datetime] = None) -> datetime:
    """New pro_until after buying `months`: stacked on an active pass."""
    now = now or datetime.now(timezone.utc)
    if current is not None and current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    start = current if current is not None and current > now else now
    return add_months(start, months)


def open_pro_request(db: Session, user_id: int) -> Optional[dict]:
    row = db.execute(text("""
        SELECT reference_code, status, expires_at, pro_months, expected_amount
        FROM pending_enrollments
        WHERE user_id = :uid AND product = 'pro'
          AND status IN ('awaiting_payment', 'paid') AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
    """), {"uid": user_id}).fetchone()
    if row is None:
        return None
    return {
        "reference_code": row.reference_code,
        "status": row.status,
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        "months": row.pro_months,
        "amount": int(row.expected_amount or 0),
    }


def open_pro_request_row(db: Session, user_id: int, months: int) -> Optional[int]:
    """Id of the user's open Pro request for `months`, if any."""
    return db.execute(text("""
        SELECT id FROM pending_enrollments
        WHERE user_id = :uid AND product = 'pro' AND pro_months = :months
          AND status IN ('awaiting_payment', 'paid')
        ORDER BY created_at DESC
        LIMIT 1
    """), {"uid": user_id, "months": months}).scalar()


def grant_pro(db: Session, user_id: int, months: int) -> datetime:
    """Extend the user's Pro by `months` and return the new end (commits)."""
    current = db.execute(
        text("SELECT pro_until FROM profiles WHERE telegram_id = :uid FOR UPDATE"), {"uid": user_id},
    ).scalar()
    until = extended_until(current, months)
    db.execute(text("UPDATE profiles SET pro_until = :until WHERE telegram_id = :uid"), {"until": until, "uid": user_id})
    db.commit()
    return until
