"""
admin_payment_methods.py — admin CRUD for Qo'llab-quvvatlash (donation)
payment methods (095_donation_payment_methods). Mounted at
/api/admin/payment-methods. Admin-only (verify_admin, reused from admin.py
— same pattern as admin_challenges.py/admin_daily_quiz.py).

GET    /                — all methods (including inactive), full admin fields
POST   /                — create
PATCH  /{id}             — edit. A change to account_number specifically
                            requires confirm_account_number_change=true —
                            see _require_account_number_confirmation below.
DELETE /{id}             — SOFT delete (is_active=false) — deleting a row
                            outright loses audit continuity; nothing here
                            ever hard-deletes a payment method.
POST   /reorder          — accepts an ordered list of ids, rewrites sort_order

Treat this module as a fraud target, not routine CRUD: if admin access is
ever compromised, swapping a card number silently redirects every future
donation. Every mutation is (1) audited — who, when, old value, new value
— to payment_method_audit_log, (2) pushed to every admin in
ADMIN_TELEGRAM_IDS via the same direct-Telegram-message channel
daily_quiz_service.py uses for its own admin paging, and (3) rate-limited
per admin.
"""
import asyncio
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta, UTC
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.v1.endpoints.admin import verify_admin
from app.models.admin_models import AdminUser
from app.services import payment_validation as pv
from app.api.v1.endpoints.payment_methods import invalidate_payment_methods_cache

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Per-admin rate limit — same in-memory, single-process idiom as
# pay.py's _check_init_rate_limit (this app runs as one Railway process,
# no Redis in the stack). Mutations only — GET is unlimited. ────────────────
_mutation_history: dict[int, list[datetime]] = defaultdict(list)
_mutation_lock = asyncio.Lock()
_MAX_MUTATIONS_PER_MINUTE = 20


async def _check_mutation_rate_limit(admin_telegram_id: int) -> None:
    async with _mutation_lock:
        now = datetime.now(UTC)
        cutoff = now - timedelta(seconds=60)
        history = [t for t in _mutation_history[admin_telegram_id] if t > cutoff]
        if len(history) >= _MAX_MUTATIONS_PER_MINUTE:
            raise HTTPException(429, "Juda ko'p o'zgarish. 1 daqiqadan so'ng urinib ko'ring.")
        history.append(now)
        _mutation_history[admin_telegram_id] = history


def _db_dict(row) -> dict:
    """Snake_case, DB-column-shaped — used ONLY for audit log entries and
    admin notifications, never returned over the API. Keeping this
    separate from _admin_dict (the camelCase API response shape) is
    deliberate: mixing the two here once already produced a real bug where
    the update-path notification showed placeholder '—' instead of the
    actual old/new account numbers."""
    return {
        "id": str(row.id),
        "bank_name": row.bank_name,
        "account_number": row.account_number,
        "number_type": row.number_type,
        "holder_name": row.holder_name,
        "currency": row.currency,
        "region": row.region,
        "swift": row.swift,
        "note": row.note,
        "sort_order": row.sort_order,
        "is_active": row.is_active,
    }


def _admin_dict(row) -> dict:
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
        "isActive": row.is_active,
        "createdAt": row.created_at.isoformat(),
        "updatedAt": row.updated_at.isoformat(),
        "createdBy": row.created_by,
        "updatedBy": row.updated_by,
    }


def _write_audit_log(db: Session, method_id: Optional[str], action: str, admin_id: int,
                      old_value: Optional[dict], new_value: Optional[dict]) -> None:
    db.execute(
        text("""
            INSERT INTO payment_method_audit_log
                (payment_method_id, action, admin_telegram_id, old_value, new_value)
            VALUES (:mid, :action, :admin, CAST(:old AS jsonb), CAST(:new AS jsonb))
        """),
        {
            "mid": method_id, "action": action, "admin": admin_id,
            "old": json.dumps(old_value) if old_value is not None else None,
            "new": json.dumps(new_value) if new_value is not None else None,
        },
    )


