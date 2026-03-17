"""
SAHIFALAB — Payment System (WebApp.openInvoice flow)

All three providers (Telegram Stars, Click, Payme) use createInvoiceLink
from the Telegram Bot API so the Mini App can call WebApp.openInvoice().

Flow:
  1. Frontend calls POST /create-invoice-link  (provider, book_id, telegram_id)
  2. Backend creates DB order + calls Telegram Bot API createInvoiceLink
  3. Returns { order_id, invoice_url }
  4. Frontend calls  window.Telegram.WebApp.openInvoice(invoice_url, callback)
  5. Telegram shows native payment form inside the mini app
  6. Bot receives pre_checkout_query → approves
  7. Bot receives successful_payment → calls POST /complete-order
  8. Frontend callback fires with status "paid" → done
  9. Frontend also polls GET /order/{order_id} as a safety net
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Book, BookPurchase
from app.core.config import settings
from datetime import datetime
from pydantic import BaseModel
from typing import Literal
import uuid
import httpx
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Helpers ──────────────────────────────────────────────────────────────────

STARS_RATE = 250  # 1 Star ≈ 250 UZS (adjustable)


def _generate_order_id(provider: str, book_id: int, telegram_id: int) -> str:
    return f"{provider}_{book_id}_{telegram_id}_{uuid.uuid4().hex[:8]}"


def _get_book_or_404(book_id: int, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Kitob topilmadi")
    if not book.is_paid or book.price <= 0:
        raise HTTPException(status_code=400, detail="Bu kitob pullik emas")
    return book


def _resolve_provider(provider: str, amount_uzs: int):
    """Return (provider_token, currency, invoice_amount) for the given provider."""
    if provider == "click":
        return settings.CLICK_PROVIDER_TOKEN, "UZS", amount_uzs * 100
    elif provider == "payme":
        return settings.PAYME_PROVIDER_TOKEN, "UZS", amount_uzs * 100
    else:
        # Telegram Stars
        stars = max(1, int(amount_uzs / STARS_RATE))
        return "", "XTR", stars


# ── Check if user already purchased a book ──────────────────────────────────

@router.get("/check-purchase")
async def check_purchase(
    book_id: int = Query(...),
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Return whether user already owns this book."""
    purchase = (
        db.query(BookPurchase)
        .filter(
            BookPurchase.book_id == book_id,
            BookPurchase.telegram_id == telegram_id,
            BookPurchase.status == "completed",
        )
        .first()
    )
    return {"purchased": purchase is not None}


# ── Universal create-order ──────────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    book_id: int
    telegram_id: int
    provider: Literal["telegram_stars", "click", "payme"]


@router.post("/create-order")
async def create_order(body: CreateOrderRequest, db: Session = Depends(get_db)):
    """
    Create a pending payment order for any provider.
    (Legacy — kept for backward compat. Prefer /create-invoice-link.)
    """
    book = _get_book_or_404(body.book_id, db)

    # Check if already purchased
    existing = (
        db.query(BookPurchase)
        .filter(
            BookPurchase.book_id == body.book_id,
            BookPurchase.telegram_id == body.telegram_id,
            BookPurchase.status == "completed",
        )
        .first()
    )
    if existing:
        return {"already_purchased": True, "order_id": existing.order_id}

    # Determine amount & currency
    if body.provider == "telegram_stars":
        amount = max(1, int(book.price / STARS_RATE))
        currency = "XTR"
    else:
        # Click / Payme — amount in UZS (bot will convert to tiyins × 100 for invoice)
        amount = int(book.price)
        currency = "UZS"

    order_id = _generate_order_id(body.provider, body.book_id, body.telegram_id)

    purchase = BookPurchase(
        book_id=body.book_id,
        telegram_id=body.telegram_id,
        provider=body.provider,
        order_id=order_id,
        amount=amount,
        currency=currency,
        status="pending",
    )
    db.add(purchase)
    db.commit()

    return {
        "order_id": order_id,
        "amount": amount,
        "currency": currency,
        "book_title": book.title,
        "already_purchased": False,
    }


# ── Create invoice link (for WebApp.openInvoice) ───────────────────────────

