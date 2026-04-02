"""
SAHIFALAB — Unified Payment Service

Supports three payment flows:
  1. Telegram Bot API (createInvoiceLink → WebApp.openInvoice)
     Works for Stars, Click, Payme INSIDE Telegram Mini App
  2. Click.uz Direct (redirect URL + webhook callbacks)
  3. Payme Direct (redirect URL + JSON-RPC webhook)

Architecture:
  payment_service.py — this file (business logic, signature verification)
  pay.py             — FastAPI endpoints (init, webhooks, status)
  enrollments.py     — extended to support Click/Payme via Telegram flow
"""
import hashlib
import base64
import json
import uuid
import os
import logging
from datetime import datetime, UTC
from typing import Optional, Tuple
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

# ── Environment ──────────────────────────────────────────────────────────────

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

# Telegram BotFather provider tokens (for createInvoiceLink)
CLICK_PROVIDER_TOKEN = os.getenv("CLICK_PROVIDER_TOKEN", "")
PAYME_PROVIDER_TOKEN = os.getenv("PAYME_PROVIDER_TOKEN", "")

# Direct Click merchant credentials
CLICK_MERCHANT_ID = os.getenv("CLICK_MERCHANT_ID", "")
CLICK_SERVICE_ID = os.getenv("CLICK_SERVICE_ID", "")
CLICK_SECRET_KEY = os.getenv("CLICK_SECRET_KEY", "")

# Direct Payme merchant credentials
PAYME_MERCHANT_ID = os.getenv("PAYME_MERCHANT_ID", "")
PAYME_MERCHANT_KEY = os.getenv("PAYME_MERCHANT_KEY", "")

# Frontend return URL after payment
PAYMENT_RETURN_URL = os.getenv("PAYMENT_RETURN_URL", "https://sahifalab-hub-bot.vercel.app")

STARS_RATE = 250  # 1 Telegram Star ≈ 250 UZS


# ── Supabase helpers ─────────────────────────────────────────────────────────

def _sb_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


# ── Order ID generation ─────────────────────────────────────────────────────

def generate_order_id(item_type: str, item_id: int, user_id: int, provider: str) -> str:
    """Generate a unique, descriptive order ID."""
    short = uuid.uuid4().hex[:8]
    return f"pay_{item_type}_{provider}_{item_id}_{user_id}_{short}"


# ── Telegram Bot API invoice ─────────────────────────────────────────────────

def resolve_telegram_provider(provider: str, amount_uzs: int) -> Tuple[str, str, int]:
    """
    Return (provider_token, currency, invoice_amount) for Telegram createInvoiceLink.
    Click/Payme amounts are in tiyins (UZS × 100).
    Stars amount is price / STARS_RATE.
    """
    if provider == "click":
        return CLICK_PROVIDER_TOKEN, "UZS", amount_uzs * 100
    elif provider == "payme":
        return PAYME_PROVIDER_TOKEN, "UZS", amount_uzs * 100
    else:  # telegram_stars
        stars = max(1, int(amount_uzs / STARS_RATE))
        return "", "XTR", stars


async def create_telegram_invoice(
    title: str,
    description: str,
    order_id: str,
    provider: str,
    amount_uzs: int,
) -> str:
    """
    Call Telegram Bot API createInvoiceLink and return the invoice URL.
    Raises RuntimeError on failure.
    """
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")

    provider_token, currency, invoice_amount = resolve_telegram_provider(provider, amount_uzs)

    provider_labels = {
        "telegram_stars": "⭐ Stars",
        "click": "🟢 Click",
        "payme": "💙 Payme",
    }

    payload = {
        "title": title,
        "description": f"SAHIFALAB to'lov ({provider_labels.get(provider, provider)})",
        "payload": order_id,
        "provider_token": provider_token,
        "currency": currency,
        "prices": [{"label": title, "amount": invoice_amount}],
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/createInvoiceLink",
            json=payload,
        )
        data = resp.json()
        logger.info("[PaymentService] createInvoiceLink: %s", data)
        if not data.get("ok"):
            raise RuntimeError(f"Telegram: {data.get('description', 'Unknown error')}")
        return data["result"]


