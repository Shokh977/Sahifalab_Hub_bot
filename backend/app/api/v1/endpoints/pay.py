"""
SAHIFALAB — Unified Payment Endpoints (v2.1 — Security Hardened)

Routes:
  POST /api/pay/init               — Initialize payment (Click or Payme)
  POST /api/pay/confirm            — Frontend confirms payment (requires webhook-set 'processing' status)
  GET  /api/pay/{order_id}         — Check payment status
  GET  /api/pay/check-purchase     — Check book ownership (JWT required)
  POST /api/pay/click/prepare      — Click.uz webhook (prepare phase)
  POST /api/pay/click/complete     — Click.uz webhook (complete phase)
  POST /api/pay/payme              — Payme JSON-RPC webhook

Security:
  - All user-facing endpoints require Bearer JWT (no user_id fallback)
  - Click webhooks validated via MD5 signature + hmac.compare_digest
  - Payme webhooks validated via Basic auth + hmac.compare_digest
  - /confirm requires status=processing (must be set by webhook first)
  - Fulfilled_at guard prevents double fulfillment
  - Webhook replay protection via dedup cache
  - Idempotency keys prevent duplicate payment records on rapid clicks
"""
from fastapi import APIRouter, HTTPException, Header, Request, Form
from pydantic import BaseModel
from typing import Optional, Literal
from collections import defaultdict
from datetime import datetime, UTC, timedelta
import asyncio
import logging

from app.services.auth_service import decode_token
from app.services import payment_service as ps

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Per-user rate limit for /init (5 attempts per minute per user) ────────────
_init_history: dict[int, list[datetime]] = defaultdict(list)
_init_lock = asyncio.Lock()
_INIT_MAX_PER_MINUTE = 5


async def _check_init_rate_limit(user_id: int) -> None:
    """Raise 429 if user has already called /init 5+ times in the last 60 seconds."""
    async with _init_lock:
        now = datetime.now(UTC)
        cutoff = now - timedelta(seconds=60)
        history = [t for t in _init_history[user_id] if t > cutoff]
        _init_history[user_id] = history
        if len(history) >= _INIT_MAX_PER_MINUTE:
            raise HTTPException(
                status_code=429,
                detail="Juda ko'p so'rov. 1 daqiqadan so'ng urinib ko'ring.",
            )
        _init_history[user_id].append(now)


# ── Schemas ──────────────────────────────────────────────────────────────────

class InitPaymentRequest(BaseModel):
    item_type: Literal["book", "course"]
    item_id: int
    provider: Literal["click", "payme"]
    return_url: Optional[str] = ""


class ConfirmPaymentRequest(BaseModel):
    order_id: str


# ── Auth helper ──────────────────────────────────────────────────────────────

async def _resolve_caller(authorization: Optional[str]) -> int:
    """Resolve caller ID from Bearer JWT. No fallback — JWT required."""
    if authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0] == "Bearer":
            tid = decode_token(parts[1])
            if tid is not None:
                return tid
    raise HTTPException(status_code=401, detail="Avtorizatsiya talab qilinadi")


# ── Item info helper ─────────────────────────────────────────────────────────

async def _get_item_info(item_type: str, item_id: int) -> dict:
    """Fetch item title and price from Supabase."""
    import httpx, os
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    if item_type == "course":
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{url}/rest/v1/courses",
                params={"id": f"eq.{item_id}", "select": "id,title,price,is_paid"},
                headers=headers,
            )
        rows = res.json() if res.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Course not found")
        c = rows[0]
        return {"title": c.get("title", "Course"), "price": int(float(c.get("price", 0))), "is_paid": c.get("is_paid", False)}

    elif item_type == "book":
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{url}/rest/v1/books",
                params={"id": f"eq.{item_id}", "select": "id,title,price,is_paid"},
                headers=headers,
            )
        rows = res.json() if res.status_code == 200 else []
        if not rows:
            raise HTTPException(status_code=404, detail="Book not found")
        b = rows[0]
        return {"title": b.get("title", "Book"), "price": int(float(b.get("price", 0))), "is_paid": b.get("is_paid", False)}

    raise HTTPException(status_code=400, detail=f"Unknown item_type: {item_type}")


