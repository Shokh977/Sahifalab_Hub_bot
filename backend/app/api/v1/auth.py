from fastapi import APIRouter, HTTPException, Header
from typing import Optional
import os
import logging
import secrets
from datetime import datetime, UTC, timedelta
import httpx

from app.services.auth_service import (
    TelegramAuthData,
    verify_telegram_auth,
    create_access_token,
    decode_token,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def _supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _ensure_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(
            status_code=503,
            detail="Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)",
        )


@router.post("/telegram")
async def telegram_login(data: TelegramAuthData):
    """
    Authenticate user with Telegram.

    The mobile app sends the Telegram login data.
    We verify it's authentic, create/update user in database,
    and return a JWT token.
    """
    _ensure_supabase()

    # 1. Verify the data came from Telegram
    if not verify_telegram_auth(data, BOT_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid Telegram authentication")

    # 2. Check if user exists in Supabase
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{data.id}", "select": "*"},
                headers=_supabase_headers(),
            )
            rows = res.json() if res.status_code == 200 else []
            user_exists = isinstance(rows, list) and len(rows) > 0
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    # 3. Create or update user
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if not user_exists:
                await client.post(
                    f"{SUPABASE_URL}/rest/v1/profiles",
                    json={
                        "telegram_id": data.id,
                        "first_name": data.first_name,
                        "username": data.username,
                        "photo_url": data.photo_url,
                        "app_created_at": datetime.now(UTC).isoformat(),
                        "app_last_login": datetime.now(UTC).isoformat(),
                    },
                    headers=_supabase_headers(),
                )
            else:
                await client.patch(
                    f"{SUPABASE_URL}/rest/v1/profiles",
                    params={"telegram_id": f"eq.{data.id}"},
                    json={"app_last_login": datetime.now(UTC).isoformat()},
                    headers=_supabase_headers(),
                )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user: {e}")

    # 4. Fetch the profile row so we can return role + status
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{data.id}", "select": "role,status,photo_url"},
                headers=_supabase_headers(),
            )
            profile_row = (res.json() or [{}])[0] if res.status_code == 200 else {}
    except Exception:
        profile_row = {}

    # 5. Generate JWT token
    token_data = create_access_token(data.id)

    return {
        "success": True,
        "telegram_id": data.id,
        "first_name": data.first_name,
        "username": data.username,
        "photo_url": data.photo_url or profile_row.get("photo_url"),
        "role": profile_row.get("role", "student"),
        "status": profile_row.get("status", "active"),
        **token_data,
    }


@router.get("/me")
async def get_current_user(authorization: str = Header(None)):
    """Get current user info from JWT token."""
    _ensure_supabase()

    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}", "select": "*"},
                headers=_supabase_headers(),
            )
            rows = res.json() if res.status_code == 200 else []

        if not rows:
            raise HTTPException(status_code=404, detail="User not found")

        user = rows[0]
        return {
            "telegram_id": user.get("telegram_id"),
            "first_name": user.get("first_name"),
            "username": user.get("username"),
            "photo_url": user.get("photo_url"),
            "role": user.get("role", "student"),
            "status": user.get("status", "active"),
            "level": user.get("level", 1),
            "total_xp": user.get("total_xp", 0),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch user: {e}")


@router.post("/logout")
async def logout(authorization: str = Header(None)):
    """Logout user (client should discard token)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    return {"success": True, "message": "Logged out"}


# ── Bot-code auth flow ────────────────────────────────────────────────────────
# 1. Frontend calls POST /api/auth/request-code  → gets a short-lived code
# 2. Frontend shows:  t.me/<BOT_USERNAME>?start=auth_<code>
# 3. User taps link → Telegram opens bot → bot claims the code (see bot/bot.py)
# 4. Frontend polls  GET /api/auth/verify-code/<code> every 2 s
# 5. When claimed → backend issues JWT and returns it
# ─────────────────────────────────────────────────────────────────────────────

BOT_USERNAME = os.getenv("BOT_USERNAME", "Sahifalab_hub_bot")
CODE_TTL_MINUTES = 10


@router.post("/request-code")
async def request_code():
    """Generate a one-time auth code and return the bot deep-link."""
    _ensure_supabase()

    code = secrets.token_hex(4)          # 8 hex chars, e.g. "a3f19c2b"
    expires_at = (datetime.now(UTC) + timedelta(minutes=CODE_TTL_MINUTES)).isoformat()

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{SUPABASE_URL}/rest/v1/auth_codes",
                json={"code": code, "expires_at": expires_at},
                headers=_supabase_headers(),
            )
            if res.status_code not in (200, 201):
                raise HTTPException(status_code=500, detail=f"Failed to create code: {res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    bot_link = f"https://t.me/{BOT_USERNAME}?start=auth_{code}"
    return {"code": code, "bot_link": bot_link, "expires_in_seconds": CODE_TTL_MINUTES * 60}


@router.get("/verify-code/{code}")
async def verify_code(code: str):
    """
    Poll this endpoint until the bot claims the code.
    Returns:
      - 202 {"status": "pending"}  — not yet claimed
      - 200 {"status": "ok", "access_token": ..., ...}  — claimed, JWT issued
      - 410 {"detail": "expired"}  — code is expired or used
    """
    _ensure_supabase()

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/auth_codes",
                params={"code": f"eq.{code}", "select": "*"},
                headers=_supabase_headers(),
            )
            rows = res.json() if res.status_code == 200 else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not rows:
        raise HTTPException(status_code=404, detail="Code not found")

    row = rows[0]

    # Check expiry / already used
    expires_at = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if row.get("used") or datetime.now(UTC) > expires_at:
        raise HTTPException(status_code=410, detail="Code expired or already used")

    # Not yet claimed by the bot
    if not row.get("telegram_id"):
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=202, content={"status": "pending"})

    telegram_id = row["telegram_id"]
    first_name   = row.get("first_name", "")
    username     = row.get("username")
    photo_url    = row.get("photo_url")

    # Mark code as used
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/auth_codes",
                params={"code": f"eq.{code}"},
                json={"used": True},
                headers=_supabase_headers(),
            )
    except Exception:
        pass  # non-fatal — worst case it gets polled once more

    # Upsert profile
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Check if profile exists
            chk = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}", "select": "telegram_id"},
                headers=_supabase_headers(),
            )
            exists = isinstance(chk.json(), list) and len(chk.json()) > 0

            if not exists:
                await client.post(
                    f"{SUPABASE_URL}/rest/v1/profiles",
                    json={
                        "telegram_id": telegram_id,
                        "first_name": first_name,
                        "username": username,
                        "photo_url": photo_url,
                        "app_created_at": datetime.now(UTC).isoformat(),
                        "app_last_login": datetime.now(UTC).isoformat(),
                    },
                    headers=_supabase_headers(),
                )
            else:
                await client.patch(
                    f"{SUPABASE_URL}/rest/v1/profiles",
                    params={"telegram_id": f"eq.{telegram_id}"},
                    json={
                        "photo_url": photo_url,
                        "app_last_login": datetime.now(UTC).isoformat(),
                    },
                    headers=_supabase_headers(),
                )
    except Exception as e:
        logger.warning(f"Profile upsert warning: {e}")

    # Fetch role + status
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}", "select": "role,status"},
                headers=_supabase_headers(),
            )
            profile = (res.json() or [{}])[0] if res.status_code == 200 else {}
    except Exception:
        profile = {}

    token_data = create_access_token(telegram_id)

    return {
        "status": "ok",
        "telegram_id": telegram_id,
        "first_name": first_name,
        "username": username,
        "photo_url": photo_url,
        "role": profile.get("role", "student"),
        "status_account": profile.get("status", "active"),
        **token_data,
    }


# ── Teacher application flow ──────────────────────────────────────────────────

async def _resolve_telegram_id(authorization: Optional[str]) -> int:
    """Decode Bearer JWT → telegram_id, raising 401 on failure."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return telegram_id


async def _resolve_admin_id(authorization: Optional[str]) -> int:
    """Like _resolve_telegram_id but also verifies the user is an admin."""
    telegram_id = await _resolve_telegram_id(authorization)
    _ensure_supabase()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}", "select": "role"},
                headers=_supabase_headers(),
            )
            profile = (res.json() or [{}])[0] if res.status_code == 200 else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    if profile.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return telegram_id


