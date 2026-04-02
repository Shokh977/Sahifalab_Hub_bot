from fastapi import APIRouter, HTTPException, Header
from fastapi import UploadFile, File
from typing import Optional
import os
import logging
import secrets
import hashlib
import uuid
from datetime import datetime, UTC, timedelta
import httpx
import bcrypt
from pydantic import BaseModel, HttpUrl, EmailStr
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests
from pathlib import Path
from app.core.config import settings

from app.services.auth_service import (
    TelegramAuthData,
    verify_telegram_auth,
    create_access_token,
    decode_token,
    decode_token_payload,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


class GoogleSignInRequest(BaseModel):
    id_token: str


class PhotoUpdateRequest(BaseModel):
    photo_url: HttpUrl


class ProfileUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    username: Optional[str] = None


def _google_sub_to_internal_id(sub: str) -> int:
    """
    Convert Google `sub` to a stable negative integer so it can coexist with
    Telegram positive IDs in the existing schema.
    """
    digest = hashlib.sha256(sub.encode("utf-8")).hexdigest()
    compact = int(digest[:15], 16) % 900_000_000
    return -(100_000_000 + compact)


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


def _require_bearer_and_decode(authorization: Optional[str]) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return telegram_id


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
    token_data = create_access_token(data.id, profile_row.get("role", "student"))

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


@router.post("/google")
async def google_sign_in(body: GoogleSignInRequest):
    """Sign up/sign in with Google ID token (web)."""
    _ensure_supabase()

    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google auth not configured (GOOGLE_CLIENT_ID missing)")

    try:
        idinfo = google_id_token.verify_oauth2_token(
            body.id_token,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    sub = idinfo.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid Google token payload")

    telegram_id = _google_sub_to_internal_id(sub)
    first_name = idinfo.get("given_name") or idinfo.get("name") or "Google User"
    email = idinfo.get("email")
    username = (email.split("@")[0] if isinstance(email, str) and "@" in email else None)
    photo_url = idinfo.get("picture")

    # Upsert profile
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            chk = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}", "select": "telegram_id"},
                headers=_supabase_headers(),
            )
            rows = chk.json() if chk.status_code == 200 else []
            exists = isinstance(rows, list) and len(rows) > 0

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
                        "first_name": first_name,
                        "username": username,
                        "photo_url": photo_url,
                        "app_last_login": datetime.now(UTC).isoformat(),
                    },
                    headers=_supabase_headers(),
                )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile upsert failed: {e}")

    # Fetch role/status (default remains student/active)
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

    token_data = create_access_token(telegram_id, profile.get("role", "student"))
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


@router.patch("/me/photo")
async def update_my_photo(body: PhotoUpdateRequest, authorization: str = Header(None)):
    """Update current user's profile photo URL."""
    _ensure_supabase()
    telegram_id = _require_bearer_and_decode(authorization)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}"},
                json={"photo_url": str(body.photo_url)},
                headers=_supabase_headers(),
            )
            if res.status_code not in (200, 201, 204):
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update photo: {e}")

    return {"ok": True, "photo_url": str(body.photo_url)}


@router.patch("/me")
async def update_my_profile(body: ProfileUpdateRequest, authorization: str = Header(None)):
    """Update current user's editable profile fields (first_name, username)."""
    _ensure_supabase()
    telegram_id = _require_bearer_and_decode(authorization)

    payload = {}
    if body.first_name is not None:
        payload["first_name"] = body.first_name.strip()
    if body.username is not None:
        payload["username"] = (body.username.strip() or None)

    if not payload:
        return {"ok": True}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}"},
                json=payload,
                headers=_supabase_headers(),
            )
            if res.status_code not in (200, 201, 204):
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {e}")

    return {"ok": True, **payload}


