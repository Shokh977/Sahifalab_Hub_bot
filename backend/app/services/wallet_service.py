"""
SAHIFALAB — Teacher Wallet & Payout Service

Business logic for teacher earnings, withdrawal requests,
and admin approval workflow.  All money values are in UZS.

Wallet mutations use atomic Supabase RPC functions (credit_wallet,
debit_wallet, approve_payout, reject_payout) that lock rows with
FOR UPDATE to eliminate race conditions.
"""

import os
import logging
import httpx
from decimal import Decimal
from typing import Optional

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
MIN_WITHDRAWAL_AMOUNT = Decimal("50000")       # 50 000 UZS
MAX_WITHDRAWAL_AMOUNT = Decimal("10000000")    # 10 000 000 UZS
MAX_PENDING_REQUESTS = 3                       # Max concurrent pending withdrawal requests
WITHDRAWAL_COOLDOWN_MINUTES = 10               # Min minutes between withdrawal requests

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


async def _DEPRECATED_update_wallet_fields(teacher_id: int, fields: dict) -> dict:
    """DEPRECATED: Non-atomic PATCH bypass. DO NOT USE for balance mutations.
    
    Kept only for potential non-financial metadata updates.
    All balance operations MUST use atomic RPC helpers (credit_wallet, debit_wallet).
    """
    raise RuntimeError(
        "_update_wallet_fields is deprecated. Use atomic RPC helpers "
        "(credit_wallet, debit_wallet, approve_payout, reject_payout) instead."
    )


