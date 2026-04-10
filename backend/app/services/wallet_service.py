"""
SAHIFALAB — Teacher Wallet & Payout Service

Business logic for teacher earnings, withdrawal requests,
and admin approval workflow.  All money values are in UZS.
"""

import os
import logging
import httpx
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
MIN_WITHDRAWAL_AMOUNT = Decimal("50000")       # 50 000 UZS
MAX_WITHDRAWAL_AMOUNT = Decimal("10000000")    # 10 000 000 UZS
STARS_RATE = 250                               # 1 Telegram Star ≈ 250 UZS

# ── Supabase helpers (same pattern as teacher.py) ─────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
ADMIN_CHAT_IDS_RAW = os.getenv("ADMIN_TELEGRAM_IDS", "")


def _supabase_headers(prefer: str = "return=representation") -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def _ensure_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise RuntimeError("Supabase not configured")


def _admin_chat_ids() -> list[int]:
    """Parse comma-separated admin Telegram IDs from env."""
    ids: list[int] = []
    for chunk in ADMIN_CHAT_IDS_RAW.split(","):
        chunk = chunk.strip()
        if chunk.isdigit():
            ids.append(int(chunk))
    return ids


# ═════════════════════════════════════════════════════════════════════════════
# Wallet CRUD helpers
# ═════════════════════════════════════════════════════════════════════════════

async def get_or_create_wallet(teacher_id: int) -> dict:
    """Return the teacher_wallets row; create one with zero balances if absent."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/teacher_wallets",
            params={"teacher_id": f"eq.{teacher_id}", "select": "*"},
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 and isinstance(res.json(), list) else []
    if rows:
        return rows[0]

    # Create new wallet
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/teacher_wallets",
            json={"teacher_id": teacher_id},
            headers=_supabase_headers(),
        )
    created = res.json() if res.status_code in (200, 201) else []
    if isinstance(created, list) and created:
        return created[0]
    raise RuntimeError(f"Failed to create wallet for teacher {teacher_id}: {res.text}")


async def _update_wallet_fields(teacher_id: int, fields: dict) -> dict:
    """Patch arbitrary fields on teacher_wallets row."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.patch(
            f"{SUPABASE_URL}/rest/v1/teacher_wallets",
            params={"teacher_id": f"eq.{teacher_id}"},
            json=fields,
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code in (200, 204) and isinstance(res.json(), list) else []
    return rows[0] if rows else {}


# ═════════════════════════════════════════════════════════════════════════════
# Credit teacher wallet (called after a course/book sale completes)
# ═════════════════════════════════════════════════════════════════════════════

async def credit_teacher_wallet(teacher_id: int, amount_uzs: float) -> dict:
    """
    Add earnings to the teacher's available_balance.
    Called from payment fulfillment (e.g. after a course sale).
    """
    wallet = await get_or_create_wallet(teacher_id)
    new_balance = float(wallet.get("available_balance", 0)) + amount_uzs
    return await _update_wallet_fields(teacher_id, {"available_balance": new_balance})


# ═════════════════════════════════════════════════════════════════════════════
# Withdrawal request flow
# ═════════════════════════════════════════════════════════════════════════════