@router.post("/apply-teacher")
async def apply_teacher(authorization: Optional[str] = Header(None)):
    """
    Current user applies to become a teacher.
    Sets profiles.role = 'teacher', profiles.status = 'pending'.
    Idempotent — returns current status if already applied.
    """
    _ensure_supabase()
    telegram_id = await _resolve_telegram_id(authorization)

    # Fetch current profile
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}", "select": "role,status"},
                headers=_supabase_headers(),
            )
            profile = (res.json() or [{}])[0] if res.status_code == 200 else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    current_role   = profile.get("role", "student")
    current_status = profile.get("status", "active")

    if current_role == "admin":
        raise HTTPException(status_code=400, detail="Admin cannot apply as teacher")

    # Already submitted — return current state
    if current_role == "teacher":
        return {"success": True, "already_applied": True, "status": current_status}

    # Set role=teacher, status=pending
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}"},
                json={"role": "teacher", "status": "pending"},
                headers=_supabase_headers(),
            )
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {"success": True, "already_applied": False, "status": "pending"}


@router.get("/admin/teacher-requests")
async def list_teacher_requests(authorization: Optional[str] = Header(None)):
    """
    Admin: list all pending teacher applications.
    Returns profiles where role='teacher' AND status='pending'.
    """
    _ensure_supabase()
    await _resolve_admin_id(authorization)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={
                    "role": "eq.teacher",
                    "status": "eq.pending",
                    "select": "telegram_id,first_name,username,photo_url,total_xp,level,created_at",
                    "order": "created_at.asc",
                },
                headers=_supabase_headers(),
            )
            if res.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
            return res.json() or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.post("/admin/approve-teacher/{target_telegram_id}")
async def approve_teacher(
    target_telegram_id: int,
    authorization: Optional[str] = Header(None),
):
    """Admin approves a pending teacher — sets status='active'."""
    _ensure_supabase()
    await _resolve_admin_id(authorization)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{target_telegram_id}"},
                json={"role": "teacher", "status": "active"},
                headers=_supabase_headers(),
            )
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {"success": True, "message": "Teacher approved", "telegram_id": target_telegram_id}


@router.post("/admin/reject-teacher/{target_telegram_id}")
async def reject_teacher(
    target_telegram_id: int,
    authorization: Optional[str] = Header(None),
):
    """Admin rejects a teacher application — reverts to role='student', status='active'."""
    _ensure_supabase()
    await _resolve_admin_id(authorization)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{target_telegram_id}"},
                json={"role": "student", "status": "active"},
                headers=_supabase_headers(),
            )
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {"success": True, "message": "Teacher application rejected", "telegram_id": target_telegram_id}
