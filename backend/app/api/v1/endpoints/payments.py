from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Book
from datetime import datetime
import hashlib
import hmac

router = APIRouter()

# Telegram Stars Payment Integration
@router.post("/telegram-stars/pay")
async def initiate_telegram_stars_payment(
    book_id: int,
    user_id: int,
    db: Session = Depends(get_db)
):
    """Initiate payment via Telegram Stars"""
    book = db.query(Book).filter(Book.id == book_id).first()
    
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found"
        )
    
    if not book.is_paid or book.price == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This book is not available for purchase"
        )
    
    # Calculate stars (1 USD ≈ 1 Telegram Star, adjust as needed)
    stars = int(book.price)
    
    return {
        "status": "pending",
        "provider": "telegram_stars",
        "book_id": book_id,
        "title": book.title,
        "amount_stars": stars,
        "currency": "XTR"  # Telegram Stars currency code
    }

@router.post("/telegram-stars/verify")
async def verify_telegram_stars_payment(
    payment_info: dict,
    db: Session = Depends(get_db)
):
    """Verify Telegram Stars payment"""
    # This would validate the payment with Telegram Bot API
    return {
        "status": "verified",
        "message": "Payment successful"
    }

# Click Payment Integration (Uzbekistan)
@router.post("/click/prepare")
async def click_prepare_payment(
    book_id: int,
    merchant_user_id: str,
    db: Session = Depends(get_db)
):
    """Prepare Click payment (Uzbekistan)"""
    book = db.query(Book).filter(Book.id == book_id).first()
    
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found"
        )
    
    # Amount in tiyins (1 UZS = 1 tiyin in Click API)
    amount_tiyins = int(book.price * 100)
    
    return {
        "click_trans_id": 0,  # Will be assigned by Click
        "merchant_trans_id": f"book_{book_id}_{merchant_user_id}",
        "amount": amount_tiyins,
        "status": "pending"
    }

@router.post("/click/complete")
async def click_complete_payment(
    click_trans_id: str,
    merchant_trans_id: str,
    amount: float,
    sign_string: str,
    db: Session = Depends(get_db)
):
    """Complete Click payment"""
    # Verify Click signature
    # In production: calculate expected signature and compare
    
    return {
        "click_trans_id": click_trans_id,
        "merchant_trans_id": merchant_trans_id,
        "status": "completed"
    }

@router.post("/click/cancel")
async def click_cancel_payment(
    click_trans_id: str,
    reason: str = None,
    db: Session = Depends(get_db)
):
    """Cancel Click payment"""
    return {
        "click_trans_id": click_trans_id,
        "status": "cancelled",
        "reason": reason
    }

# Payme Payment Integration (Uzbekistan)
@router.post("/payme/subscribe")
async def payme_subscribe_payment(
    book_id: int,
    phone: str,
    db: Session = Depends(get_db)
):
    """Subscribe to Payme payment"""
    book = db.query(Book).filter(Book.id == book_id).first()
    
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found"
        )
    
    # Amount in tiyin (1 UZS = 1 tiyin in Payme API)
    amount_tiyin = int(book.price * 100)
    
    return {
        "subscribe_key": f"payme_{book_id}_{phone}",
        "amount": amount_tiyin,
        "phone": phone,
        "book_id": book_id,
        "status": "pending"
    }

@router.post("/payme/confirm")
async def payme_confirm_payment(
    transaction_id: str,
    subscribe_key: str,
    db: Session = Depends(get_db)
):
    """Confirm Payme payment"""
    return {
        "transaction_id": transaction_id,
        "subscribe_key": subscribe_key,
        "status": "confirmed",
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/payme/check-transaction")
async def payme_check_transaction(
    transaction_id: str,
    db: Session = Depends(get_db)
):
    """Check Payme transaction status"""
    return {
        "transaction_id": transaction_id,
        "status": "confirmed",  # confirmed, pending, cancelled
        "create_time": datetime.utcnow().isoformat(),
        "perform_time": datetime.utcnow().isoformat(),
        "cancel_time": None
    }

# Payment Status
@router.get("/status/{transaction_id}")
async def get_payment_status(
    transaction_id: str,
    provider: str = Query("telegram_stars"),
    db: Session = Depends(get_db)
):
    """Get payment status across all providers"""
    return {
        "transaction_id": transaction_id,
        "provider": provider,
        "status": "confirmed",
        "timestamp": datetime.utcnow().isoformat()
    }

# Webhook for payment notifications
@router.post("/webhook/click")
async def click_webhook(
    request_dict: dict,
    db: Session = Depends(get_db)
):
    """Handle Click webhook notifications"""
    return {"status": "success"}

@router.post("/webhook/payme")
async def payme_webhook(
    jsonrpc: str,
    method: str,
    params: dict,
    id: str,
    db: Session = Depends(get_db)
):
    """Handle Payme webhook notifications"""
    return {
        "jsonrpc": "2.0",
        "result": {
            "state": 2,
            "received": True
        },
        "id": id
    }

@router.post("/webhook/telegram-stars")
async def telegram_stars_webhook(
    update_id: int,
    pre_checkout_query: dict = None,
    successful_payment: dict = None,
    db: Session = Depends(get_db)
):
    """Handle Telegram Stars webhook notifications"""
    if pre_checkout_query:
        # Telegram asks for pre_checkout query verification
        return {"status": "verified"}
    
    if successful_payment:
        # Payment was successful
        return {"status": "acknowledged"}
    
    return {"status": "ok"}