# ══════════════════════════════════════════════════════════════════════════════
# CHECK PURCHASE (book or course ownership)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/check-purchase")
async def check_purchase(
    book_id: int = 0,
    authorization: Optional[str] = Header(None),
):
    """
    Check if the authenticated user has purchased a paid book.
    JWT required — telegram_id extracted from token, not from query params.
    """
    caller_id = await _resolve_caller(authorization)
    if not book_id:
        return {"purchased": False}
    import httpx, os
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{url}/rest/v1/book_purchase",
            params={
                "book_id": f"eq.{book_id}",
                "telegram_id": f"eq.{caller_id}",
                "status": "eq.completed",
                "select": "id",
                "limit": "1",
            },
            headers=headers,
        )
    rows = res.json() if res.status_code == 200 else []
    return {"purchased": len(rows) > 0}


# ══════════════════════════════════════════════════════════════════════════════
# INIT PAYMENT
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/init")
async def init_payment(body: InitPaymentRequest, authorization: Optional[str] = Header(None)):
    """
    Initialize a payment for any item (book or course).
    Returns checkout_url for direct Click/Payme browser redirect.
    JWT required. Uses idempotency key to prevent duplicate records on rapid clicks.
    """
    caller_id = await _resolve_caller(authorization)
    await _check_init_rate_limit(caller_id)
    item = await _get_item_info(body.item_type, body.item_id)

    if not item["is_paid"] or item["price"] <= 0:
        raise HTTPException(status_code=400, detail="Bu mahsulot bepul")

    amount_uzs = item["price"]

    # Generate idempotency key — same user+item+provider within 1 minute = same key
    idemp_key = ps.generate_idempotency_key(body.item_type, body.item_id, caller_id, body.provider)

    # Check for existing pending/processing payment with this idempotency key
    existing = await ps.get_payment_by_idempotency_key(idemp_key)
    if existing and existing.get("status") in ("pending", "processing"):
        # Return the existing checkout URL instead of creating a duplicate
        checkout_url = None
        if existing.get("provider") == "click":
            checkout_url = ps.generate_click_checkout_url(existing["order_id"], int(existing["amount"]), existing.get("return_url", ""))
        elif existing.get("provider") == "payme":
            checkout_url = ps.generate_payme_checkout_url(existing["order_id"], int(existing["amount"]), existing.get("return_url", ""))
        return {
            "order_id": existing["order_id"],
            "checkout_url": checkout_url,
            "amount": int(existing["amount"]),
            "currency": existing.get("currency", "UZS"),
            "provider": existing["provider"],
            "deduplicated": True,
        }

    order_id = ps.generate_order_id(body.item_type, body.item_id, caller_id, body.provider)
    return_url = body.return_url or ps.PAYMENT_RETURN_URL

    # Create payment record with expiry and idempotency key
    await ps.create_payment_record(
        order_id=order_id,
        item_type=body.item_type,
        item_id=body.item_id,
        user_id=caller_id,
        provider=body.provider,
        amount=amount_uzs,
        currency="UZS",
        return_url=return_url,
        idempotency_key=idemp_key,
    )

    # Generate direct checkout URL
    checkout_url = None
    if body.provider == "click":
        checkout_url = ps.generate_click_checkout_url(order_id, amount_uzs, return_url)
    elif body.provider == "payme":
        checkout_url = ps.generate_payme_checkout_url(order_id, amount_uzs, return_url)

    if not checkout_url:
        raise HTTPException(status_code=503, detail="To'lov tizimi sozlanmagan")

    return {
        "order_id": order_id,
        "checkout_url": checkout_url,
        "amount": amount_uzs,
        "currency": "UZS",
        "provider": body.provider,
    }


