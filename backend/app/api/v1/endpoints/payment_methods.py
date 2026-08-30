"""
payment_methods.py — public read surface for the Qo'llab-quvvatlash
(donation) feature (095_donation_payment_methods). No auth required — the
donation screen/page may be shown pre-login, and there's nothing sensitive
in an active method's PUBLIC fields (is_active and every audit column are
never returned here — see admin_payment_methods.py for the full record).
"""
import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.config_service import get_config

logger = logging.getLogger(__name__)
router = APIRouter()

# Same "no Redis, single process, short-TTL module dict" idiom as
# config_service.py. 60s per spec — long enough that the endpoint isn't
# hammered on every donation-screen open, short enough that an admin's
# edit (activate/deactivate/reorder/edit) is visible within a minute
# without needing an explicit cache-bust call.
_CACHE_TTL_SECONDS = 60
_cache: Optional[tuple] = None  # (cached_at, payload)


def _method_dict(row) -> dict:
    return {
        "id": str(row.id),
        "bankName": row.bank_name,
        "accountNumber": row.account_number,
        "numberType": row.number_type,
        "holderName": row.holder_name,
        "currency": row.currency,
        "region": row.region,
        "swift": row.swift,
        "note": row.note,
        "order": row.sort_order,
    }


def invalidate_payment_methods_cache() -> None:
    """Called by admin_payment_methods.py after any write so an edit is
    visible immediately rather than waiting out the TTL."""
    global _cache
    _cache = None


@router.get("/payment-methods")
async def list_payment_methods(db: Session = Depends(get_db)) -> dict:
    """Active methods only, ordered by sort_order. Returns exactly the
    PaymentMethod contract the client expects — never is_active or any
    audit/internal column."""
    global _cache
    now = time.monotonic()
    if _cache is not None and (now - _cache[0]) < _CACHE_TTL_SECONDS:
        return _cache[1]

    rows = db.execute(
        text("""
            SELECT id, bank_name, account_number, number_type, holder_name,
                   currency, region, swift, note, sort_order
            FROM payment_methods
            WHERE is_active
            ORDER BY sort_order
        """),
    ).fetchall()
    payload = {"methods": [_method_dict(r) for r in rows]}
    _cache = (now, payload)
    return payload


@router.get("/config/flags")
async def get_public_flags(db: Session = Depends(get_db)) -> dict:
    """Small, purpose-built remote-config surface for client feature flags —
    deliberately NOT a raw app_config dump. Only specific, curated,
    non-sensitive keys are ever added here; add new flags one at a time,
    never a generic passthrough that could leak an internal config key.

    donation_screen_enabled (095): Play-policy gate for the in-app donation
    screen — see the accompanying report. Defaults false; the client must
    treat any non-true value (including a fetch failure) as false.
    """
    return {
        "donationScreenEnabled": bool(get_config(db, "donation_screen_enabled", default=False)),
    }