async def _call_rpc(fn_name: str, params: dict) -> dict:
    """Call a Supabase RPC function and return the JSON result."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/rpc/{fn_name}",
            json=params,
            headers=_supabase_headers("return=representation"),
        )
    if res.status_code not in (200, 201):
        detail = res.text[:500]
        logger.error("RPC %s failed (%s): %s", fn_name, res.status_code, detail)
        raise RuntimeError(f"RPC {fn_name} failed: {detail}")
    data = res.json()
    # Supabase RPC returns the function result directly
    return data if isinstance(data, dict) else {}


# ═════════════════════════════════════════════════════════════════════════════
# Credit teacher wallet (called after a course/book sale completes)
# ═════════════════════════════════════════════════════════════════════════════

async def credit_teacher_wallet(
    teacher_id: int,
    amount_uzs: float,
    reference: str | None = None,
    note: str | None = None,
) -> dict:
    """
    Add earnings to the teacher's available_balance via atomic RPC.
    Uses FOR UPDATE row locking — safe against concurrent calls.
    """
    return await _call_rpc("credit_wallet", {
        "p_teacher_id": teacher_id,
        "p_amount": float(amount_uzs),
        "p_reference": reference,
        "p_note": note or f"Sale credit: {amount_uzs} UZS",
    })


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
    Create a withdrawal request via atomic RPC (debit_wallet).
    The RPC atomically: locks wallet → checks balance → deducts available_balance →
    adds to pending_withdrawal → creates payout_requests row → logs audit entry.

    Returns the payout details dict.
    Raises ValueError on validation failures, RuntimeError on RPC errors.
    """
    amount_d = Decimal(str(amount))

    # ── Client-side validation (fast-fail before RPC) ─────────────────────
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

    # ── Pending request cap — prevent spam ────────────────────────────────
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        pending_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/payout_requests",
            params={
                "teacher_id": f"eq.{teacher_id}",
                "status": "eq.pending",
                "select": "id,created_at",
                "order": "created_at.desc",
            },
            headers=_supabase_headers(),
        )
    pending_rows = pending_res.json() if pending_res.status_code == 200 and isinstance(pending_res.json(), list) else []

    if len(pending_rows) >= MAX_PENDING_REQUESTS:
        raise ValueError(
            f"Sizda allaqachon {len(pending_rows)} ta kutilayotgan so'rov bor. "
            f"Maksimal {MAX_PENDING_REQUESTS} ta."
        )

    # ── Cooldown check — prevent rapid-fire requests ──────────────────────
    if pending_rows:
        from datetime import datetime, UTC, timedelta
        last_created = pending_rows[0].get("created_at", "")
        if last_created:
            try:
                last_dt = datetime.fromisoformat(last_created.replace("Z", "+00:00"))
                cooldown_until = last_dt + timedelta(minutes=WITHDRAWAL_COOLDOWN_MINUTES)
                if datetime.now(UTC) < cooldown_until:
                    remaining = int((cooldown_until - datetime.now(UTC)).total_seconds() // 60) + 1
                    raise ValueError(
                        f"Iltimos, {remaining} daqiqa kuting. "
                        f"So'rovlar orasida kamida {WITHDRAWAL_COOLDOWN_MINUTES} daqiqa bo'lishi kerak."
                    )
            except ValueError:
                raise  # Re-raise our own ValueError
            except Exception:
                pass  # If date parsing fails, allow the request

    # Quick balance pre-check (non-atomic, just for user-friendly error)
    wallet = await get_or_create_wallet(teacher_id)
    available = Decimal(str(wallet.get("available_balance", 0)))
    if amount_d > available:
        raise ValueError(
            f"Yetarli mablag' yo'q. Mavjud: {available:,.0f} UZS, "
            f"so'ralgan: {amount_d:,.0f} UZS."
        )

    # ── Atomic debit via RPC ──────────────────────────────────────────────
    card_masked = f"****{card_number[-4:]}" if len(card_number) >= 4 else card_number
    try:
        result = await _call_rpc("debit_wallet", {
            "p_teacher_id": teacher_id,
            "p_amount": float(amount_d),
            # Store ONLY the masked card — never persist full card numbers
            "p_card_number": card_masked,
            "p_card_masked": card_masked,
            "p_note": f"Withdrawal request by {teacher_name}",
        })
    except RuntimeError as exc:
        err_msg = str(exc).lower()
        if "insufficient balance" in err_msg:
            raise ValueError(
                "Mablag' yetarli emas (parallel request detected)."
            ) from exc
        raise

    payout_id = result.get("payout_id")

    # ── Notify admins via Telegram (masked card only) ────────────────────
    await _notify_admins_new_request(teacher_id, teacher_name, amount, card_masked)

    return {
        "id": payout_id,
        "teacher_id": teacher_id,
        "amount": float(amount_d),
        "card_masked": card_masked,
        "status": "pending",
        **result,
    }


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
    Mark a pending payout as paid via atomic RPC (approve_payout).
    The RPC atomically: locks payout → validates status → locks wallet →
    moves pending_withdrawal → withdrawn_total → updates payout status → logs audit.
    """
    try:
        result = await _call_rpc("approve_payout", {
            "p_payout_id": payout_id,
            "p_admin_note": admin_note or None,
        })
    except RuntimeError as exc:
        err_msg = str(exc).lower()
        if "not found" in err_msg:
            raise ValueError("Payout request topilmadi") from exc
        if "already processed" in err_msg:
            raise ValueError("Bu so'rov allaqachon bajarilgan") from exc
        raise

    return {"id": payout_id, **result}


async def reject_payout(payout_id: int, admin_note: str = "") -> dict:
    """
    Reject a pending payout via atomic RPC (reject_payout).
    The RPC atomically: locks payout → validates status → locks wallet →
    returns money from pending_withdrawal → available_balance → updates status → logs audit.
    """
    try:
        result = await _call_rpc("reject_payout", {
            "p_payout_id": payout_id,
            "p_admin_note": admin_note or None,
        })
    except RuntimeError as exc:
        err_msg = str(exc).lower()
        if "not found" in err_msg:
            raise ValueError("Payout request topilmadi") from exc
        if "already processed" in err_msg:
            raise ValueError("Bu so'rov allaqachon bajarilgan") from exc
        raise

    return {"id": payout_id, **result}


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
