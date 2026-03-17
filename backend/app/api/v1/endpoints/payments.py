"""
SAHIFALAB — Production Payment System
Providers: Telegram Stars, Click, Payme
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Book, BookPurchase
from app.core.config import settings
from datetime import datetime
from pydantic import BaseModel
from typing import Optional
import hashlib
import hmac
import uuid
import logging
import base64

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────────

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


# ═══════════════════════════════════════════════════════════════════════════════
# 1. TELEGRAM STARS — native Telegram payment (XTR)
# ═══════════════════════════════════════════════════════════════════════════════

class StarsOrderRequest(BaseModel):
    book_id: int
    telegram_id: int


@router.post("/telegram-stars/create-order")
async def create_stars_order(body: StarsOrderRequest, db: Session = Depends(get_db)):
    """
    Create a pending order for Telegram Stars.
    Frontend opens deep link: t.me/sahifalab_bot?start=pay_{order_id}
    Bot sends an invoice → on successful_payment the order is marked completed.
    """
    book = _get_book_or_404(body.book_id, db)

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

    order_id = _generate_order_id("stars", body.book_id, body.telegram_id)
    # 1 Star ≈ 250 UZS (adjustable)
    stars_amount = max(1, int(book.price / 250))

    purchase = BookPurchase(
        book_id=body.book_id,
        telegram_id=body.telegram_id,
        provider="telegram_stars",
        order_id=order_id,
        amount=stars_amount,
        currency="XTR",
        status="pending",
    )
    db.add(purchase)
    db.commit()

    return {
        "order_id": order_id,
        "stars_amount": stars_amount,
        "book_title": book.title,
        "already_purchased": False,
    }


@router.post("/telegram-stars/complete")
async def complete_stars_order(
    order_id: str,
    telegram_payment_charge_id: str = "",
    db: Session = Depends(get_db),
):
    """Called by the bot after successful_payment."""
    purchase = db.query(BookPurchase).filter(BookPurchase.order_id == order_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="Order not found")
    purchase.status = "completed"
    purchase.provider_transaction_id = telegram_payment_charge_id
    purchase.completed_at = datetime.utcnow()
    db.commit()
    return {"status": "completed", "order_id": order_id}


# ═══════════════════════════════════════════════════════════════════════════════
# 2. CLICK — checkout URL (click.uz)
# ═══════════════════════════════════════════════════════════════════════════════

class ClickOrderRequest(BaseModel):
    book_id: int
    telegram_id: int


@router.post("/click/create-order")
async def create_click_order(body: ClickOrderRequest, db: Session = Depends(get_db)):
    """
    Create a pending order and return a Click checkout URL.
    Docs: https://docs.click.uz
    Env: CLICK_MERCHANT_ID, CLICK_SERVICE_ID, CLICK_SECRET_KEY
    """
    book = _get_book_or_404(body.book_id, db)

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

    order_id = _generate_order_id("click", body.book_id, body.telegram_id)
    amount = book.price  # UZS

    purchase = BookPurchase(
        book_id=body.book_id,
        telegram_id=body.telegram_id,
        provider="click",
        order_id=order_id,
        amount=amount,
        currency="UZS",
        status="pending",
    )
    db.add(purchase)
    db.commit()

    merchant_id = getattr(settings, "CLICK_MERCHANT_ID", "")
    service_id = getattr(settings, "CLICK_SERVICE_ID", "")

    checkout_url = (
        f"https://my.click.uz/services/pay"
        f"?service_id={service_id}"
        f"&merchant_id={merchant_id}"
        f"&amount={int(amount)}"
        f"&transaction_param={order_id}"
        f"&return_url=https://t.me/sahifalab_bot"
    )

    return {
        "order_id": order_id,
        "amount": amount,
        "checkout_url": checkout_url,
        "already_purchased": False,
    }


# Click SHOP-API webhook
@router.post("/webhook/click")
async def click_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    logger.info(f"[Click webhook] {body}")

    action = body.get("action")
    merchant_trans_id = body.get("merchant_trans_id", "")
    click_trans_id = str(body.get("click_trans_id", ""))
    error_code = body.get("error", 0)

    purchase = db.query(BookPurchase).filter(BookPurchase.order_id == merchant_trans_id).first()

    if action == 0:  # Prepare
        if not purchase:
            return {"error": -5, "error_note": "Order not found"}
        if purchase.status == "completed":
            return {"error": -4, "error_note": "Already completed"}
        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_prepare_id": purchase.id,
            "error": 0,
            "error_note": "Success",
        }

    elif action == 1:  # Complete
        if not purchase:
            return {"error": -5, "error_note": "Order not found"}
        if error_code < 0:
            purchase.status = "cancelled"
            db.commit()
            return {"error": error_code, "error_note": "Transaction cancelled"}
        purchase.status = "completed"
        purchase.provider_transaction_id = click_trans_id
        purchase.completed_at = datetime.utcnow()
        db.commit()
        return {
            "click_trans_id": click_trans_id,
            "merchant_trans_id": merchant_trans_id,
            "merchant_confirm_id": purchase.id,
            "error": 0,
            "error_note": "Success",
        }

    return {"error": -3, "error_note": "Action not found"}


# ═══════════════════════════════════════════════════════════════════════════════
# 3. PAYME — checkout URL (payme.uz)
# ═══════════════════════════════════════════════════════════════════════════════

class PaymeOrderRequest(BaseModel):
    book_id: int
    telegram_id: int


@router.post("/payme/create-order")
async def create_payme_order(body: PaymeOrderRequest, db: Session = Depends(get_db)):
    """
    Create a pending order and return a Payme checkout URL.
    Docs: https://developer.help.paycom.uz
    Env: PAYME_MERCHANT_ID, PAYME_SECRET_KEY
    """
    book = _get_book_or_404(body.book_id, db)

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

    order_id = _generate_order_id("payme", body.book_id, body.telegram_id)
    amount_tiyin = int(book.price * 100)

    purchase = BookPurchase(
        book_id=body.book_id,
        telegram_id=body.telegram_id,
        provider="payme",
        order_id=order_id,
        amount=book.price,
        currency="UZS",
        status="pending",
    )
    db.add(purchase)
    db.commit()

    merchant_id = getattr(settings, "PAYME_MERCHANT_ID", "")
    params_str = f"m={merchant_id};ac.order_id={order_id};a={amount_tiyin}"
    encoded = base64.b64encode(params_str.encode()).decode()
    checkout_url = f"https://checkout.paycom.uz/{encoded}"

    return {
        "order_id": order_id,
        "amount": book.price,
        "amount_tiyin": amount_tiyin,
        "checkout_url": checkout_url,
        "already_purchased": False,
    }


# Payme JSON-RPC webhook
@router.post("/webhook/payme")
async def payme_webhook(request: Request, db: Session = Depends(get_db)):
    body = await request.json()
    method = body.get("method", "")
    params = body.get("params", {})
    rpc_id = body.get("id")
    logger.info(f"[Payme webhook] method={method} params={params}")

    order_id = params.get("account", {}).get("order_id", "")
    amount = params.get("amount", 0)

    def _error(code, msg):
        return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": code, "message": {"uz": msg, "ru": msg, "en": msg}}}

    def _result(data):
        return {"jsonrpc": "2.0", "id": rpc_id, "result": data}

    if method == "CheckPerformTransaction":
        purchase = db.query(BookPurchase).filter(BookPurchase.order_id == order_id).first()
        if not purchase:
            return _error(-31050, "Order topilmadi")
        if purchase.status == "completed":
            return _error(-31051, "Allaqachon to'langan")
        expected_tiyin = int(purchase.amount * 100)
        if amount != expected_tiyin:
            return _error(-31001, "Noto'g'ri summa")
        return _result({"allow": True})

    elif method == "CreateTransaction":
        purchase = db.query(BookPurchase).filter(BookPurchase.order_id == order_id).first()
        if not purchase:
            return _error(-31050, "Order topilmadi")
        payme_id = params.get("id", "")
        purchase.provider_transaction_id = payme_id
        db.commit()
        return _result({
            "create_time": int(purchase.created_at.timestamp() * 1000),
            "transaction": str(purchase.id),
            "state": 1,
        })

    elif method == "PerformTransaction":
        payme_id = params.get("id", "")
        purchase = db.query(BookPurchase).filter(BookPurchase.provider_transaction_id == payme_id).first()
        if not purchase:
            return _error(-31050, "Transaction topilmadi")
        purchase.status = "completed"
        purchase.completed_at = datetime.utcnow()
        db.commit()
        return _result({
            "transaction": str(purchase.id),
            "perform_time": int(purchase.completed_at.timestamp() * 1000),
            "state": 2,
        })

    elif method == "CancelTransaction":
        payme_id = params.get("id", "")
        purchase = db.query(BookPurchase).filter(BookPurchase.provider_transaction_id == payme_id).first()
        if not purchase:
            return _error(-31050, "Transaction topilmadi")
        purchase.status = "cancelled"
        db.commit()
        return _result({
            "transaction": str(purchase.id),
            "cancel_time": int(datetime.utcnow().timestamp() * 1000),
            "state": -1,
        })

    elif method == "CheckTransaction":
        payme_id = params.get("id", "")
        purchase = db.query(BookPurchase).filter(BookPurchase.provider_transaction_id == payme_id).first()
        if not purchase:
            return _error(-31050, "Transaction topilmadi")
        state_map = {"pending": 1, "completed": 2, "cancelled": -1, "refunded": -2}
        return _result({
            "create_time": int(purchase.created_at.timestamp() * 1000),
            "perform_time": int(purchase.completed_at.timestamp() * 1000) if purchase.completed_at else 0,
            "cancel_time": 0,
            "transaction": str(purchase.id),
            "state": state_map.get(purchase.status, 1),
        })

    return _error(-32601, "Method not found")


# ═══════════════════════════════════════════════════════════════════════════════
# 4. Universal order status
# ═══════════════════════════════════════════════════════════════════════════════

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