# ══════════════════════════════════════════════════════════════════════════════
# CONFIRM PAYMENT (called by frontend after openInvoice returns "paid")
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/confirm")
async def confirm_payment(body: ConfirmPaymentRequest, authorization: Optional[str] = Header(None)):
    """
    Called by frontend after Click/Payme redirect back.
    Only completes if webhook already set status to 'processing' or 'completed'.
    This prevents self-confirmation exploits.
    """
    caller_id = await _resolve_caller(authorization)
    payment = await ps.get_payment_by_order_id(body.order_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Buyurtma topilmadi")

    if int(payment.get("user_id", 0)) != caller_id:
        raise HTTPException(status_code=403, detail="Bu sizning to'lovingiz emas")

    if payment.get("status") == "completed":
        return {"status": "completed", "order_id": body.order_id, "already_completed": True}

    # Only allow confirmation if webhook already moved status to 'processing'
    if payment.get("status") not in ("processing", "completed"):
        raise HTTPException(
            status_code=409,
            detail="To'lov hali tasdiqlanmagan. Iltimos, biroz kuting.",
        )

    # Mark as completed
    await ps.update_payment_status(body.order_id, "completed")

    # Unlock content
    fulfilled = await ps.fulfill_payment(payment)
    logger.info("[Pay] Confirmed: order=%s fulfilled=%s", body.order_id, fulfilled)

    return {"status": "completed", "order_id": body.order_id, "fulfilled": fulfilled}


# ══════════════════════════════════════════════════════════════════════════════
# PAYMENT STATUS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{order_id}")
async def get_payment_status(order_id: str, authorization: Optional[str] = Header(None)):
    """Check payment status. Caller must own the payment."""
    caller_id = await _resolve_caller(authorization)
    payment = await ps.get_payment_by_order_id(order_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Buyurtma topilmadi")

    if int(payment.get("user_id", 0)) != caller_id:
        raise HTTPException(status_code=403, detail="Bu sizning to'lovingiz emas")

    return {
        "order_id": payment["order_id"],
        "item_type": payment["item_type"],
        "item_id": payment["item_id"],
        "provider": payment["provider"],
        "amount": payment["amount"],
        "currency": payment["currency"],
        "status": payment["status"],
        "created_at": payment.get("created_at"),
        "completed_at": payment.get("completed_at"),
    }


# ══════════════════════════════════════════════════════════════════════════════
# CLICK.UZ WEBHOOKS
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/click/prepare")
async def click_prepare(
    click_trans_id: int = Form(0),
    service_id: int = Form(0),
    click_paydoc_id: int = Form(0),
    merchant_trans_id: str = Form(""),
    amount: float = Form(0),
    action: int = Form(0),
    error: int = Form(0),
    error_note: str = Form(""),
    sign_time: str = Form(""),
    sign_string: str = Form(""),
):
    """
    Click.uz PREPARE webhook (action=0).
    Called by Click when user initiates payment.
    Validates signature, checks order exists and amount matches.
    Click sends form-encoded POST data.
    """
    logger.info("[Click/Prepare] trans=%s order=%s amount=%s", click_trans_id, merchant_trans_id, amount)

    # Verify signature (timing-safe comparison)
    if not ps.verify_click_signature(
        click_trans_id, service_id, merchant_trans_id, amount, action, sign_time, sign_string
    ):
        return {"error": -1, "error_note": "SIGN CHECK FAILED!"}

    # Webhook replay protection (L1: in-memory, L2: DB)
    if ps.is_webhook_duplicate("click_prepare", str(click_trans_id)):
        logger.warning("[Click/Prepare] Duplicate webhook (L1): trans=%s", click_trans_id)
        payment = await ps.get_payment_by_order_id(merchant_trans_id)
        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_prepare_id": payment.get("id", merchant_trans_id) if payment else merchant_trans_id,
            "error": 0,
            "error_note": "Already processed",
        }
    if await ps.is_webhook_duplicate_db("click_prepare", str(click_trans_id)):
        logger.warning("[Click/Prepare] Duplicate webhook (DB): trans=%s", click_trans_id)
        payment = await ps.get_payment_by_order_id(merchant_trans_id)
        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_prepare_id": payment.get("id", merchant_trans_id) if payment else merchant_trans_id,
            "error": 0,
            "error_note": "Already processed",
        }

    # Find payment
    payment = await ps.get_payment_by_order_id(merchant_trans_id)
    if not payment:
        return {"error": -5, "error_note": "Order not found"}

    if payment["status"] == "completed":
        return {"error": -4, "error_note": "Already paid"}

    if payment["status"] == "cancelled":
        return {"error": -9, "error_note": "Order cancelled"}

    # Check expiry
    if ps.is_payment_expired(payment):
        await ps.update_payment_status(merchant_trans_id, "expired")
        return {"error": -9, "error_note": "Order expired"}

    # Click sends amount in UZS, compare with our stored amount
    expected = float(payment["amount"])
    if abs(expected - amount) > 1:
        return {"error": -2, "error_note": "Incorrect parameter amount"}

    # Mark as processing
    await ps.update_payment_status(
        merchant_trans_id, "processing",
        provider_transaction_id=str(click_trans_id),
        provider_data={"click_trans_id": click_trans_id, "click_paydoc_id": click_paydoc_id},
    )

    return {
        "click_trans_id": click_trans_id,
        "merchant_trans_id": merchant_trans_id,
        "merchant_prepare_id": payment.get("id", merchant_trans_id),
        "error": 0,
        "error_note": "Success",
    }


