"""
sponsor_service.py — one-time access to the private Telegram channel
"SAHIFALAB homiylari" (111_sponsor_channel).

The pay bot opens a request for a Telegram user (a pending_enrollments row
with product = 'channel'), the user pays and sends the receipt, an admin
grants it. A granted row is the access record: the bot approves a channel
join request only from a Telegram id that has one.

The price comes from app_config 'sponsor_channel' ({"price": so'm}); the
admin changes it from the bot.
"""
import json
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.config_service import get_config, invalidate_config_cache

CONFIG_KEY = "sponsor_channel"
TITLE = "SAHIFALAB homiylari · yopiq kanal"
DEFAULT_PRICE = 50000
MIN_PRICE = 1000
MAX_PRICE = 100_000_000
CODE_TTL = timedelta(hours=24)


def price_from_config(raw: Any) -> int:
    if isinstance(raw, dict):
        value = raw.get("price")
        if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0:
            return int(value)
    return DEFAULT_PRICE


def current_price(db: Session) -> int:
    return price_from_config(get_config(db, CONFIG_KEY, None))


def set_price(db: Session, price: int) -> int:
    value = json.dumps({"price": int(price)})
    db.execute(text("""
        INSERT INTO app_config (key, value, description)
        VALUES (:key, CAST(:value AS JSONB), 'SAHIFALAB homiylari private channel: one-time access price in so''m')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    """), {"key": CONFIG_KEY, "value": value})
    db.commit()
    invalidate_config_cache(CONFIG_KEY)
    return int(price)


def has_access(db: Session, telegram_id: int) -> bool:
    return db.execute(text("""
        SELECT 1 FROM pending_enrollments
        WHERE user_id = :uid AND product = 'channel' AND status = 'granted'
        LIMIT 1
    """), {"uid": telegram_id}).scalar() is not None


def _payload(row) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "product": "channel",
        "reference_code": row.reference_code,
        "expected_amount": int(row.expected_amount or 0),
        "status": row.status,
        "expires_at": row.expires_at.isoformat() if row.expires_at else None,
        "course_title": TITLE,
        "item_title": TITLE,
    }


def open_request(db: Session, telegram_id: int, code: str, buyer: str) -> dict:
    """
    The user's open channel request, or a new one (commits).

    status 'granted' means they already have access and no request is made.
    An open request still awaiting payment is moved to today's price, so a
    price change by the admin applies to everyone who hasn't paid yet.
    """
    if has_access(db, telegram_id):
        return {"status": "granted", "product": "channel", "user_id": telegram_id, "item_title": TITLE}

    price = current_price(db)
    row = db.execute(text("""
        SELECT id, user_id, reference_code, expected_amount, status, expires_at
        FROM pending_enrollments
        WHERE user_id = :uid AND product = 'channel'
          AND status IN ('awaiting_payment', 'paid') AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
    """), {"uid": telegram_id}).fetchone()

    if row is not None:
        if row.status == "awaiting_payment" and int(row.expected_amount or 0) != price:
            db.execute(
                text("UPDATE pending_enrollments SET expected_amount = :amount WHERE id = :id"),
                {"amount": price, "id": row.id},
            )
            db.commit()
            return {**_payload(row), "expected_amount": price}
        return _payload(row)

    expires_at = datetime.now(timezone.utc) + CODE_TTL
    row = db.execute(text("""
        INSERT INTO pending_enrollments
          (user_id, course_id, product, pro_months, reference_code, expected_amount, status, expires_at, admin_notes)
        VALUES (:uid, NULL, 'channel', NULL, :code, :amount, 'awaiting_payment', :expires, :notes)
        RETURNING id, user_id, reference_code, expected_amount, status, expires_at
    """), {
        "uid": telegram_id, "code": code, "amount": price, "expires": expires_at,
        "notes": f"Telegram: {buyer}"[:500] if buyer else None,
    }).fetchone()
    db.commit()
    return _payload(row)


def buyer_label(first_name: Optional[str], username: Optional[str]) -> str:
    name = (first_name or "").strip()
    if username:
        name = f"{name} (@{username})".strip()
    return name