# ── Direct Click URL ─────────────────────────────────────────────────────────

def generate_click_checkout_url(order_id: str, amount_uzs: int, return_url: str = "") -> Optional[str]:
    """
    Generate a Click.uz checkout URL for direct browser payment.
    Requires CLICK_MERCHANT_ID and CLICK_SERVICE_ID.
    """
    if not CLICK_MERCHANT_ID or not CLICK_SERVICE_ID:
        return None

    params = {
        "service_id": CLICK_SERVICE_ID,
        "merchant_id": CLICK_MERCHANT_ID,
        "amount": str(amount_uzs),
        "transaction_param": order_id,
    }
    if return_url:
        params["return_url"] = return_url

    return f"https://my.click.uz/services/pay?{urlencode(params)}"


# ── Direct Payme URL ─────────────────────────────────────────────────────────

def generate_payme_checkout_url(order_id: str, amount_uzs: int, return_url: str = "") -> Optional[str]:
    """
    Generate a Payme checkout URL for direct browser payment.
    Requires PAYME_MERCHANT_ID.
    Amount is in tiyins (UZS × 100).
    """
    if not PAYME_MERCHANT_ID:
        return None

    # Payme checkout uses base64-encoded params
    checkout_data = {
        "m": PAYME_MERCHANT_ID,
        "ac": {"order_id": order_id},
        "a": amount_uzs * 100,  # tiyins
    }
    if return_url:
        checkout_data["c"] = return_url

    encoded = base64.b64encode(json.dumps(checkout_data).encode()).decode()
    return f"https://checkout.paycom.uz/{encoded}"


# ── Click signature verification ─────────────────────────────────────────────

def verify_click_signature(
    click_trans_id: int,
    service_id: int,
    merchant_trans_id: str,
    amount: float,
    action: int,
    sign_time: str,
    sign_string: str,
) -> bool:
    """
    Verify Click.uz webhook callback signature.
    sign = MD5(click_trans_id + service_id + SECRET_KEY + merchant_trans_id + amount + action + sign_time)
    """
    if not CLICK_SECRET_KEY:
        logger.warning("[Click] SECRET_KEY not configured — skipping verification")
        return False

    raw = f"{click_trans_id}{service_id}{CLICK_SECRET_KEY}{merchant_trans_id}{amount}{action}{sign_time}"
    expected = hashlib.md5(raw.encode()).hexdigest()
    return expected == sign_string


# ── Payme auth verification ──────────────────────────────────────────────────

def verify_payme_auth(authorization: str) -> bool:
    """
    Verify Payme JSON-RPC Basic auth header.
    Format: Basic base64(Paycom:{PAYME_MERCHANT_KEY})
    """
    if not PAYME_MERCHANT_KEY:
        logger.warning("[Payme] MERCHANT_KEY not configured — skipping verification")
        return False

    if not authorization.startswith("Basic "):
        return False

    try:
        decoded = base64.b64decode(authorization[6:]).decode()
        # Format: Paycom:KEY
        parts = decoded.split(":", 1)
        if len(parts) != 2:
            return False
        return parts[0] == "Paycom" and parts[1] == PAYME_MERCHANT_KEY
    except Exception:
        return False


# ── Payment record management (Supabase) ─────────────────────────────────────

async def create_payment_record(
    order_id: str,
    item_type: str,
    item_id: int,
    user_id: int,
    provider: str,
    amount: float,
    currency: str = "UZS",
    return_url: str = "",
) -> dict:
    """Insert a new payment record into the payments table."""
    payload = {
        "order_id": order_id,
        "item_type": item_type,
        "item_id": item_id,
        "user_id": user_id,
        "provider": provider,
        "amount": amount,
        "currency": currency,
        "status": "pending",
        "return_url": return_url,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/payments",
            json=payload,
            headers=_sb_headers(),
        )
    if res.status_code not in (200, 201):
        raise RuntimeError(f"Failed to create payment: {res.text}")
    rows = res.json()
    return rows[0] if isinstance(rows, list) and rows else payload