@router.post("/click/complete")
async def click_complete(
    click_trans_id: int = Form(0),
    service_id: int = Form(0),
    click_paydoc_id: int = Form(0),
    merchant_trans_id: str = Form(""),
    merchant_prepare_id: str = Form(""),
    amount: float = Form(0),
    action: int = Form(1),
    error: int = Form(0),
    error_note: str = Form(""),
    sign_time: str = Form(""),
    sign_string: str = Form(""),
):
    """
    Click.uz COMPLETE webhook (action=1).
    Called by Click after successful payment.
    Validates, marks completed, unlocks content.
    Click sends form-encoded POST data.
    """
    logger.info("[Click/Complete] trans=%s order=%s error=%d", click_trans_id, merchant_trans_id, error)

    # Verify signature (timing-safe comparison)
    if not ps.verify_click_signature(
        click_trans_id, service_id, merchant_trans_id, amount, action, sign_time, sign_string
    ):
        return {"error": -1, "error_note": "SIGN CHECK FAILED!"}

    # Webhook replay protection (L1: in-memory, L2: DB)
    if ps.is_webhook_duplicate("click_complete", str(click_trans_id)):
        logger.warning("[Click/Complete] Duplicate webhook (L1): trans=%s", click_trans_id)
        payment = await ps.get_payment_by_order_id(merchant_trans_id)
        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_confirm_id": payment.get("id", merchant_trans_id) if payment else merchant_trans_id,
            "error": 0,
            "error_note": "Already processed",
        }
    if await ps.is_webhook_duplicate_db("click_complete", str(click_trans_id)):
        logger.warning("[Click/Complete] Duplicate webhook (DB): trans=%s", click_trans_id)
        payment = await ps.get_payment_by_order_id(merchant_trans_id)
        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_confirm_id": payment.get("id", merchant_trans_id) if payment else merchant_trans_id,
            "error": 0,
            "error_note": "Already processed",
        }

    # Find payment
    payment = await ps.get_payment_by_order_id(merchant_trans_id)
    if not payment:
        return {"error": -5, "error_note": "Order not found"}

    if payment["status"] == "completed":
        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_confirm_id": payment.get("id", merchant_trans_id),
            "error": 0,
            "error_note": "Already completed",
        }

    # Click sends error code for failed payments
    if error < 0:
        await ps.update_payment_status(merchant_trans_id, "failed", provider_data={"click_error": error, "click_error_note": error_note})
        return {"error": -9, "error_note": "Transaction cancelled"}

    # Mark completed and fulfill
    await ps.update_payment_status(
        merchant_trans_id, "completed",
        provider_transaction_id=str(click_trans_id),
        provider_data={"click_trans_id": click_trans_id, "click_paydoc_id": click_paydoc_id},
    )

    fulfilled = await ps.fulfill_payment(payment)
    logger.info("[Click] Payment completed: order=%s fulfilled=%s", merchant_trans_id, fulfilled)

    return {
        "click_trans_id": click_trans_id,
        "merchant_trans_id": merchant_trans_id,
        "merchant_confirm_id": payment.get("id", merchant_trans_id),
        "error": 0,
        "error_note": "Success",
    }