async def request_withdrawal(
    teacher_id: int,
    amount: float,
    card_number: str,
    teacher_name: str = "O'qituvchi",
) -> dict:
    """
    Create a withdrawal request.  Validates limits, atomically moves money
    from available_balance → pending_withdrawal, and notifies admins.

    Returns the new payout_requests row.
    Raises ValueError on validation failures.
    """
    amount_d = Decimal(str(amount))

    # ── Validation ────────────────────────────────────────────────────────
    if amount_d < MIN_WITHDRAWAL_AMOUNT:
        raise ValueError(
            f"Minimal summa {MIN_WITHDRAWAL_AMOUNT:,.0f} UZS. "
            f"Siz {amount_d:,.0f} UZS so'radingiz."
        )
    if amount_d > MAX_WITHDRAWAL_AMOUNT:
        raise ValueError(
            f"Maksimal summa {MAX_WITHDRAWAL_AMOUNT:,.0f} UZS. "
            f"Siz {amount_d:,.0f} UZS so'radingiz."
        )

    wallet = await get_or_create_wallet(teacher_id)
    available = Decimal(str(wallet.get("available_balance", 0)))

    if amount_d > available:
        raise ValueError(
            f"Yetarli mablag' yo'q. Mavjud: {available:,.0f} UZS, "
            f"so'ralgan: {amount_d:,.0f} UZS."
        )

    # Also reject if the remaining balance after withdrawal is negative
    # (handles concurrent requests)
    if available - amount_d < 0:
        raise ValueError("Mablag' yetarli emas (parallel request detected).")

    # ── Atomic wallet update ──────────────────────────────────────────────
    new_available = float(available - amount_d)
    new_pending = float(Decimal(str(wallet.get("pending_withdrawal", 0))) + amount_d)
    await _update_wallet_fields(teacher_id, {
        "available_balance": new_available,
        "pending_withdrawal": new_pending,
    })

    # ── Create payout request record ──────────────────────────────────────
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/payout_requests",
            json={
                "teacher_id": teacher_id,
                "amount": float(amount_d),
                "card_number": card_number,
                "status": "pending",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code in (200, 201) and isinstance(res.json(), list) else []
    if not rows:
        # Rollback wallet changes
        await _update_wallet_fields(teacher_id, {
            "available_balance": float(available),
            "pending_withdrawal": float(Decimal(str(wallet.get("pending_withdrawal", 0)))),
        })
        raise RuntimeError(f"Failed to create payout request: {res.text}")

    payout = rows[0]

    # ── Notify admins via Telegram ────────────────────────────────────────
    await _notify_admins_new_request(teacher_id, teacher_name, amount, card_number)

    return payout


async def _notify_admins_new_request(
    teacher_id: int,
    teacher_name: str,
    amount: float,
    card_number: str,
):
    """Send Telegram message to all admin chat IDs."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN not set — skipping admin notification")
        return

    masked_card = f"****{card_number[-4:]}" if len(card_number) >= 4 else card_number
    text = (
        "💰 <b>Yangi pul yechish so'rovi!</b>\n\n"
        f"👤 O'qituvchi: <b>{teacher_name}</b> (ID: <code>{teacher_id}</code>)\n"
        f"💵 Summa: <b>{amount:,.0f} UZS</b>\n"
        f"💳 Karta: <code>{masked_card}</code>\n\n"
        "📋 Admin panelda tasdiqlang."
    )

    for chat_id in _admin_chat_ids():
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": text,
                        "parse_mode": "HTML",
                    },
                )
        except Exception as e:
            logger.error(f"Failed to notify admin {chat_id}: {e}")


# ═════════════════════════════════════════════════════════════════════════════
# Admin: list pending payouts
# ═════════════════════════════════════════════════════════════════════════════

async def list_pending_payouts() -> list[dict]:
    """Return all payout_requests with status='pending', newest first."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/payout_requests",
            params={
                "status": "eq.pending",
                "select": "*",
                "order": "created_at.desc",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 and isinstance(res.json(), list) else []

    # Enrich with teacher names
    if rows:
        teacher_ids = list({r["teacher_id"] for r in rows})
        ids_csv = ",".join(str(t) for t in teacher_ids)
        async with httpx.AsyncClient(timeout=10) as client:
            pres = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={
                    "telegram_id": f"in.({ids_csv})",
                    "select": "telegram_id,first_name,username",
                },
                headers=_supabase_headers(),
            )
        profiles = pres.json() if pres.status_code == 200 and isinstance(pres.json(), list) else []
        pmap = {int(p["telegram_id"]): p for p in profiles if p.get("telegram_id")}

        for row in rows:
            tid = int(row.get("teacher_id", 0))
            p = pmap.get(tid, {})
            row["teacher_name"] = p.get("first_name") or p.get("username") or f"ID:{tid}"
            row["teacher_username"] = p.get("username")

    return rows


async def list_all_payouts(status_filter: Optional[str] = None, limit: int = 100) -> list[dict]:
    """Return payout_requests optionally filtered by status."""
    _ensure_supabase()
    params: dict = {
        "select": "*",
        "order": "created_at.desc",
        "limit": str(limit),
    }
    if status_filter:
        params["status"] = f"eq.{status_filter}"

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/payout_requests",
            params=params,
            headers=_supabase_headers(),
        )
    return res.json() if res.status_code == 200 and isinstance(res.json(), list) else []