async def get_payment_by_order_id(order_id: str) -> Optional[dict]:
    """Fetch a payment record by order_id."""
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/payments",
            params={"order_id": f"eq.{order_id}", "select": "*", "limit": "1"},
            headers=_sb_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    return rows[0] if rows else None


async def update_payment_status(
    order_id: str,
    status: str,
    provider_transaction_id: str = "",
    provider_data: dict = None,
) -> bool:
    """Update payment status. Returns True on success."""
    patch: dict = {"status": status}
    if provider_transaction_id:
        patch["provider_transaction_id"] = provider_transaction_id
    if provider_data:
        patch["provider_data"] = json.dumps(provider_data)
    if status == "completed":
        patch["completed_at"] = datetime.now(UTC).isoformat()

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.patch(
            f"{SUPABASE_URL}/rest/v1/payments",
            params={"order_id": f"eq.{order_id}"},
            json=patch,
            headers=_sb_headers(),
        )
    return res.status_code in (200, 201, 204)


# ── Fulfillment — unlock content after payment ──────────────────────────────

async def fulfill_payment(payment: dict) -> bool:
    """
    After a payment is completed, unlock the purchased content.
    For books: mark BookPurchase as completed (if exists) or handled by existing flow.
    For courses: create course_enrollment.
    """
    item_type = payment.get("item_type")
    item_id = payment.get("item_id")
    user_id = payment.get("user_id")

    if item_type == "course":
        return await _fulfill_course_enrollment(int(item_id), int(user_id))
    elif item_type == "book":
        return await _fulfill_book_purchase(int(item_id), int(user_id))
    return False


async def _fulfill_course_enrollment(course_id: int, student_id: int) -> bool:
    """Create or reactivate enrollment for the student."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{SUPABASE_URL}/rest/v1/course_enrollments",
                params={"on_conflict": "course_id,student_id"},
                json={
                    "course_id": course_id,
                    "student_id": student_id,
                    "is_active": True,
                },
                headers={**_sb_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
            )

        # Sync enrolled_count on the course
        async with httpx.AsyncClient(timeout=10) as client:
            cnt = await client.get(
                f"{SUPABASE_URL}/rest/v1/course_enrollments",
                params={
                    "course_id": f"eq.{course_id}",
                    "is_active": "eq.true",
                    "select": "id",
                },
                headers={**_sb_headers(), "Prefer": "count=exact"},
            )
            total = int(cnt.headers.get("content-range", "0/0").split("/")[-1] or 0)
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/courses",
                params={"id": f"eq.{course_id}"},
                json={"enrolled_count": total},
                headers=_sb_headers(),
            )

        logger.info("[Fulfillment] Course enrollment created: course=%d student=%d", course_id, student_id)
        return True
    except Exception as e:
        logger.error("[Fulfillment] Course enrollment failed: %s", e)
        return False


async def _fulfill_book_purchase(book_id: int, user_id: int) -> bool:
    """Mark book as purchased in book_purchase table (if managed via SQLAlchemy, skip)."""
    # Book purchases go through the existing payments.py flow with SQLAlchemy.
    # This is a fallback for direct Click/Payme webhook fulfillment.
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Check if a pending book_purchase exists with matching book_id + telegram_id
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/book_purchase",
                params={
                    "book_id": f"eq.{book_id}",
                    "telegram_id": f"eq.{user_id}",
                    "status": "eq.pending",
                    "select": "id",
                    "limit": "1",
                },
                headers=_sb_headers(),
            )
            rows = res.json() if res.status_code == 200 else []
            if rows:
                await client.patch(
                    f"{SUPABASE_URL}/rest/v1/book_purchase",
                    params={"id": f"eq.{rows[0]['id']}"},
                    json={"status": "completed", "completed_at": datetime.now(UTC).isoformat()},
                    headers=_sb_headers(),
                )
        logger.info("[Fulfillment] Book purchase completed: book=%d user=%d", book_id, user_id)
        return True
    except Exception as e:
        logger.error("[Fulfillment] Book purchase failed: %s", e)
        return False