# ══════════════════════════════════════════════════════════════════════════════
# PAYME JSON-RPC WEBHOOK
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/payme")
async def payme_webhook(request: Request):
    """
    Payme.uz Merchant API endpoint (JSON-RPC 2.0).
    Handles: CheckPerformTransaction, CreateTransaction,
             PerformTransaction, CancelTransaction, CheckTransaction
    """
    # Verify Basic auth
    auth_header = request.headers.get("Authorization", "")
    if not ps.verify_payme_auth(auth_header):
        return _payme_error(-32504, "Auth failed", None)

    try:
        body = await request.json()
    except Exception:
        return _payme_error(-32700, "Parse error", None)

    rpc_id = body.get("id")
    method = body.get("method", "")
    params = body.get("params", {})

    logger.info("[Payme] method=%s params=%s", method, params)

    handlers = {
        "CheckPerformTransaction": _payme_check_perform,
        "CreateTransaction": _payme_create,
        "PerformTransaction": _payme_perform,
        "CancelTransaction": _payme_cancel,
        "CheckTransaction": _payme_check,
    }

    handler = handlers.get(method)
    if not handler:
        return _payme_error(-32601, f"Method not found: {method}", rpc_id)

    result = await handler(params)
    if "error" in result:
        return {"jsonrpc": "2.0", "id": rpc_id, "error": result["error"]}
    return {"jsonrpc": "2.0", "id": rpc_id, "result": result}


def _payme_error(code: int, message: str, rpc_id):
    return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": code, "message": message}}


async def _payme_check_perform(params: dict) -> dict:
    """Check if we can accept payment for this order."""
    order_id = params.get("account", {}).get("order_id", "")
    amount = params.get("amount", 0)

    payment = await ps.get_payment_by_order_id(order_id)
    if not payment:
        return {"error": {"code": -31050, "message": {"uz": "Buyurtma topilmadi", "ru": "Заказ не найден", "en": "Order not found"}}}

    if payment["status"] == "completed":
        return {"error": {"code": -31051, "message": {"uz": "Buyurtma allaqachon to'langan", "ru": "Заказ уже оплачен", "en": "Order already paid"}}}

    if payment["status"] == "cancelled":
        return {"error": {"code": -31099, "message": {"uz": "Buyurtma bekor qilingan", "ru": "Заказ отменен", "en": "Order cancelled"}}}

    # Payme sends amount in tiyins; our UZS payments store amount in UZS
    expected_tiyins = float(payment["amount"]) * 100
    if abs(expected_tiyins - amount) > 1:
        return {"error": {"code": -31001, "message": {"uz": "Noto'g'ri summa", "ru": "Неверная сумма", "en": "Incorrect amount"}}}

    return {"allow": True}