@router.post("/me/photo/upload")
async def upload_my_photo(file: UploadFile = File(...), authorization: str = Header(None)):
    """Upload current user's avatar image to Bunny CDN and save photo_url in profile."""
    _ensure_supabase()
    telegram_id = _require_bearer_and_decode(authorization)

    allowed_image_mime = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed_image_mime:
        raise HTTPException(status_code=415, detail="Faqat JPG, PNG, WEBP, GIF ruxsat etiladi")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Rasm hajmi 10MB dan kichik bo'lishi kerak")

    if not settings.BUNNY_STORAGE_ZONE or not settings.BUNNY_API_KEY or not settings.BUNNY_CDN_HOSTNAME:
        raise HTTPException(status_code=503, detail="Bunny CDN sozlanmagan")

    region_host = {
        "de": "storage.bunnycdn.com",
        "ny": "ny.storage.bunnycdn.com",
        "la": "la.storage.bunnycdn.com",
        "sg": "sg.storage.bunnycdn.com",
        "syd": "syd.storage.bunnycdn.com",
        "br": "br.storage.bunnycdn.com",
        "jh": "jh.storage.bunnycdn.com",
    }
    host = region_host.get(settings.BUNNY_STORAGE_REGION or "de", "storage.bunnycdn.com")

    ext = Path(file.filename or "avatar").suffix.lower()
    if not ext:
        ext = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "image/gif": ".gif",
        }.get(file.content_type or "", ".jpg")

    remote_path = f"uploads/users/{telegram_id}/avatar_{uuid.uuid4().hex}{ext}"
    put_url = f"https://{host}/{settings.BUNNY_STORAGE_ZONE}/{remote_path}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        put_res = await client.put(
            put_url,
            content=file_bytes,
            headers={
                "AccessKey": settings.BUNNY_API_KEY,
                "Content-Type": file.content_type or "application/octet-stream",
                "Content-Length": str(len(file_bytes)),
            },
        )

    if put_res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Bunny upload error: {put_res.text[:200]}")

    public_url = f"https://{settings.BUNNY_CDN_HOSTNAME.rstrip('/')}/{remote_path}"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            patch_res = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}"},
                json={"photo_url": public_url},
                headers=_supabase_headers(),
            )
            if patch_res.status_code not in (200, 201, 204):
                raise HTTPException(status_code=500, detail=f"Supabase error: {patch_res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update avatar URL: {e}")

    return {"ok": True, "photo_url": public_url, "remote_path": remote_path}


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

    token_data = create_access_token(telegram_id, profile.get("role", "student"))

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

class ApplyTeacherRequest(BaseModel):
    specialization:   str
    experience_years: int
    bio:              str
    course_idea:      str   # What course they plan to create
    motivation:       str   # Why they want to teach


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
async def apply_teacher(
    body: ApplyTeacherRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Current user applies to become a teacher.
    Stores application form data in teacher_profiles.
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
        async with httpx.AsyncClient(timeout=15) as client:
            # Update profile role/status
            res = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}"},
                json={"role": "teacher", "status": "pending"},
                headers=_supabase_headers(),
            )
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")

            # Check if teacher_profile row already exists
            chk = await client.get(
                f"{SUPABASE_URL}/rest/v1/teacher_profiles",
                params={"telegram_id": f"eq.{telegram_id}", "select": "telegram_id"},
                headers=_supabase_headers(),
            )
            exists = isinstance(chk.json(), list) and len(chk.json()) > 0

            # Upsert teacher_profiles with application data
            profile_payload = {
                "telegram_id":      telegram_id,
                "specialization":   body.specialization,
                "experience_years": body.experience_years,
                "bio":              body.bio,
                "course_idea":      body.course_idea,
                "motivation":       body.motivation,
                "applied_at":       datetime.now(UTC).isoformat(),
            }
            if exists:
                await client.patch(
                    f"{SUPABASE_URL}/rest/v1/teacher_profiles",
                    params={"telegram_id": f"eq.{telegram_id}"},
                    json={k: v for k, v in profile_payload.items() if k != "telegram_id"},
                    headers=_supabase_headers(),
                )
            else:
                await client.post(
                    f"{SUPABASE_URL}/rest/v1/teacher_profiles",
                    json=profile_payload,
                    headers=_supabase_headers(),
                )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {"success": True, "already_applied": False, "status": "pending"}