@router.post("/create-invoice-link")
async def create_invoice_link(body: CreateOrderRequest, db: Session = Depends(get_db)):
    """
    Create a pending order AND a Telegram invoice link via Bot API.
    The frontend calls  WebApp.openInvoice(invoice_url)  with the returned URL.
    """
    book = _get_book_or_404(body.book_id, db)

    # Already purchased?
    existing = (
        db.query(BookPurchase)
        .filter(
            BookPurchase.book_id == body.book_id,
            BookPurchase.telegram_id == body.telegram_id,
            BookPurchase.status == "completed",
        )
        .first()
    )
    if existing:
        return {"already_purchased": True, "order_id": existing.order_id}

    # Resolve provider details
    provider_token, currency, invoice_amount = _resolve_provider(
        body.provider, int(book.price)
    )

    # DB amount is in the provider's unit (Stars for XTR, UZS for Click/Payme)
    if body.provider == "telegram_stars":
        db_amount = invoice_amount  # stars count
    else:
        db_amount = int(book.price)  # UZS

    order_id = _generate_order_id(body.provider, body.book_id, body.telegram_id)

    # Save order in DB
    purchase = BookPurchase(
        book_id=body.book_id,
        telegram_id=body.telegram_id,
        provider=body.provider,
        order_id=order_id,
        amount=db_amount,
        currency=currency,
        status="pending",
    )
    db.add(purchase)
    db.commit()

    # Call Telegram Bot API → createInvoiceLink
    bot_token = settings.TELEGRAM_BOT_TOKEN
    if not bot_token:
        raise HTTPException(status_code=500, detail="Bot token sozlanmagan")

    provider_labels = {
        "telegram_stars": "⭐ Stars",
        "click": "🟢 Click",
        "payme": "💙 Payme",
    }
    provider_label = provider_labels.get(body.provider, body.provider)

    tg_payload = {
        "title": f"📕 {book.title}",
        "description": f"SAHIFALAB kitob sotib olish ({provider_label})",
        "payload": order_id,
        "provider_token": provider_token,
        "currency": currency,
        "prices": [{"label": book.title, "amount": invoice_amount}],
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/createInvoiceLink",
                json=tg_payload,
            )
            data = resp.json()
            logger.info(f"[Payment] createInvoiceLink response: {data}")
            if not data.get("ok"):
                error_desc = data.get("description", "Unknown Telegram error")
                raise HTTPException(status_code=502, detail=f"Telegram: {error_desc}")
            invoice_url = data["result"]
    except httpx.HTTPError as e:
        logger.error(f"[Payment] createInvoiceLink network error: {e}")
        raise HTTPException(status_code=502, detail="Telegram API ga ulanib bo'lmadi")

    return {
        "order_id": order_id,
        "invoice_url": invoice_url,
        "amount": db_amount,
        "currency": currency,
        "already_purchased": False,
    }


# ── Complete order (called by bot after successful_payment) ─────────────────

@router.post("/complete-order")
async def complete_order(
    order_id: str = Query(""),
    telegram_payment_charge_id: str = Query(""),
    db: Session = Depends(get_db),
):
    """Called by the bot after Telegram sends successful_payment callback."""
    if not order_id:
        raise HTTPException(status_code=400, detail="order_id is required")
    purchase = db.query(BookPurchase).filter(BookPurchase.order_id == order_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Order not found")
    if purchase.status == "completed":
        return {"status": "completed", "order_id": order_id, "message": "Already completed"}
    purchase.status = "completed"
    purchase.provider_transaction_id = telegram_payment_charge_id or None
    purchase.completed_at = datetime.utcnow()
    db.commit()
    logger.info(f"[Payment] Order completed: {order_id} provider={purchase.provider}")
    return {"status": "completed", "order_id": order_id}


# ── Confirm payment (called by FRONTEND after openInvoice returns 'paid') ───

class ConfirmPaymentRequest(BaseModel):
    order_id: str

@router.post("/confirm-payment")
async def confirm_payment(
    body: ConfirmPaymentRequest,
    db: Session = Depends(get_db),
):
    """
    Called by the frontend when WebApp.openInvoice callback returns 'paid'.
    This is the PRIMARY path to mark the order completed.
    The bot's successful_payment handler is a backup/safety net.
    """
    purchase = db.query(BookPurchase).filter(
        BookPurchase.order_id == body.order_id
    ).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Order topilmadi")
    if purchase.status == "completed":
        return {"status": "completed", "order_id": body.order_id}
    purchase.status = "completed"
    purchase.completed_at = datetime.utcnow()
    db.commit()
    logger.info(f"[Payment] Order confirmed by frontend: {body.order_id}")
    return {"status": "completed", "order_id": body.order_id}


# ── Order status (polled by frontend) ───────────────────────────────────────

@router.get("/order/{order_id}")
async def get_order_status(order_id: str, db: Session = Depends(get_db)):
    purchase = db.query(BookPurchase).filter(BookPurchase.order_id == order_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Order topilmadi")
    return {
        "order_id": purchase.order_id,
        "book_id": purchase.book_id,
        "provider": purchase.provider,
        "amount": purchase.amount,
        "currency": purchase.currency,
        "status": purchase.status,
        "created_at": purchase.created_at.isoformat() if purchase.created_at else None,
        "completed_at": purchase.completed_at.isoformat() if purchase.completed_at else None,
    }


# ── Debug config (check that tokens are set) ────────────────────────────────

@router.get("/debug-config")
async def debug_payment_config():
    """
    Check whether payment-related env vars are configured.
    Does NOT reveal actual tokens — only shows if they're set.
    """
    return {
        "bot_token_set": bool(settings.TELEGRAM_BOT_TOKEN),
        "bot_token_preview": settings.TELEGRAM_BOT_TOKEN[:8] + "..." if settings.TELEGRAM_BOT_TOKEN else "(empty)",
        "click_provider_token_set": bool(settings.CLICK_PROVIDER_TOKEN),
        "payme_provider_token_set": bool(settings.PAYME_PROVIDER_TOKEN),
    }