async def _payme_create(params: dict) -> dict:
    """Create transaction in Payme's terminology (we mark as processing)."""
    order_id = params.get("account", {}).get("order_id", "")
    payme_id = params.get("id", "")
    amount = params.get("amount", 0)
    time_ms = params.get("time", 0)

    payment = await ps.get_payment_by_order_id(order_id)
    if not payment:
        return {"error": {"code": -31050, "message": {"uz": "Buyurtma topilmadi", "en": "Order not found"}}}

    if payment["status"] == "completed":
        return {"error": {"code": -31051, "message": {"uz": "Allaqachon to'langan", "en": "Already paid"}}}

    # Validate amount matches stored payment (Payme sends tiyins)
    expected_tiyins = float(payment["amount"]) * 100
    if abs(expected_tiyins - amount) > 1:
        return {"error": {"code": -31001, "message": {"uz": "Noto'g'ri summa", "ru": "Неверная сумма", "en": "Incorrect amount"}}}

    # Webhook replay protection (L1: in-memory, L2: DB)
    if ps.is_webhook_duplicate("payme_create", payme_id):
        logger.warning("[Payme/Create] Duplicate webhook (L1): payme_id=%s", payme_id)
        return {
            "create_time": time_ms,
            "transaction": str(payment.get("id", order_id)),
            "state": 1,
        }
    if await ps.is_webhook_duplicate_db("payme_create", payme_id):
        logger.warning("[Payme/Create] Duplicate webhook (DB): payme_id=%s", payme_id)
        return {
            "create_time": time_ms,
            "transaction": str(payment.get("id", order_id)),
            "state": 1,
        }

    # Mark as processing
    await ps.update_payment_status(
        order_id, "processing",
        provider_transaction_id=payme_id,
        provider_data={"payme_id": payme_id, "payme_time": time_ms},
    )

    return {
        "create_time": time_ms,
        "transaction": str(payment.get("id", order_id)),
        "state": 1,
    }


async def _payme_perform(params: dict) -> dict:
    """Perform (complete) the transaction."""
    payme_id = params.get("id", "")

    # Find by provider_transaction_id
    import httpx, os
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{url}/rest/v1/payments",
            params={
                "provider_transaction_id": f"eq.{payme_id}",
                "select": "*",
                "limit": "1",
            },
            headers=ps._sb_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    if not rows:
        return {"error": {"code": -31003, "message": {"uz": "Tranzaksiya topilmadi", "en": "Transaction not found"}}}

    payment = rows[0]
    order_id = payment["order_id"]

    if payment["status"] == "completed":
        return {
            "transaction": str(payment.get("id", order_id)),
            "perform_time": int(datetime_to_ms(payment.get("completed_at"))),
            "state": 2,
        }

    # Complete + fulfill (idempotent via fulfilled_at guard)
    from datetime import datetime, UTC
    now = datetime.now(UTC)
    await ps.update_payment_status(order_id, "completed", provider_transaction_id=payme_id)
    fulfilled = await ps.fulfill_payment(payment)
    logger.info("[Payme] Performed: order=%s fulfilled=%s", order_id, fulfilled)

    return {
        "transaction": str(payment.get("id", order_id)),
        "perform_time": int(now.timestamp() * 1000),
        "state": 2,
    }


async def _payme_cancel(params: dict) -> dict:
    """Cancel a transaction. If it was completed, reverse fulfillment."""
    payme_id = params.get("id", "")
    reason = params.get("reason", 0)

    import httpx, os
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{url}/rest/v1/payments",
            params={
                "provider_transaction_id": f"eq.{payme_id}",
                "select": "*",
                "limit": "1",
            },
            headers=ps._sb_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    if not rows:
        return {"error": {"code": -31003, "message": {"uz": "Tranzaksiya topilmadi", "en": "Transaction not found"}}}

    payment = rows[0]
    order_id = payment["order_id"]
    was_completed = payment["status"] == "completed"

    # If payment was already fulfilled, attempt to reverse
    if was_completed and payment.get("fulfilled_at"):
        try:
            await _reverse_fulfillment(payment)
            logger.info("[Payme/Cancel] Reversed fulfillment for order=%s", order_id)
        except Exception as e:
            logger.error("[Payme/Cancel] Failed to reverse fulfillment: %s", e)

    await ps.update_payment_status(order_id, "cancelled", provider_data={"cancel_reason": reason})

    from datetime import datetime, UTC
    return {
        "transaction": str(payment.get("id", order_id)),
        "cancel_time": int(datetime.now(UTC).timestamp() * 1000),
        "state": -1 if not was_completed else -2,
    }