@router.get("/admin/teacher-requests")
async def list_teacher_requests(authorization: Optional[str] = Header(None)):
    """
    Admin: list all pending teacher applications.
    Returns profiles joined with teacher_profiles application data.
    """
    _ensure_supabase()
    await _resolve_admin_id(authorization)

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            # Fetch pending teacher profiles
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={
                    "role":   "eq.teacher",
                    "status": "eq.pending",
                    "select": "telegram_id,first_name,username,photo_url,total_xp,level,created_at",
                    "order":  "created_at.asc",
                },
                headers=_supabase_headers(),
            )
            if res.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")

            profiles = res.json() or []
            if not profiles:
                return []

            # Fetch teacher_profiles application data for these users
            tg_ids = [str(p["telegram_id"]) for p in profiles]
            tp_res = await client.get(
                f"{SUPABASE_URL}/rest/v1/teacher_profiles",
                params={
                    "telegram_id": f"in.({','.join(tg_ids)})",
                    "select": "telegram_id,specialization,experience_years,bio,course_idea,motivation,applied_at",
                },
                headers=_supabase_headers(),
            )
            tp_map = {}
            if tp_res.status_code == 200:
                for row in (tp_res.json() or []):
                    tp_map[row["telegram_id"]] = row

            # Merge application data into profiles
            result = []
            for p in profiles:
                tp = tp_map.get(p["telegram_id"], {})
                result.append({
                    **p,
                    "specialization":   tp.get("specialization"),
                    "experience_years": tp.get("experience_years"),
                    "bio":              tp.get("bio"),
                    "course_idea":      tp.get("course_idea"),
                    "motivation":       tp.get("motivation"),
                    "applied_at":       tp.get("applied_at"),
                })
            return result
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


# ── Admin: user management ────────────────────────────────────────────────────

class SetUserRoleRequest(BaseModel):
    role: str    # student | teacher | admin
    status: str = "active"  # active | pending | suspended


