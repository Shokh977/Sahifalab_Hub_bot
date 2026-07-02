"""
SAHIFALAB — Teacher Wallet endpoints

Routes (all require Bearer JWT, role=teacher|admin):
  GET   /api/teacher/wallet           — get wallet balances
  POST  /api/teacher/wallet/withdraw  — request a withdrawal
  GET   /api/teacher/wallet/history   — payout request history
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel, Field
from typing import Optional
import logging

from app.services.auth_service import decode_token_payload
from app.services import wallet_service as ws

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Auth helper (same pattern as teacher.py) ──────────────────────────────────

async def _get_telegram_id(authorization: Optional[str]) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    payload = decode_token_payload(parts[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("role") not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Teacher account required")
    return int(payload["telegram_id"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class WalletResponse(BaseModel):
    teacher_id: int
    available_balance: float = 0
    pending_withdrawal: float = 0
    withdrawn_total: float = 0

class WithdrawRequest(BaseModel):
    amount: float = Field(..., gt=0, description="Amount in UZS")
    card_number: str = Field(..., min_length=8, max_length=30, description="Card number (e.g. 8600 1234 5678 9012)")

class PayoutResponse(BaseModel):
    id: int
    teacher_id: int
    amount: float
    card_number: str
    status: str
    admin_note: Optional[str] = None
    created_at: str
    processed_at: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/wallet")
async def get_wallet(authorization: Optional[str] = Header(None)):
    """Get the calling teacher's wallet balances."""
    teacher_id = await _get_telegram_id(authorization)
    try:
        wallet = await ws.get_or_create_wallet(teacher_id)
        return {
            "teacher_id": teacher_id,
            "available_balance": float(wallet.get("available_balance", 0)),
            "pending_withdrawal": float(wallet.get("pending_withdrawal", 0)),
            "withdrawn_total": float(wallet.get("withdrawn_total", 0)),
        }
    except Exception as e:
        logger.error(f"get_wallet error: {e}")
        raise HTTPException(status_code=500, detail="Hamyon ma'lumotlarini olishda xatolik")


@router.post("/wallet/withdraw")
async def request_withdrawal(
    body: WithdrawRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Request a withdrawal. Validates:
    - amount >= MIN_WITHDRAWAL_AMOUNT (50 000 UZS)
    - amount <= MAX_WITHDRAWAL_AMOUNT (10 000 000 UZS)
    - amount <= available_balance
    """
    teacher_id = await _get_telegram_id(authorization)

    # Fetch teacher name for notification
    teacher_name = f"Teacher #{teacher_id}"
    try:
        import httpx, os
        SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
        SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
        if SUPABASE_URL and SUPABASE_KEY:
            async with httpx.AsyncClient(timeout=5) as client:
                pres = await client.get(
                    f"{SUPABASE_URL}/rest/v1/profiles",
                    params={
                        "telegram_id": f"eq.{teacher_id}",
                        "select": "first_name,username",
                    },
                    headers={
                        "apikey": SUPABASE_KEY,
                        "Authorization": f"Bearer {SUPABASE_KEY}",
                        "Content-Type": "application/json",
                    },
                )
            profiles = pres.json() if pres.status_code == 200 else []
            if isinstance(profiles, list) and profiles:
                p = profiles[0]
                teacher_name = p.get("first_name") or p.get("username") or teacher_name
    except Exception:
        pass

    try:
        payout = await ws.request_withdrawal(
            teacher_id=teacher_id,
            amount=body.amount,
            card_number=body.card_number,
            teacher_name=teacher_name,
        )
        return {"success": True, "payout": payout}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"request_withdrawal error: {e}")
        raise HTTPException(status_code=500, detail="Pul yechish so'rovida xatolik")


@router.get("/wallet/history")
async def get_wallet_history(
    authorization: Optional[str] = Header(None),
    limit: int = Query(50, ge=1, le=200),
):
    """Get the calling teacher's payout request history."""
    teacher_id = await _get_telegram_id(authorization)
    try:
        history = await ws.get_payout_history(teacher_id, limit=limit)
        return {"history": history}
    except Exception as e:
        logger.error(f"get_wallet_history error: {e}")
        raise HTTPException(status_code=500, detail="Hamyon tarixini olishda xatolik")
