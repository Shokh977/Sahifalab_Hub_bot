"""
SAHIFALAB — Payment System (BotFather Provider Tokens)
All three providers (Telegram Stars, Click, Payme) go through Telegram's
native send_invoice — no external checkout URLs or merchant webhooks needed.

Flow:
  1. Frontend creates order via POST /create-order
  2. Frontend deep-links user to bot: t.me/sahifalab_hub_bot?start=pay_{order_id}
  3. Bot fetches order → sends native Telegram invoice with correct provider_token
  4. Telegram handles payment, bot receives successful_payment
  5. Bot calls POST /complete-order → order marked completed
  6. Frontend polls GET /order/{order_id} and sees status = "completed"
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Book, BookPurchase
from datetime import datetime
from pydantic import BaseModel
from typing import Literal
import uuid
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
    Frontend then deep-links user to bot: t.me/sahifalab_hub_bot?start=pay_{order_id}
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


# ── Complete order (called by bot after successful_payment) ─────────────────

@router.post("/complete-order")
async def complete_order(
    order_id: str,
    telegram_payment_charge_id: str = "",
    db: Session = Depends(get_db),
):
    """Called by the bot after Telegram sends successful_payment callback."""
    purchase = db.query(BookPurchase).filter(BookPurchase.order_id == order_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Order not found")
    if purchase.status == "completed":
        return {"status": "completed", "order_id": order_id, "message": "Already completed"}
    purchase.status = "completed"
    purchase.provider_transaction_id = telegram_payment_charge_id
    purchase.completed_at = datetime.utcnow()
    db.commit()
    logger.info(f"[Payment] Order completed: {order_id} provider={purchase.provider}")
    return {"status": "completed", "order_id": order_id}


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