@router.get("/admin/users")
async def list_users(
    q: Optional[str] = None,
    limit: int = 50,
    authorization: Optional[str] = Header(None),
):
    """
    Admin: search / list platform users.
    - ?q=<text>  searches first_name and username (ilike) or exact telegram_id
    - Returns up to `limit` results ordered by creation date desc.
    """
    _ensure_supabase()
    await _resolve_admin_id(authorization)

    params: dict = {
        "select": "telegram_id,first_name,username,photo_url,role,status,total_xp,level,app_created_at",
        "order": "app_created_at.desc",
        "limit": str(min(limit, 200)),
    }

    if q and q.strip():
        q = q.strip()
        try:
            tid = int(q)
            params["telegram_id"] = f"eq.{tid}"
        except ValueError:
            # Supabase OR filter
            params["or"] = f"(first_name.ilike.*{q}*,username.ilike.*{q}*)"

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params=params,
                headers=_supabase_headers(),
            )
            if res.status_code != 200:
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
            return res.json() or []
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.patch("/admin/users/{target_telegram_id}/role")
async def set_user_role(
    target_telegram_id: int,
    body: SetUserRoleRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Admin: directly set a user's role (student / teacher / admin) and status.
    Useful for promoting users, demoting, or fixing stuck pending states.
    """
    _ensure_supabase()
    await _resolve_admin_id(authorization)

    allowed_roles   = {"student", "teacher", "admin"}
    allowed_statuses = {"active", "pending", "suspended"}

    if body.role not in allowed_roles:
        raise HTTPException(status_code=400, detail=f"Invalid role. Use one of: {', '.join(allowed_roles)}")
    if body.status not in allowed_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Use one of: {', '.join(allowed_statuses)}")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{target_telegram_id}"},
                json={"role": body.role, "status": body.status},
                headers=_supabase_headers(),
            )
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return {
        "success": True,
        "telegram_id": target_telegram_id,
        "role": body.role,
        "status": body.status,
    }

# ── Email auth ────────────────────────────────────────────────────────────────

def _email_to_internal_id(email: str) -> int:
    """
    Convert email to a stable negative integer ID that coexists with
    Telegram positive IDs and Google negative IDs in the schema.
    Uses a different prefix (200_000_000) from Google (100_000_000).
    """
    digest = hashlib.sha256(email.lower().encode("utf-8")).hexdigest()
    compact = int(digest[:15], 16) % 700_000_000
    return -(200_000_000 + compact)


class EmailRegisterRequest(BaseModel):
    first_name: str
    email:      EmailStr
    password:   str


class EmailLoginRequest(BaseModel):
    email:    EmailStr
    password: str


@router.post("/email-register")
async def email_register(body: EmailRegisterRequest):
    """
    Register a new account with email + password.
    Returns a JWT on success.
    """
    _ensure_supabase()

    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Parol kamida 6 ta belgidan iborat bo'lishi kerak")

    email_lower = body.email.lower()

    # Check if email already exists
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            chk = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"email": f"eq.{email_lower}", "select": "telegram_id"},
                headers=_supabase_headers(),
            )
            existing = chk.json() if chk.status_code == 200 else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if existing:
        raise HTTPException(status_code=400, detail="Bu email allaqachon ro'yxatdan o'tgan")

    # Hash password
    password_hash = bcrypt.hashpw(body.password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    # Derive stable internal ID from email
    internal_id = _email_to_internal_id(email_lower)

    # Create profile
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{SUPABASE_URL}/rest/v1/profiles",
                json={
                    "telegram_id":    internal_id,
                    "first_name":     body.first_name.strip(),
                    "email":          email_lower,
                    "password_hash":  password_hash,
                    "role":           "student",
                    "status":         "active",
                    "app_created_at": datetime.now(UTC).isoformat(),
                    "app_last_login": datetime.now(UTC).isoformat(),
                },
                headers=_supabase_headers(),
            )
            if res.status_code not in (200, 201):
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    token_data = create_access_token(internal_id, "student")
    return {
        "status": "ok",
        "telegram_id": internal_id,
        "first_name": body.first_name.strip(),
        "email": email_lower,
        "username": None,
        "photo_url": None,
        "role": "student",
        "status_account": "active",
        **token_data,
    }


@router.post("/email-login")
async def email_login(body: EmailLoginRequest):
    """
    Login with email + password.
    Returns a JWT on success.
    """
    _ensure_supabase()

    email_lower = body.email.lower()

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={
                    "email":  f"eq.{email_lower}",
                    "select": "telegram_id,first_name,username,photo_url,password_hash,role,status",
                },
                headers=_supabase_headers(),
            )
            rows = res.json() if res.status_code == 200 else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not rows:
        raise HTTPException(status_code=401, detail="Email yoki parol noto'g'ri")

    row = rows[0]
    stored_hash = row.get("password_hash")
    if not stored_hash:
        raise HTTPException(status_code=401, detail="Bu akkaunt parol bilan ro'yxatdan o'tmagan")

    if not bcrypt.checkpw(body.password.encode("utf-8"), stored_hash.encode("utf-8")):
        raise HTTPException(status_code=401, detail="Email yoki parol noto'g'ri")

    if row.get("status") == "suspended":
        raise HTTPException(status_code=403, detail="Akkauntingiz bloklangan")

    # Update last login
    telegram_id = row["telegram_id"]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}"},
                json={"app_last_login": datetime.now(UTC).isoformat()},
                headers=_supabase_headers(),
            )
    except Exception:
        pass

    token_data = create_access_token(telegram_id, row.get("role", "student"))
    return {
        "status": "ok",
        "telegram_id": telegram_id,
        "first_name":  row.get("first_name", ""),
        "username":    row.get("username"),
        "photo_url":   row.get("photo_url"),
        "role":        row.get("role", "student"),
        "status_account": row.get("status", "active"),
        **token_data,
    }