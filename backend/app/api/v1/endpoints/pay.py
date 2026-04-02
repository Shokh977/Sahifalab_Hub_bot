"""
SAHIFALAB — Unified Payment Endpoints

Routes:
  POST /api/pay/init               — Initialize payment (any item type + provider)
  POST /api/pay/confirm            — Frontend confirms payment (after invoice callback)
  GET  /api/pay/{order_id}         — Check payment status
  POST /api/pay/click/prepare      — Click.uz webhook (prepare phase)
  POST /api/pay/click/complete     — Click.uz webhook (complete phase)
  POST /api/pay/payme              — Payme JSON-RPC webhook

Security:
  - Click webhooks validated via MD5 signature
  - Payme webhooks validated via Basic auth
  - Frontend confirm requires valid Bearer JWT
  - All callbacks are idempotent
"""
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
from typing import Optional, Literal
import logging

from app.services.auth_service import decode_token
from app.services import payment_service as ps

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────

class InitPaymentRequest(BaseModel):
    item_type: Literal["book", "course"]
    item_id: int
    provider: Literal["telegram_stars", "click", "payme"]
    return_url: Optional[str] = ""


class ConfirmPaymentRequest(BaseModel):
    order_id: str


# ── Auth helper ──────────────────────────────────────────────────────────────

async def _resolve_caller(authorization: Optional[str]) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    tid = decode_token(parts[1])
    if tid is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return tid


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
                f"{url}/rest/v1/book",
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
# INIT PAYMENT
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/init")
async def init_payment(body: InitPaymentRequest, authorization: Optional[str] = Header(None)):
    """
    Initialize a payment for any item (book or course).
    Returns:
      - invoice_url   → for Telegram openInvoice / browser redirect
      - checkout_url  → direct Click/Payme URL (for non-Telegram users)
      - order_id      → for status polling + confirmation
    """
    caller_id = await _resolve_caller(authorization)
    item = await _get_item_info(body.item_type, body.item_id)

    if not item["is_paid"] or item["price"] <= 0:
        raise HTTPException(status_code=400, detail="This item is free")

    amount_uzs = item["price"]
    order_id = ps.generate_order_id(body.item_type, body.item_id, caller_id, body.provider)
    return_url = body.return_url or ps.PAYMENT_RETURN_URL

    # Determine display currency + amount for the payment record
    if body.provider == "telegram_stars":
        currency = "XTR"
        record_amount = max(1, int(amount_uzs / ps.STARS_RATE))
    else:
        currency = "UZS"
        record_amount = amount_uzs

    # Create payment record (idempotent — unique order_id)
    await ps.create_payment_record(
        order_id=order_id,
        item_type=body.item_type,
        item_id=body.item_id,
        user_id=caller_id,
        provider=body.provider,
        amount=record_amount,
        currency=currency,
        return_url=return_url,
    )

    # Generate Telegram invoice URL (works for all providers inside Telegram)
    invoice_url = None
    try:
        emoji = "📕" if body.item_type == "book" else "🎓"
        invoice_url = await ps.create_telegram_invoice(
            title=f"{emoji} {item['title']}",
            description=f"SAHIFALAB {body.item_type} sotib olish",
            order_id=order_id,
            provider=body.provider,
            amount_uzs=amount_uzs,
        )
    except Exception as e:
        logger.warning("[Pay] Telegram invoice failed: %s", e)

    # Generate direct checkout URL (for non-Telegram/browser users)
    checkout_url = None
    if body.provider == "click":
        checkout_url = ps.generate_click_checkout_url(order_id, amount_uzs, return_url)
    elif body.provider == "payme":
        checkout_url = ps.generate_payme_checkout_url(order_id, amount_uzs, return_url)

    return {
        "order_id": order_id,
        "invoice_url": invoice_url,
        "checkout_url": checkout_url,
        "amount": record_amount,
        "currency": currency,
        "price_uzs": amount_uzs,
        "provider": body.provider,
    }


# ══════════════════════════════════════════════════════════════════════════════
# CONFIRM PAYMENT (called by frontend after openInvoice returns "paid")
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/confirm")
async def confirm_payment(body: ConfirmPaymentRequest, authorization: Optional[str] = Header(None)):
    """
    Called by frontend when Telegram openInvoice callback returns "paid".
    Marks payment completed and unlocks content.
    """
    caller_id = await _resolve_caller(authorization)
    payment = await ps.get_payment_by_order_id(body.order_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if int(payment.get("user_id", 0)) != caller_id:
        raise HTTPException(status_code=403, detail="Not your payment")

    if payment.get("status") == "completed":
        return {"status": "completed", "order_id": body.order_id, "already_completed": True}

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
    """Check payment status. Caller must own the payment or be admin."""
    caller_id = await _resolve_caller(authorization)
    payment = await ps.get_payment_by_order_id(order_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if int(payment.get("user_id", 0)) != caller_id:
        raise HTTPException(status_code=403, detail="Not your payment")

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
    click_trans_id: int = 0,
    service_id: int = 0,
    click_paydoc_id: int = 0,
    merchant_trans_id: str = "",
    amount: float = 0,
    action: int = 0,
    error: int = 0,
    error_note: str = "",
    sign_time: str = "",
    sign_string: str = "",
):
    """
    Click.uz PREPARE webhook (action=0).
    Called by Click when user initiates payment.
    Validates signature, checks order exists and amount matches.
    """
    logger.info("[Click/Prepare] trans=%s order=%s amount=%s", click_trans_id, merchant_trans_id, amount)

    # Verify signature
    if not ps.verify_click_signature(
        click_trans_id, service_id, merchant_trans_id, amount, action, sign_time, sign_string
    ):
        return {"error": -1, "error_note": "SIGN CHECK FAILED!"}

    # Find payment
    payment = await ps.get_payment_by_order_id(merchant_trans_id)
    if not payment:
        return {"error": -5, "error_note": "Order not found"}

    if payment["status"] == "completed":
        return {"error": -4, "error_note": "Already paid"}

    if payment["status"] == "cancelled":
        return {"error": -9, "error_note": "Order cancelled"}

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
    click_trans_id: int = 0,
    service_id: int = 0,
    click_paydoc_id: int = 0,
    merchant_trans_id: str = "",
    merchant_prepare_id: str = "",
    amount: float = 0,
    action: int = 1,
    error: int = 0,
    error_note: str = "",
    sign_time: str = "",
    sign_string: str = "",
):
    """
    Click.uz COMPLETE webhook (action=1).
    Called by Click after successful payment.
    Validates, marks completed, unlocks content.
    """
    logger.info("[Click/Complete] trans=%s order=%s error=%d", click_trans_id, merchant_trans_id, error)

    # Verify signature
    if not ps.verify_click_signature(
        click_trans_id, service_id, merchant_trans_id, amount, action, sign_time, sign_string
    ):
        return {"error": -1, "error_note": "SIGN CHECK FAILED!"}

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

    # Complete + fulfill
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
    """Cancel a transaction."""
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

    await ps.update_payment_status(order_id, "cancelled", provider_data={"cancel_reason": reason})

    from datetime import datetime, UTC
    return {
        "transaction": str(payment.get("id", order_id)),
        "cancel_time": int(datetime.now(UTC).timestamp() * 1000),
        "state": -1 if payment["status"] != "completed" else -2,
    }


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
