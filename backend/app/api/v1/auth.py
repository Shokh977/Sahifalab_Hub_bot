from fastapi import APIRouter, HTTPException, Header
from typing import Optional
import os
import logging
from datetime import datetime, UTC
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

    # 4. Generate JWT token
    token_data = create_access_token(data.id)

    return {
        "success": True,
        "telegram_id": data.id,
        "first_name": data.first_name,
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
            "level": user.get("level", 1),
            "xp": user.get("xp", 0),
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