async def _notify_admins_of_change(action: str, admin: AdminUser, old_value: Optional[dict], new_value: Optional[dict]) -> None:
    """A rogue or mistaken change becomes visible within seconds — same
    paging channel/pattern as daily_quiz_service.py's admin alerts.
    Deliberately shows OLD and NEW account_number side by side (the one
    field where a silent swap actually redirects money)."""
    from app.core.config import settings

    admin_ids: list[int] = settings.ADMIN_TELEGRAM_IDS or []
    bot_token: str = settings.TELEGRAM_BOT_TOKEN

    old_acct = (old_value or {}).get("account_number", "—")
    new_acct = (new_value or {}).get("account_number", "—")
    bank = (new_value or old_value or {}).get("bank_name", "?")
    message = (
        f"💳 <b>To'lov usuli o'zgartirildi ({action})</b>\n\n"
        f"Admin: <code>{admin.telegram_id}</code>\n"
        f"Bank: {bank}\n"
        f"Eski raqam: <code>{old_acct}</code>\n"
        f"Yangi raqam: <code>{new_acct}</code>\n\n"
        "Agar bu o'zgarishni siz amalga oshirmagan bo'lsangiz, DARHOL "
        "admin panelidagi audit jurnalini tekshiring."
    )
    if not bot_token or not admin_ids:
        logger.critical("payment_method change (no admin channel configured, logging only): %s", message)
        return
    for chat_id in admin_ids:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
                )
        except Exception:
            logger.error("Failed to page admin %s about payment_method change", chat_id, exc_info=True)


def _validate_and_normalize(bank_name: str, account_number: str, number_type: str,
                             holder_name: str, currency: str, region: str,
                             swift: Optional[str], note: Optional[str]) -> tuple[dict, list[str]]:
    """Runs every field through payment_validation.py. Raises HTTPException
    on any hard error; returns (normalized_fields, warnings) on success."""
    errors: list[str] = []
    warnings: list[str] = []
    normalized: dict = {}

    if number_type not in pv.KNOWN_NUMBER_TYPES:
        errors.append(f"number_type 'card', 'account' yoki 'iban' bo'lishi kerak, '{number_type}' emas")
    else:
        acct_result = pv.validate_account_number(number_type, account_number)
        errors.extend(acct_result.errors)
        warnings.extend(acct_result.warnings)
        if acct_result.ok:
            normalized["account_number"] = acct_result.normalized["account_number"]

    bank_result = pv.validate_display_name(bank_name, "Bank nomi")
    errors.extend(bank_result.errors)
    warnings.extend(bank_result.warnings)
    if bank_result.ok:
        normalized["bank_name"] = bank_result.normalized["value"]

    holder_result = pv.validate_display_name(holder_name, "Karta egasi")
    errors.extend(holder_result.errors)
    warnings.extend(holder_result.warnings)
    if holder_result.ok:
        normalized["holder_name"] = holder_result.normalized["value"]

    swift_result = pv.validate_swift(swift)
    errors.extend(swift_result.errors)
    if swift_result.ok:
        normalized["swift"] = swift_result.normalized["swift"]

    currency_clean = pv.sanitize_text(currency).upper()
    region_clean = pv.sanitize_text(region).lower()
    if not currency_clean:
        errors.append("currency bo'sh bo'lishi mumkin emas")
    if not region_clean:
        errors.append("region bo'sh bo'lishi mumkin emas")
    normalized["currency"] = currency_clean
    normalized["region"] = region_clean
    normalized["note"] = pv.sanitize_text(note) or None
    normalized["number_type"] = number_type

    if errors:
        raise HTTPException(422, {"errors": errors, "warnings": warnings})

    return normalized, warnings


@router.get("")
async def list_all_payment_methods(db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin)):
    rows = db.execute(
        text("""
            SELECT id, bank_name, account_number, number_type, holder_name,
                   currency, region, swift, note, sort_order, is_active,
                   created_at, updated_at, created_by, updated_by
            FROM payment_methods
            ORDER BY sort_order
        """),
    ).fetchall()
    return {"methods": [_admin_dict(r) for r in rows]}