async def _reverse_fulfillment(payment: dict):
    """
    Best-effort reversal of a completed payment's fulfillment:
    - Deactivate course enrollment or book purchase
    - Debit teacher wallet by the teacher's share amount
    """
    import httpx, os
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    item_type = payment.get("item_type")
    item_id = payment.get("item_id")
    user_id = payment.get("user_id")
    order_id = payment.get("order_id", "")
    amount = float(payment.get("amount", 0))

    if item_type == "course":
        # Deactivate enrollment
        async with httpx.AsyncClient(timeout=10) as client:
            await client.patch(
                f"{url}/rest/v1/course_enrollments",
                params={
                    "course_id": f"eq.{item_id}",
                    "student_id": f"eq.{user_id}",
                },
                json={"is_active": False},
                headers=ps._sb_headers(),
            )
    elif item_type == "book":
        # Mark purchase as cancelled
        async with httpx.AsyncClient(timeout=10) as client:
            await client.patch(
                f"{url}/rest/v1/book_purchase",
                params={
                    "book_id": f"eq.{item_id}",
                    "telegram_id": f"eq.{user_id}",
                    "status": "eq.completed",
                },
                json={"status": "refunded"},
                headers=ps._sb_headers(),
            )

    # Reverse teacher wallet credit (teacher share only)
    teacher_amount = round(amount * ps.TEACHER_SHARE_RATE, 2)
    try:
        table = "courses" if item_type == "course" else "book"
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{url}/rest/v1/{table}",
                params={"id": f"eq.{item_id}", "select": "teacher_id"},
                headers=ps._sb_headers(),
            )
        rows = res.json() if res.status_code == 200 else []
        if rows and rows[0].get("teacher_id"):
            teacher_id = int(rows[0]["teacher_id"])
            # Use dedicated refund_wallet RPC (safe reversal, guards against negative balance)
            async with httpx.AsyncClient(timeout=10) as client:
                refund_res = await client.post(
                    f"{url}/rest/v1/rpc/refund_wallet",
                    json={
                        "p_teacher_id": teacher_id,
                        "p_amount": teacher_amount,
                        "p_reference": f"refund:{order_id}",
                        "p_note": f"Refund for cancelled {item_type}:{item_id}",
                    },
                    headers=ps._sb_headers(),
                )
            if refund_res.status_code not in (200, 204):
                raise RuntimeError(f"refund_wallet returned {refund_res.status_code}: {refund_res.text}")
    except Exception as e:
        logger.error("[Cancel] Failed to reverse teacher credit: %s", e)
        raise


async def _payme_check(params: dict) -> dict:
    """Check transaction status."""
    payme_id = params.get("id", "")

    import httpx, os
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{url}/rest/v1/payments",
            params={
                "provider_transaction_id": f"eq.{payme_id}",
                "select": "*",
                "limit": "1",
            },
            headers=ps._sb_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    if not rows:
        return {"error": {"code": -31003, "message": {"uz": "Tranzaksiya topilmadi", "en": "Transaction not found"}}}

    payment = rows[0]
    state_map = {"pending": 0, "processing": 1, "completed": 2, "cancelled": -1, "failed": -1}
    state = state_map.get(payment["status"], 0)

    return {
        "create_time": payment.get("provider_data", {}).get("payme_time", 0) if isinstance(payment.get("provider_data"), dict) else 0,
        "perform_time": int(datetime_to_ms(payment.get("completed_at"))) if payment.get("completed_at") else 0,
        "cancel_time": 0,
        "transaction": str(payment.get("id", payment["order_id"])),
        "state": state,
        "reason": None,
    }


def datetime_to_ms(dt_str) -> int:
    """Convert ISO datetime string to milliseconds timestamp."""
    if not dt_str:
        return 0
    try:
        from datetime import datetime
        if isinstance(dt_str, str):
            dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        else:
            dt = dt_str
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0
