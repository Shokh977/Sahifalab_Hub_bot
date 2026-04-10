"""
SAHIFALAB — Unified Payment Service (v2 — Stars removed)

Supports two payment flows:
  1. Click.uz Direct (redirect URL + webhook callbacks)
  2. Payme Direct   (redirect URL + JSON-RPC webhook)

Architecture:
  payment_service.py — this file (business logic, signature verification)
  pay.py             — FastAPI endpoints (init, webhooks, status)
"""
import hashlib
import hmac as hmac_mod
import base64
import json
import uuid
import os
import logging
from datetime import datetime, UTC, timedelta
from typing import Optional
from urllib.parse import urlencode

import httpx

logger = logging.getLogger(__name__)

# ── Environment ──────────────────────────────────────────────────────────────

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Direct Click merchant credentials
CLICK_MERCHANT_ID = os.getenv("CLICK_MERCHANT_ID", "")
CLICK_SERVICE_ID = os.getenv("CLICK_SERVICE_ID", "")
CLICK_SECRET_KEY = os.getenv("CLICK_SECRET_KEY", "")

# Direct Payme merchant credentials
PAYME_MERCHANT_ID = os.getenv("PAYME_MERCHANT_ID", "")
PAYME_MERCHANT_KEY = os.getenv("PAYME_MERCHANT_KEY", "")

# Frontend return URL after payment
PAYMENT_RETURN_URL = os.getenv("PAYMENT_RETURN_URL", "https://sahifalab-hub-bot.vercel.app")

# Order expiry (30 minutes)
ORDER_EXPIRY_MINUTES = 30

# Platform commission: 30% to platform, 70% to teacher
PLATFORM_COMMISSION_RATE = 0.30
TEACHER_SHARE_RATE = 1.0 - PLATFORM_COMMISSION_RATE  # 0.70

# In-memory webhook dedup (bounded). In production use Redis or DB table.
_processed_webhooks: dict[str, datetime] = {}
_MAX_WEBHOOK_CACHE = 10_000


# ── Supabase helpers ─────────────────────────────────────────────────────────

def _sb_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


# ── Webhook replay protection ───────────────────────────────────────────────

def is_webhook_duplicate(provider: str, transaction_id: str) -> bool:
    """
    Check if a webhook has already been processed (in-memory dedup).
    Returns True if duplicate, False if new. Marks as processed.
    
    Bounded cache: evicts oldest entries when exceeding _MAX_WEBHOOK_CACHE.
    For production with multiple workers, use the processed_webhooks DB table instead.
    """
    key = f"{provider}:{transaction_id}"
    if key in _processed_webhooks:
        return True
    
    # Evict old entries if cache is full
    if len(_processed_webhooks) >= _MAX_WEBHOOK_CACHE:
        # Remove oldest 20% of entries
        sorted_keys = sorted(_processed_webhooks.keys(), key=lambda k: _processed_webhooks[k])
        for old_key in sorted_keys[:_MAX_WEBHOOK_CACHE // 5]:
            del _processed_webhooks[old_key]
    
    _processed_webhooks[key] = datetime.now(UTC)
    return False


# ── Order ID generation ─────────────────────────────────────────────────────

def generate_order_id(item_type: str, item_id: int, user_id: int, provider: str) -> str:
    """Generate a unique, descriptive order ID."""
    short = uuid.uuid4().hex[:8]
    return f"pay_{item_type}_{provider}_{item_id}_{user_id}_{short}"


def generate_idempotency_key(item_type: str, item_id: int, user_id: int, provider: str) -> str:
    """
    Generate a deterministic idempotency key for a payment attempt.
    Same user + item + provider within the same minute → same key → dedup.
    """
    minute_bucket = datetime.now(UTC).strftime("%Y%m%d%H%M")
    raw = f"{item_type}:{item_id}:{user_id}:{provider}:{minute_bucket}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


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
    return hmac_mod.compare_digest(expected, sign_string)


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
        return parts[0] == "Paycom" and hmac_mod.compare_digest(parts[1], PAYME_MERCHANT_KEY)
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
    idempotency_key: str = "",
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
        "expires_at": (datetime.now(UTC) + timedelta(minutes=ORDER_EXPIRY_MINUTES)).isoformat(),
    }
    if idempotency_key:
        payload["idempotency_key"] = idempotency_key

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


async def get_payment_by_idempotency_key(key: str) -> Optional[dict]:
    """Fetch a payment record by idempotency_key (for dedup on /init)."""
    if not key:
        return None
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/payments",
            params={
                "idempotency_key": f"eq.{key}",
                "select": "*",
                "order": "created_at.desc",
                "limit": "1",
            },
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