@router.get("/stats")
async def get_donation_stats(
    days: int = 30,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Copy-rate per method — 'the metric that matters' per spec: it tells
    the admin which payment methods are actually used vs. dead weight.
    Reads analytics_events directly (034_analytics_events) — the same
    table analytics.py's POST /track writes into, just via a plain SELECT
    on the ORM session rather than the PostgREST round-trip that endpoint
    uses for writes; there's no reason a read needs to leave this process."""
    since = datetime.now(UTC) - timedelta(days=days)

    page_views = db.execute(
        text("""
            SELECT COUNT(*) FROM analytics_events
            WHERE event_type = 'donation_page_view' AND created_at > :since
        """),
        {"since": since},
    ).scalar()

    rows = db.execute(
        text("""
            SELECT
                meta->>'methodId' AS method_id,
                COALESCE(meta->>'surface', 'unknown') AS surface,
                COUNT(*) FILTER (WHERE event_type = 'donation_number_copied') AS copies,
                COUNT(*) FILTER (WHERE event_type = 'donation_card_swiped')   AS swipes
            FROM analytics_events
            WHERE event_type IN ('donation_number_copied', 'donation_card_swiped')
              AND created_at > :since
              AND meta->>'methodId' IS NOT NULL
            GROUP BY meta->>'methodId', COALESCE(meta->>'surface', 'unknown')
        """),
        {"since": since},
    ).fetchall()

    per_method: dict = {}
    for r in rows:
        entry = per_method.setdefault(r.method_id, {
            "methodId": r.method_id, "copies": 0, "swipes": 0, "bySurface": {},
        })
        entry["copies"] += int(r.copies or 0)
        entry["swipes"] += int(r.swipes or 0)
        entry["bySurface"][r.surface] = {"copies": int(r.copies or 0), "swipes": int(r.swipes or 0)}

    return {"days": days, "pageViews": int(page_views or 0), "methods": list(per_method.values())}


class PaymentMethodCreate(BaseModel):
    bank_name:      str = Field(..., min_length=1)
    account_number: str = Field(..., min_length=1)
    number_type:    str
    holder_name:    str = Field(..., min_length=1)
    currency:       str = Field(..., min_length=1)
    region:         str = Field(..., min_length=1)
    swift:          Optional[str] = None
    note:           Optional[str] = None


@router.post("")
async def create_payment_method(
    body: PaymentMethodCreate,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    await _check_mutation_rate_limit(admin.telegram_id)
    normalized, warnings = _validate_and_normalize(
        body.bank_name, body.account_number, body.number_type, body.holder_name,
        body.currency, body.region, body.swift, body.note,
    )

    max_sort = db.execute(text("SELECT COALESCE(MAX(sort_order), -1) AS m FROM payment_methods")).fetchone()
    sort_order = int(max_sort.m) + 1

    try:
        row = db.execute(
            text("""
                INSERT INTO payment_methods
                    (bank_name, account_number, number_type, holder_name, currency, region,
                     swift, note, sort_order, created_by, updated_by)
                VALUES (:bank_name, :account_number, :number_type, :holder_name, :currency, :region,
                        :swift, :note, :sort_order, :admin, :admin)
                RETURNING id, bank_name, account_number, number_type, holder_name, currency, region,
                          swift, note, sort_order, is_active, created_at, updated_at, created_by, updated_by
            """),
            {**normalized, "sort_order": sort_order, "admin": admin.telegram_id},
        ).fetchone()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Bu hisob raqami allaqachon faol usullar orasida mavjud")

    _write_audit_log(db, str(row.id), "create", admin.telegram_id, None, normalized)
    db.commit()
    invalidate_payment_methods_cache()
    asyncio.create_task(_notify_admins_of_change("yaratildi", admin, None, normalized))

    return {"ok": True, "method": _admin_dict(row), "warnings": warnings}


class PaymentMethodUpdate(BaseModel):
    bank_name:      Optional[str] = None
    account_number: Optional[str] = None
    number_type:    Optional[str] = None
    holder_name:    Optional[str] = None
    currency:       Optional[str] = None
    region:         Optional[str] = None
    swift:          Optional[str] = None
    note:           Optional[str] = None
    is_active:      Optional[bool] = None
    # Explicit confirmation step (Part 4) — required whenever this request
    # changes account_number. A normal PATCH that only touches bank_name/
    # holder_name/etc. never needs it.
    confirm_account_number_change: bool = False


@router.patch("/{method_id}")
async def update_payment_method(
    method_id: str,
    body: PaymentMethodUpdate,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    await _check_mutation_rate_limit(admin.telegram_id)

    existing = db.execute(
        text("""
            SELECT id, bank_name, account_number, number_type, holder_name, currency, region,
                   swift, note, sort_order, is_active, created_at, updated_at, created_by, updated_by
            FROM payment_methods WHERE id = :id
        """),
        {"id": method_id},
    ).fetchone()
    if existing is None:
        raise HTTPException(404, "To'lov usuli topilmadi")

    old_value = _db_dict(existing)

    # Merge: fields not present in the PATCH keep their current value, so
    # validation runs against the FULL resulting record, not just the diff
    # (e.g. changing number_type alone must re-validate the existing
    # account_number against the new type's rules).
    merged_number_type = body.number_type if body.number_type is not None else existing.number_type
    merged_account_number = body.account_number if body.account_number is not None else existing.account_number

    if body.account_number is not None and body.account_number != existing.account_number and not body.confirm_account_number_change:
        raise HTTPException(
            409,
            {
                "code": "account_number_change_requires_confirmation",
                "detail": "Hisob raqamini o'zgartirish tasdiqlashni talab qiladi. Eski va yangi raqamni "
                          "solishtirib ko'ring, so'ng confirm_account_number_change=true bilan qayta yuboring.",
                "old_account_number": existing.account_number,
                "new_account_number": body.account_number,
            },
        )

    normalized, warnings = _validate_and_normalize(
        body.bank_name if body.bank_name is not None else existing.bank_name,
        merged_account_number,
        merged_number_type,
        body.holder_name if body.holder_name is not None else existing.holder_name,
        body.currency if body.currency is not None else existing.currency,
        body.region if body.region is not None else existing.region,
        body.swift if body.swift is not None else existing.swift,
        body.note if body.note is not None else existing.note,
    )
    if body.is_active is not None:
        normalized["is_active"] = body.is_active

    set_clauses = ", ".join(f"{k} = :{k}" for k in normalized) + ", updated_at = NOW(), updated_by = :admin"
    try:
        row = db.execute(
            text(f"""
                UPDATE payment_methods SET {set_clauses}
                WHERE id = :id
                RETURNING id, bank_name, account_number, number_type, holder_name, currency, region,
                          swift, note, sort_order, is_active, created_at, updated_at, created_by, updated_by
            """),
            {**normalized, "id": method_id, "admin": admin.telegram_id},
        ).fetchone()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Bu hisob raqami allaqachon faol usullar orasida mavjud")

    new_value = _db_dict(row)
    _write_audit_log(db, method_id, "update", admin.telegram_id, old_value, new_value)
    db.commit()
    invalidate_payment_methods_cache()
    asyncio.create_task(_notify_admins_of_change("tahrirlandi", admin, old_value, new_value))

    return {"ok": True, "method": _admin_dict(row), "warnings": warnings}


@router.delete("/{method_id}")
async def deactivate_payment_method(
    method_id: str,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """SOFT delete — sets is_active=false. This app never hard-deletes a
    payment method; the row (and its audit history) is kept forever."""
    await _check_mutation_rate_limit(admin.telegram_id)

    existing = db.execute(text("SELECT id, is_active FROM payment_methods WHERE id = :id"), {"id": method_id}).fetchone()
    if existing is None:
        raise HTTPException(404, "To'lov usuli topilmadi")
    if not existing.is_active:
        return {"ok": True, "already_inactive": True}

    db.execute(
        text("UPDATE payment_methods SET is_active = FALSE, updated_at = NOW(), updated_by = :admin WHERE id = :id"),
        {"id": method_id, "admin": admin.telegram_id},
    )
    _write_audit_log(db, method_id, "delete", admin.telegram_id, {"is_active": True}, {"is_active": False})
    db.commit()
    invalidate_payment_methods_cache()
    asyncio.create_task(_notify_admins_of_change("o'chirildi (nofaol)", admin, {"is_active": True}, {"is_active": False}))

    return {"ok": True, "already_inactive": False}


class ReorderRequest(BaseModel):
    ordered_ids: list[str] = Field(..., min_length=1)


@router.post("/reorder")
async def reorder_payment_methods(
    body: ReorderRequest,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    await _check_mutation_rate_limit(admin.telegram_id)

    existing_ids = {
        str(r[0]) for r in db.execute(text("SELECT id FROM payment_methods")).fetchall()
    }
    requested_ids = set(body.ordered_ids)
    if requested_ids != existing_ids:
        raise HTTPException(
            400,
            "ordered_ids ro'yxati barcha mavjud to'lov usullarini aynan bir marta o'z ichiga olishi kerak",
        )

    for position, method_id in enumerate(body.ordered_ids):
        db.execute(
            text("UPDATE payment_methods SET sort_order = :pos, updated_at = NOW(), updated_by = :admin WHERE id = :id"),
            {"pos": position, "id": method_id, "admin": admin.telegram_id},
        )
    _write_audit_log(db, None, "reorder", admin.telegram_id, None, {"ordered_ids": body.ordered_ids})
    db.commit()
    invalidate_payment_methods_cache()

    return {"ok": True}