# ═════════════════════════════════════════════════════════════════════════════
# Admin: approve (mark paid) or reject a payout
# ═════════════════════════════════════════════════════════════════════════════

async def approve_payout(payout_id: int, admin_note: str = "") -> dict:
    """
    Mark a pending payout as paid.
    Moves money from pending_withdrawal → withdrawn_total.
    """
    _ensure_supabase()

    # Fetch the payout request
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/payout_requests",
            params={"id": f"eq.{payout_id}", "select": "*"},
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 and isinstance(res.json(), list) else []
    if not rows:
        raise ValueError("Payout request topilmadi")

    payout = rows[0]
    if payout["status"] != "pending":
        raise ValueError(f"Bu so'rov allaqachon '{payout['status']}' holatida")

    teacher_id = int(payout["teacher_id"])
    amount = Decimal(str(payout["amount"]))

    # Update wallet: pending_withdrawal -= amount, withdrawn_total += amount
    wallet = await get_or_create_wallet(teacher_id)
    new_pending = max(0, float(Decimal(str(wallet.get("pending_withdrawal", 0))) - amount))
    new_withdrawn = float(Decimal(str(wallet.get("withdrawn_total", 0))) + amount)
    await _update_wallet_fields(teacher_id, {
        "pending_withdrawal": new_pending,
        "withdrawn_total": new_withdrawn,
    })

    # Update payout request → paid
    now_iso = datetime.now(timezone.utc).isoformat()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.patch(
            f"{SUPABASE_URL}/rest/v1/payout_requests",
            params={"id": f"eq.{payout_id}"},
            json={
                "status": "paid",
                "admin_note": admin_note or None,
                "processed_at": now_iso,
            },
            headers=_supabase_headers(),
        )
    updated = res.json() if res.status_code in (200, 204) and isinstance(res.json(), list) else []
    return updated[0] if updated else {**payout, "status": "paid", "processed_at": now_iso}


async def reject_payout(payout_id: int, admin_note: str = "") -> dict:
    """
    Reject a pending payout.
    Returns money from pending_withdrawal → available_balance.
    """
    _ensure_supabase()

    # Fetch the payout request
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/payout_requests",
            params={"id": f"eq.{payout_id}", "select": "*"},
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 and isinstance(res.json(), list) else []
    if not rows:
        raise ValueError("Payout request topilmadi")

    payout = rows[0]
    if payout["status"] != "pending":
        raise ValueError(f"Bu so'rov allaqachon '{payout['status']}' holatida")

    teacher_id = int(payout["teacher_id"])
    amount = Decimal(str(payout["amount"]))

    # Return money to available_balance
    wallet = await get_or_create_wallet(teacher_id)
    new_available = float(Decimal(str(wallet.get("available_balance", 0))) + amount)
    new_pending = max(0, float(Decimal(str(wallet.get("pending_withdrawal", 0))) - amount))
    await _update_wallet_fields(teacher_id, {
        "available_balance": new_available,
        "pending_withdrawal": new_pending,
    })

    # Update payout request → rejected
    now_iso = datetime.now(timezone.utc).isoformat()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.patch(
            f"{SUPABASE_URL}/rest/v1/payout_requests",
            params={"id": f"eq.{payout_id}"},
            json={
                "status": "rejected",
                "admin_note": admin_note or None,
                "processed_at": now_iso,
            },
            headers=_supabase_headers(),
        )
    updated = res.json() if res.status_code in (200, 204) and isinstance(res.json(), list) else []
    return updated[0] if updated else {**payout, "status": "rejected", "processed_at": now_iso}


# ═════════════════════════════════════════════════════════════════════════════
# Teacher: transaction history
# ═════════════════════════════════════════════════════════════════════════════

async def get_payout_history(teacher_id: int, limit: int = 50) -> list[dict]:
    """Return all payout_requests for a teacher, newest first."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/payout_requests",
            params={
                "teacher_id": f"eq.{teacher_id}",
                "select": "*",
                "order": "created_at.desc",
                "limit": str(limit),
            },
            headers=_supabase_headers(),
        )
    return res.json() if res.status_code == 200 and isinstance(res.json(), list) else []