def is_payment_expired(payment: dict) -> bool:
    """Check if a payment record has passed its expiry time."""
    expires = payment.get("expires_at")
    if not expires:
        return False
    try:
        if isinstance(expires, str):
            exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
        else:
            exp_dt = expires
        return datetime.now(UTC) > exp_dt
    except Exception:
        return False


# ── Fulfillment — unlock content after payment ──────────────────────────────

async def fulfill_payment(payment: dict) -> bool:
    """
    After a payment is completed, unlock the purchased content
    and credit the teacher's wallet (if applicable).

    IDEMPOTENT: checks fulfilled_at to prevent double execution.
    """
    order_id = payment.get("order_id", "")

    # ── Double-fulfillment guard ──────────────────────────────────────────
    if payment.get("fulfilled_at"):
        logger.info("[Fulfillment] Already fulfilled: order=%s — skipping", order_id)
        return True

    # Re-fetch from DB to prevent TOCTOU race
    fresh = await get_payment_by_order_id(order_id)
    if fresh and fresh.get("fulfilled_at"):
        logger.info("[Fulfillment] Already fulfilled (re-check): order=%s", order_id)
        return True

    item_type = payment.get("item_type")
    item_id = payment.get("item_id")
    user_id = payment.get("user_id")
    amount = float(payment.get("amount", 0))

    fulfilled = False
    if item_type == "course":
        fulfilled = await _fulfill_course_enrollment(int(item_id), int(user_id))
    elif item_type == "book":
        fulfilled = await _fulfill_book_purchase(int(item_id), int(user_id))

    # Credit teacher wallet with platform commission deducted
    if fulfilled:
        # Mark as fulfilled FIRST to prevent races
        await _mark_fulfilled(order_id)
        try:
            await _credit_teacher_for_sale(item_type, int(item_id), amount, order_id)
        except Exception as e:
            logger.error("[Fulfillment] Teacher wallet credit failed: %s", e)

    return fulfilled


async def _mark_fulfilled(order_id: str):
    """Set fulfilled_at timestamp on the payment record."""
    async with httpx.AsyncClient(timeout=10) as client:
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/payments",
            params={"order_id": f"eq.{order_id}"},
            json={"fulfilled_at": datetime.now(UTC).isoformat()},
            headers=_sb_headers(),
        )


async def _credit_teacher_for_sale(item_type: str, item_id: int, amount: float, order_id: str):
    """Look up the teacher who owns the item, credit their wallet via Supabase RPC.
    
    Teacher receives (amount × TEACHER_SHARE_RATE) — platform keeps PLATFORM_COMMISSION_RATE.
    """
    teacher_id = None
    try:
        table = "courses" if item_type == "course" else "book"
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/{table}",
                params={"id": f"eq.{item_id}", "select": "teacher_id"},
                headers=_sb_headers(),
            )
        rows = res.json() if res.status_code == 200 else []
        if rows and rows[0].get("teacher_id"):
            teacher_id = int(rows[0]["teacher_id"])
    except Exception:
        pass

    if not teacher_id:
        logger.info("[Wallet] No teacher_id found for %s/%s — skipping credit", item_type, item_id)
        return

    # Apply platform commission — teacher gets 70%
    teacher_amount = round(amount * TEACHER_SHARE_RATE, 2)

    # Call the atomic credit_wallet RPC
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/credit_wallet",
            json={
                "p_teacher_id": teacher_id,
                "p_amount": teacher_amount,
                "p_reference": order_id,
                "p_note": f"{item_type}:{item_id} sale (teacher {int(TEACHER_SHARE_RATE*100)}%)",
            },
            headers=_sb_headers(),
        )
    if res.status_code in (200, 201):
        logger.info(
            "[Wallet] Credited teacher %d: %.2f UZS (%.0f%% of %.2f) for %s",
            teacher_id, teacher_amount, TEACHER_SHARE_RATE * 100, amount, order_id,
        )
    else:
        logger.warning("[Wallet] credit_wallet RPC failed: %s", res.text)


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
    """Mark book as purchased in book_purchase table."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Check if a pending book_purchase exists
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
            else:
                # No pending record — create a completed one directly
                await client.post(
                    f"{SUPABASE_URL}/rest/v1/book_purchase",
                    json={
                        "book_id": book_id,
                        "telegram_id": user_id,
                        "status": "completed",
                        "completed_at": datetime.now(UTC).isoformat(),
                    },
                    headers=_sb_headers(),
                )
        logger.info("[Fulfillment] Book purchase completed: book=%d user=%d", book_id, user_id)
        return True
    except Exception as e:
        logger.error("[Fulfillment] Book purchase failed: %s", e)
        return False
