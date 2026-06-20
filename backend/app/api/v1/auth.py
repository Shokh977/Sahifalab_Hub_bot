"""
auth.py — SAHIFALAB authentication endpoints.

All profile/user data is accessed via SQLAlchemy ORM (direct Postgres TCP),
bypassing Supabase's REST API entirely — unaffected by cached-egress quota.
"""
import re
from fastapi import APIRouter, HTTPException, Header, Depends
from fastapi import UploadFile, File
from fastapi.responses import JSONResponse
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
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

try:
    from google.oauth2 import id_token as google_id_token
    from google.auth.transport import requests as google_requests
    _GOOGLE_AVAILABLE = True
except ImportError:
    _GOOGLE_AVAILABLE = False

import io
from pathlib import Path

try:
    from PIL import Image as PILImage
    _PIL_AVAILABLE = True
except ImportError:
    _PIL_AVAILABLE = False

import asyncio
from app.core.config import settings
from app.db.session import get_db
from app.models.models import Profile, AuthCode, AuthToken, TeacherProfile
from app.services.auth_service import (
    TelegramAuthData,
    verify_telegram_auth,
    validate_tma_init_data,
    create_access_token,
    decode_token,
    decode_token_payload,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _send_welcome(user_id: int, first_name: str = "", db: Session = None):
    """Award 100 welcome XP and fire a welcome notification for new users."""
    if user_id <= 0:
        return
    # Award 100 XP — 'WELCOME' source falls through add_xp with no cap/dedup
    if db is not None:
        try:
            from app.services.xp_service import add_xp
            add_xp(db, user_id=user_id, source="WELCOME", amount=100)
        except Exception:
            pass
    # Push notification (fire-and-forget)
    try:
        from app.api.v1.endpoints.notifications import send_notification
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(
                send_notification(user_id, "welcome", "SOCIAL", {"first_name": first_name}),
                loop,
            )
    except Exception:
        pass

BOT_TOKEN        = os.getenv("TELEGRAM_BOT_TOKEN", "")
GOOGLE_CLIENT_ID = settings.GOOGLE_CLIENT_ID or os.getenv("GOOGLE_CLIENT_ID", "")
BOT_USERNAME     = os.getenv("BOT_USERNAME", "Sahifalab_hub_bot")
CODE_TTL_MINUTES = 10


# ── Pydantic models ───────────────────────────────────────────────────────────

class GoogleSignInRequest(BaseModel):
    id_token: str

class PhotoUpdateRequest(BaseModel):
    photo_url: HttpUrl

class ProfileUpdateRequest(BaseModel):
    first_name:         Optional[str] = None
    username:           Optional[str] = None
    bio:                Optional[str] = None
    about_me:           Optional[str] = None
    daily_goal_minutes: Optional[int] = None

class ApplyTeacherRequest(BaseModel):
    specialization:   str
    experience_years: int
    bio:              str
    course_idea:      str
    motivation:       str
    contact:          str

class SetUserRoleRequest(BaseModel):
    role:   str
    status: str = "active"

class TmaInitRequest(BaseModel):
    init_data: str

class EmailRegisterRequest(BaseModel):
    first_name: str
    email:      EmailStr
    password:   str

class EmailLoginRequest(BaseModel):
    email:    EmailStr
    password: str

class BotClaimCodeRequest(BaseModel):
    code:        str
    telegram_id: int
    first_name:  str = ""
    username:    Optional[str] = None
    photo_url:   Optional[str] = None
    bot_secret:  str  # must match TELEGRAM_BOT_TOKEN — proves request came from the bot

class LinkEmailRequest(BaseModel):
    email: EmailStr

class ResendVerificationRequest(BaseModel):
    email: EmailStr

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class NotifPrefsBody(BaseModel):
    prefs: dict = {}

class PushTokenBody(BaseModel):
    token: str

class NewPasswordRequest(BaseModel):
    new_password: str


# ── ORM helpers ───────────────────────────────────────────────────────────────

def _get_profile(db: Session, telegram_id: int) -> Optional[Profile]:
    return db.query(Profile).filter(Profile.telegram_id == telegram_id).first()


def _gen_site_username(db: Session, first_name: Optional[str], telegram_id: int) -> str:
    """Generate a unique public handle from first_name + telegram_id suffix."""
    base = re.sub(r'[^a-z0-9]', '', (first_name or '').lower())[:15] or 'user'
    suffix = str(abs(telegram_id) % 100000)
    candidate = f"{base}_{suffix}"
    taken = db.query(Profile).filter(
        func.lower(Profile.site_username) == candidate.lower()
    ).first()
    if not taken:
        return candidate
    return f"{base}_{abs(telegram_id)}"


def _upsert_profile(db: Session, telegram_id: int, **kwargs) -> Profile:
    """Create or update a profile row via ORM (no Supabase REST involved)."""
    profile = db.query(Profile).filter(Profile.telegram_id == telegram_id).first()
    if profile is None:
        if "app_created_at" not in kwargs:
            kwargs["app_created_at"] = datetime.now(UTC)
        if "site_username" not in kwargs or not kwargs.get("site_username"):
            kwargs["site_username"] = _gen_site_username(db, kwargs.get("first_name"), telegram_id)
        profile = Profile(telegram_id=telegram_id, **kwargs)
        db.add(profile)
    else:
        for key, value in kwargs.items():
            setattr(profile, key, value)
        if not profile.site_username:
            profile.site_username = _gen_site_username(db, profile.first_name, telegram_id)
    try:
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        raise
    return profile


def _require_bearer(authorization: Optional[str]) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    return telegram_id


def _require_admin(db: Session, authorization: Optional[str]) -> int:
    telegram_id = _require_bearer(authorization)
    profile = _get_profile(db, telegram_id)
    if not profile or profile.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return telegram_id


def _validate_password(password: str) -> list[str]:
    """Return a list of validation errors (empty = valid)."""
    errors: list[str] = []
    if len(password) < 8:
        errors.append("Kamida 8 ta belgi bo'lishi kerak")
    if not any(c.isupper() for c in password):
        errors.append("Kamida 1 ta katta harf (A-Z)")
    if not any(c.islower() for c in password):
        errors.append("Kamida 1 ta kichik harf (a-z)")
    if not any(c.isdigit() for c in password):
        errors.append("Kamida 1 ta raqam (0-9)")
    if not any(c in "!@#$%^&*()_+-=[]{}|;:',.<>?/" for c in password):
        errors.append("Kamida 1 ta maxsus belgi (!@#$...)")
    return errors


def _create_auth_token(db: Session, user_id: int, token_type: str, hours: int = 24) -> str:
    """Create and persist a one-time auth token. Returns the token string."""
    import uuid as _uuid
    token_str = secrets.token_hex(32)
    logger.info("[TOKEN] Inserting auth_token type=%s user_id=%s", token_type, user_id)
    db.add(AuthToken(
        id=_uuid.uuid4().hex,
        user_id=user_id,
        token=token_str,
        type=token_type,
        expires_at=datetime.now(UTC) + timedelta(hours=hours),
    ))
    db.commit()
    logger.info("[TOKEN] auth_token committed OK")
    return token_str


def _google_sub_to_internal_id(sub: str) -> int:
    digest  = hashlib.sha256(sub.encode()).hexdigest()
    compact = int(digest[:15], 16) % 900_000_000
    return -(100_000_000 + compact)


def _email_to_internal_id(email: str) -> int:
    digest  = hashlib.sha256(email.lower().encode()).hexdigest()
    compact = int(digest[:15], 16) % 700_000_000
    return -(200_000_000 + compact)


# ══════════════════════════════════════════════════════════════════════════════
# AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/telegram-widget-page")
async def telegram_widget_page(redirect: str = ""):
    """
    Serves a minimal HTML page embedding the Telegram Login Widget.
    Used by the Android app — opens in WebBrowser, on success redirects
    to the app deep link (sahifalab://auth/telegram-callback?id=...&hash=...).
    """
    from fastapi.responses import HTMLResponse
    safe_redirect = redirect.replace('"', '%22')
    content = f"""<!DOCTYPE html>
<html lang="uz">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Telegram bilan kirish — SAHIFALAB</title>
<style>
  body {{
    margin:0; display:flex; align-items:center; justify-content:center;
    min-height:100vh; background:#13141a; font-family:sans-serif;
  }}
  .card {{
    text-align:center; padding:40px 24px;
  }}
  h1 {{ color:#e8792f; font-size:24px; margin-bottom:8px; }}
  p  {{ color:rgba(255,255,255,0.5); font-size:14px; margin-bottom:32px; }}
</style>
</head>
<body>
<div class="card">
  <h1>SAHIFALAB</h1>
  <p>Telegram bilan tizimga kirish</p>
  <script
    async
    src="https://telegram.org/js/telegram-widget.js?22"
    data-telegram-login="{BOT_USERNAME}"
    data-size="large"
    data-radius="8"
    data-auth-url="{safe_redirect}"
    data-request-access="write">
  </script>
</div>
</body>
</html>"""
    return HTMLResponse(content=content, status_code=200)


@router.post("/telegram")
async def telegram_login(data: TelegramAuthData, db: Session = Depends(get_db)):
    """Authenticate with Telegram Login Widget data."""
    if not verify_telegram_auth(data, BOT_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid Telegram authentication")

    existing = db.query(Profile).filter(Profile.telegram_id == data.id).first()
    is_new = existing is None
    # Only sync Telegram profile fields when the user has no value set yet.
    # Preserves any custom avatar, name, or username the user has set in the app.
    has_any_photo = bool(existing and existing.photo_url)
    has_first_name = bool(existing and existing.first_name)
    has_username   = bool(existing and existing.username)
    profile = _upsert_profile(
        db, data.id,
        app_last_login=datetime.now(UTC),
        **({"first_name": data.first_name} if not has_first_name else {}),
        **({"username":   data.username}   if not has_username   else {}),
        **({"photo_url":  data.photo_url}  if not has_any_photo  else {}),
    )
    if is_new:
        _send_welcome(data.id, data.first_name or "", db)
    token_data = create_access_token(data.id, profile.role or "student")
    return {
        "success": True, "telegram_id": data.id,
        "first_name": profile.first_name, "username": profile.site_username,
        "photo_url": profile.photo_url or data.photo_url,
        "role": profile.role or "student", "status": profile.status or "active",
        **token_data,
    }


@router.post("/tma-init")
@router.post("/telegram-miniapp")
async def tma_init(body: TmaInitRequest, db: Session = Depends(get_db)):
    """
    Authenticate a Telegram Mini App user by validating the raw initData string.

    Registered at both /tma-init (legacy) and /telegram-miniapp (canonical).
    The frontend sends:  { "init_data": window.Telegram.WebApp.initData }
    We validate with the correct TMA HMAC scheme (key = HMAC-SHA256("WebAppData", bot_token)),
    then upsert the profile and return a JWT — identical shape to /auth/telegram.
    """
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="Bot token not configured")

    user = validate_tma_init_data(body.init_data, BOT_TOKEN)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired Telegram initData")

    telegram_id = user.get("id")
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Missing user.id in initData")

    first_name = user.get("first_name", "")
    username   = user.get("username")
    photo_url  = user.get("photo_url")

    existing = db.query(Profile).filter(Profile.telegram_id == telegram_id).first()
    is_new = existing is None
    has_any_photo  = bool(existing and existing.photo_url)
    has_first_name = bool(existing and existing.first_name)
    has_username   = bool(existing and existing.username)
    profile = _upsert_profile(
        db, telegram_id,
        app_last_login=datetime.now(UTC),
        **({"first_name": first_name} if not has_first_name else {}),
        **({"username":   username}   if not has_username   else {}),
        **({"photo_url":  photo_url}  if not has_any_photo  else {}),
    )
    if is_new:
        _send_welcome(telegram_id, first_name or "", db)
    token_data = create_access_token(telegram_id, profile.role or "student")
    logger.info("tma_init: authenticated user_id=%s (%s)", telegram_id, username or first_name)
    return {
        "success":     True,
        "telegram_id": telegram_id,
        "first_name":  profile.first_name,
        "username":    profile.username,
        "photo_url":   profile.photo_url or photo_url,
        "role":        profile.role   or "student",
        "status":      profile.status or "active",
        **token_data,
    }


@router.get("/me")
async def get_current_user(
    authorization: str = Header(None), db: Session = Depends(get_db)
):
    """Validate JWT and return current user profile."""
    telegram_id = _require_bearer(authorization)
    profile = _get_profile(db, telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "telegram_id":   profile.telegram_id,
        "first_name":    profile.first_name,
        "username":      profile.site_username,
        "photo_url":     profile.photo_url,
        "email":         profile.email,
        "email_verified": profile.email_verified,
        "has_password":  bool(profile.password_hash),
        "role":          profile.role   or "student",
        "status":        profile.status or "active",
        "level":         profile.level  or 1,
        "total_xp":      profile.total_xp or 0,
        "bio":           getattr(profile, "bio",      None),
        "about_me":      getattr(profile, "about_me", None),
        "streak_days":   getattr(profile, "streak_days",        0) or 0,
        "daily_goal_minutes": getattr(profile, "daily_goal_minutes", 20) or 20,
    }


@router.post("/google")
async def google_sign_in(body: GoogleSignInRequest, db: Session = Depends(get_db)):
    if not _GOOGLE_AVAILABLE:
        raise HTTPException(status_code=503, detail="Google auth library not installed")
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google auth not configured")
    try:
        idinfo = google_id_token.verify_oauth2_token(
            body.id_token, google_requests.Request(), GOOGLE_CLIENT_ID,
        )
    except Exception as e:
        logger.warning("google_sign_in: token verification failed (client_id=%s): %s",
                       GOOGLE_CLIENT_ID[:12] + "..." if GOOGLE_CLIENT_ID else "MISSING", e)
        raise HTTPException(status_code=401, detail="Invalid Google token")
    sub = idinfo.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid Google token payload")

    telegram_id = _google_sub_to_internal_id(sub)
    first_name  = idinfo.get("given_name") or idinfo.get("name") or "Google User"
    email       = idinfo.get("email")
    username    = email.split("@")[0] if isinstance(email, str) and "@" in email else None
    photo_url   = idinfo.get("picture")

    is_new = db.query(Profile).filter(Profile.telegram_id == telegram_id).first() is None
    profile = _upsert_profile(
        db, telegram_id, first_name=first_name, username=username,
        photo_url=photo_url, email=email, app_last_login=datetime.now(UTC),
    )
    if is_new:
        _send_welcome(telegram_id, first_name or "", db)
    token_data = create_access_token(telegram_id, profile.role or "student")
    return {
        "status": "ok", "telegram_id": telegram_id,
        "first_name": first_name, "username": username, "photo_url": photo_url,
        "email": profile.email,
        "role": profile.role or "student", "status_account": profile.status or "active",
        **token_data,
    }


@router.patch("/me/photo")
async def update_my_photo(
    body: PhotoUpdateRequest, authorization: str = Header(None), db: Session = Depends(get_db)
):
    telegram_id = _require_bearer(authorization)
    _upsert_profile(db, telegram_id, photo_url=str(body.photo_url))
    return {"ok": True, "photo_url": str(body.photo_url)}


@router.patch("/me")
async def update_my_profile(
    body: ProfileUpdateRequest, authorization: str = Header(None), db: Session = Depends(get_db)
):
    telegram_id = _require_bearer(authorization)
    payload: dict = {}
    if body.first_name is not None:
        payload["first_name"] = body.first_name.strip()
    if body.username is not None:
        payload["username"] = body.username.strip() or None
    if body.bio is not None:
        payload["bio"] = body.bio.strip()[:150] or None      # short bio, max 150 chars
    if body.about_me is not None:
        payload["about_me"] = body.about_me.strip() or None
    if body.daily_goal_minutes is not None:
        payload["daily_goal_minutes"] = max(5, min(480, body.daily_goal_minutes))
    if not payload:
        return {"ok": True}
    _upsert_profile(db, telegram_id, **payload)
    return {"ok": True, **payload}


@router.delete("/me")
async def delete_my_account(
    authorization: str = Header(None), db: Session = Depends(get_db)
):
    """Permanently delete the currently-authenticated user's account."""
    telegram_id = _require_bearer(authorization)
    profile = _get_profile(db, telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    db.delete(profile)
    db.commit()
    return {"ok": True}


@router.post("/me/photo/upload")
async def upload_my_photo(
    file: UploadFile = File(...),
    authorization: str = Header(None),
    db: Session = Depends(get_db),
):
    telegram_id = _require_bearer(authorization)
    if file.content_type not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
        raise HTTPException(status_code=415, detail="Faqat JPG, PNG, WEBP, GIF ruxsat etiladi")
    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Rasm hajmi 10MB dan kichik bo'lishi kerak")
    if not settings.BUNNY_STORAGE_ZONE or not settings.BUNNY_API_KEY or not settings.BUNNY_CDN_HOSTNAME:
        raise HTTPException(status_code=503, detail="Bunny CDN sozlanmagan")

    upload_content_type = file.content_type or "application/octet-stream"
    ext = ".jpg"
    if _PIL_AVAILABLE and file.content_type in {"image/jpeg", "image/png", "image/gif", "image/webp"}:
        try:
            img = PILImage.open(io.BytesIO(file_bytes))
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGBA" if img.mode in ("P", "PA", "LA", "RGBA") else "RGB")
            img.thumbnail((400, 400), PILImage.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="WEBP", quality=85, method=6)
            file_bytes = buf.getvalue()
            upload_content_type = "image/webp"
            ext = ".webp"
        except Exception:
            ext = Path(file.filename or "avatar").suffix.lower() or ".jpg"
    else:
        ext = Path(file.filename or "avatar").suffix.lower() or ".jpg"

    region_host = {
        "de": "storage.bunnycdn.com",   "ny": "ny.storage.bunnycdn.com",
        "la": "la.storage.bunnycdn.com", "sg": "sg.storage.bunnycdn.com",
        "syd": "syd.storage.bunnycdn.com", "br": "br.storage.bunnycdn.com",
        "jh": "jh.storage.bunnycdn.com",
    }
    host        = region_host.get(settings.BUNNY_STORAGE_REGION or "de", "storage.bunnycdn.com")
    remote_path = f"uploads/users/{telegram_id}/avatar_{uuid.uuid4().hex}{ext}"
    put_url     = f"https://{host}/{settings.BUNNY_STORAGE_ZONE}/{remote_path}"

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            put_res = await client.put(
                put_url, content=file_bytes,
                headers={
                    "AccessKey": settings.BUNNY_API_KEY,
                    "Content-Type": upload_content_type,
                    "Content-Length": str(len(file_bytes)),
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Fayl yuklash vaqti tugadi.")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"CDN ulanish xatosi: {exc}")
    if put_res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Bunny upload error: {put_res.text[:200]}")

    public_url = f"https://{settings.BUNNY_CDN_HOSTNAME.rstrip('/')}/{remote_path}"
    _upsert_profile(db, telegram_id, photo_url=public_url)
    return {"ok": True, "photo_url": public_url, "remote_path": remote_path}


@router.post("/push-token")
async def save_push_token(
    body: PushTokenBody,
    authorization: str = Header(None),
    db: Session = Depends(get_db),
):
    """Save the device's Expo push token so the server can send notifications."""
    telegram_id = _require_bearer(authorization)
    profile = _get_profile(db, telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    current = dict(profile.user_settings or {})
    current["expo_push_token"] = body.token.strip()
    profile.user_settings = current
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ma'lumotlar bazasi xatoligi")
    return {"ok": True}


@router.get("/notification-prefs")
async def get_notification_prefs(
    authorization: str = Header(None), db: Session = Depends(get_db)
):
    telegram_id = _require_bearer(authorization)
    profile = _get_profile(db, telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    prefs = (profile.user_settings or {}).get("notification_prefs", {})
    return {
        "streak":  prefs.get("streak",  True),
        "course":  prefs.get("course",  True),
        "achieve": prefs.get("achieve", True),
        "weekly":  prefs.get("weekly",  True),
    }


@router.put("/notification-prefs")
async def update_notification_prefs(
    body: NotifPrefsBody,
    authorization: str = Header(None),
    db: Session = Depends(get_db),
):
    telegram_id = _require_bearer(authorization)
    profile = _get_profile(db, telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    current = dict(profile.user_settings or {})
    current["notification_prefs"] = body.prefs
    profile.user_settings = current
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ma'lumotlar bazasi xatoligi")
    return {"ok": True}


@router.post("/logout")
async def logout(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    return {"success": True, "message": "Logged out"}


# ── Bot-code auth flow ────────────────────────────────────────────────────────

@router.post("/request-code")
async def request_code(db: Session = Depends(get_db)):
    """Generate a one-time login code for the bot flow."""
    from sqlalchemy import text as _sa_text
    code       = secrets.token_hex(4)
    expires_at = datetime.now(UTC) + timedelta(minutes=CODE_TTL_MINUTES)
    try:
        db.execute(
            _sa_text("INSERT INTO auth_codes (code, expires_at) VALUES (:code, :expires_at)"),
            {"code": code, "expires_at": expires_at},
        )
        db.commit()
    except Exception as e:
        logger.exception("request_code: DB commit failed: %s", e)
        db.rollback()
        raise HTTPException(status_code=500, detail="Ma'lumotlar bazasida xatolik")
    return {
        "code": code,
        "bot_link": f"https://t.me/{BOT_USERNAME}?start=auth_{code}",
        "expires_in_seconds": CODE_TTL_MINUTES * 60,
    }


@router.post("/bot-claim-code")
async def bot_claim_code(body: BotClaimCodeRequest, db: Session = Depends(get_db)):
    """
    Called by the Telegram bot when a user sends /start auth_{code}.
    Validates the shared secret (bot token), then writes the user's Telegram ID
    into the auth_codes row so the polling /verify-code endpoint can proceed.
    """
    if not BOT_TOKEN or body.bot_secret != BOT_TOKEN:
        raise HTTPException(status_code=403, detail="Unauthorized")

    auth_code = db.query(AuthCode).filter(AuthCode.code == body.code).first()
    if not auth_code:
        raise HTTPException(status_code=404, detail="Code not found")

    expires = auth_code.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if auth_code.used or datetime.now(UTC) > expires:
        raise HTTPException(status_code=410, detail="Code expired or already used")

    auth_code.telegram_id = body.telegram_id
    auth_code.first_name  = body.first_name or ""
    auth_code.username    = body.username
    auth_code.photo_url   = body.photo_url

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    return {"ok": True}


@router.get("/verify-code/{code}")
async def verify_code(code: str, db: Session = Depends(get_db)):
    """Poll until the bot claims the code, then return a JWT."""
    auth_code = db.query(AuthCode).filter(AuthCode.code == code).first()
    if not auth_code:
        raise HTTPException(status_code=404, detail="Code not found")

    expires = auth_code.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if auth_code.used or datetime.now(UTC) > expires:
        raise HTTPException(status_code=410, detail="Code expired or already used")

    if not auth_code.telegram_id:
        return JSONResponse(status_code=202, content={"status": "pending"})

    telegram_id = auth_code.telegram_id
    first_name  = auth_code.first_name or ""
    username    = auth_code.username
    photo_url   = auth_code.photo_url

    auth_code.used = True
    try:
        db.commit()
    except Exception:
        db.rollback()

    existing_profile = db.query(Profile).filter(Profile.telegram_id == telegram_id).first()
    has_any_photo  = bool(existing_profile and existing_profile.photo_url)
    has_first_name = bool(existing_profile and existing_profile.first_name)
    has_username   = bool(existing_profile and existing_profile.username)
    profile = _upsert_profile(
        db, telegram_id,
        app_last_login=datetime.now(UTC),
        **({"first_name": first_name} if not has_first_name else {}),
        **({"username":   username}   if not has_username   else {}),
        **({"photo_url":  photo_url}  if not has_any_photo  else {}),
    )
    token_data = create_access_token(telegram_id, profile.role or "student")
    return {
        "status": "ok", "telegram_id": telegram_id,
        "first_name": profile.first_name, "username": profile.username, "photo_url": profile.photo_url or photo_url,
        "email": profile.email,
        "role": profile.role or "student", "status_account": profile.status or "active",
        **token_data,
    }


# ── Teacher application flow ──────────────────────────────────────────────────

@router.post("/apply-teacher")
async def apply_teacher(
    body: ApplyTeacherRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    telegram_id = _require_bearer(authorization)
    profile = _get_profile(db, telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    if profile.role == "admin":
        raise HTTPException(status_code=400, detail="Admin cannot apply as teacher")
    if profile.role == "teacher" and profile.status == "active":
        return {"success": True, "already_applied": True, "status": "active"}
    if profile.status == "pending":
        return {"success": True, "already_applied": True, "status": "pending"}

    # Mark as pending WITHOUT granting teacher role — role is only set on admin approval
    profile.status = "pending"

    tp = db.query(TeacherProfile).filter(TeacherProfile.telegram_id == telegram_id).first()
    if tp is None:
        tp = TeacherProfile(telegram_id=telegram_id)
        db.add(tp)
    tp.specialization   = body.specialization
    tp.experience_years = body.experience_years
    tp.bio              = body.bio
    tp.course_idea      = body.course_idea
    tp.motivation       = body.motivation
    tp.contact          = body.contact.strip()
    tp.applied_at       = datetime.now(UTC)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ma'lumotlar bazasida xatolik")
    return {"success": True, "already_applied": False, "status": "pending"}


@router.get("/admin/teacher-requests")
async def list_teacher_requests(
    authorization: Optional[str] = Header(None), db: Session = Depends(get_db)
):
    _require_admin(db, authorization)
    profiles = db.query(Profile).filter(Profile.status == "pending").all()
    tids     = [p.telegram_id for p in profiles]
    tp_map   = {}
    if tids:
        tp_map = {
            tp.telegram_id: tp
            for tp in db.query(TeacherProfile).filter(TeacherProfile.telegram_id.in_(tids)).all()
        }
    return [
        {
            "telegram_id": p.telegram_id, "first_name": p.first_name,
            "username": p.site_username, "photo_url": p.photo_url,
            "total_xp": p.total_xp, "level": p.level,
            **(
                {
                    "specialization": tp_map[p.telegram_id].specialization,
                    "experience_years": tp_map[p.telegram_id].experience_years,
                    "bio": tp_map[p.telegram_id].bio,
                    "course_idea": tp_map[p.telegram_id].course_idea,
                    "motivation": tp_map[p.telegram_id].motivation,
                    "contact": tp_map[p.telegram_id].contact,
                    "applied_at": (
                        tp_map[p.telegram_id].applied_at.isoformat()
                        if tp_map[p.telegram_id].applied_at else None
                    ),
                }
                if p.telegram_id in tp_map else
                {"specialization": None, "experience_years": None, "bio": None,
                 "course_idea": None, "motivation": None, "contact": None, "applied_at": None}
            ),
        }
        for p in profiles
    ]


@router.post("/admin/approve-teacher/{target_telegram_id}")
async def approve_teacher(
    target_telegram_id: int,
    authorization: Optional[str] = Header(None), db: Session = Depends(get_db)
):
    _require_admin(db, authorization)
    profile = _get_profile(db, target_telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile.role = "teacher"
    profile.status = "active"
    db.commit()
    try:
        from app.api.v1.endpoints.notifications import send_notification
        await send_notification(
            target_telegram_id,
            "teacher_approved",
            "TIZIM",
            {"first_name": profile.first_name or ""},
        )
    except Exception:
        pass
    return {"success": True, "message": "Teacher approved", "telegram_id": target_telegram_id}


@router.post("/admin/reject-teacher/{target_telegram_id}")
async def reject_teacher(
    target_telegram_id: int,
    authorization: Optional[str] = Header(None), db: Session = Depends(get_db)
):
    _require_admin(db, authorization)
    profile = _get_profile(db, target_telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile.role = "student"
    profile.status = "active"
    db.commit()
    return {"success": True, "message": "Teacher application rejected", "telegram_id": target_telegram_id}


@router.get("/admin/users")
async def list_users(
    q: Optional[str] = None, limit: int = 50,
    authorization: Optional[str] = Header(None), db: Session = Depends(get_db)
):
    _require_admin(db, authorization)
    query = db.query(Profile)
    if q and q.strip():
        q = q.strip()
        try:
            query = query.filter(Profile.telegram_id == int(q))
        except ValueError:
            query = query.filter(
                or_(Profile.first_name.ilike(f"%{q}%"), Profile.username.ilike(f"%{q}%"))
            )
    profiles = query.order_by(Profile.app_created_at.desc()).limit(min(limit, 200)).all()
    return [
        {
            "telegram_id": p.telegram_id, "first_name": p.first_name,
            "username": p.site_username, "photo_url": p.photo_url,
            "role": p.role, "status": p.status,
            "total_xp": p.total_xp, "level": p.level,
            "app_created_at": p.app_created_at.isoformat() if p.app_created_at else None,
        }
        for p in profiles
    ]


@router.delete("/admin/users/{target_telegram_id}")
async def admin_delete_user(
    target_telegram_id: int,
    authorization: Optional[str] = Header(None), db: Session = Depends(get_db)
):
    admin_id = _require_admin(db, authorization)
    if admin_id == target_telegram_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    profile = _get_profile(db, target_telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    db.delete(profile)
    db.commit()
    return {"success": True, "deleted_id": target_telegram_id}


@router.patch("/admin/users/{target_telegram_id}/role")
async def set_user_role(
    target_telegram_id: int, body: SetUserRoleRequest,
    authorization: Optional[str] = Header(None), db: Session = Depends(get_db)
):
    _require_admin(db, authorization)
    for val, allowed, label in [
        (body.role,   {"student","teacher","admin"},       "role"),
        (body.status, {"active","pending","suspended"},    "status"),
    ]:
        if val not in allowed:
            raise HTTPException(status_code=400, detail=f"Invalid {label}: {val}")

    profile = _get_profile(db, target_telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile.role   = body.role
    profile.status = body.status
    db.commit()
    return {"success": True, "telegram_id": target_telegram_id, "role": body.role, "status": body.status}


# ── Email auth ────────────────────────────────────────────────────────────────

@router.post("/email-register")
async def email_register(body: EmailRegisterRequest, db: Session = Depends(get_db)):
    # Validate password complexity
    pw_errors = _validate_password(body.password)
    if pw_errors:
        raise HTTPException(status_code=400, detail="; ".join(pw_errors))

    email_lower = body.email.lower()
    if db.query(Profile).filter(Profile.email == email_lower).first():
        raise HTTPException(status_code=400, detail="Bu email allaqachon ro'yxatdan o'tgan")

    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    internal_id   = _email_to_internal_id(email_lower)
    _upsert_profile(
        db, internal_id,
        first_name=body.first_name.strip(), email=email_lower,
        password_hash=password_hash, role="student", status="active",
        email_verified=False,
        app_last_login=datetime.now(UTC),
    )

    # Create verification token and send email
    try:
        logger.info("[REGISTER] Creating auth token for user_id=%s email=%s", internal_id, email_lower)
        token_str = _create_auth_token(db, internal_id, "email_verification", hours=24)
        logger.info("[REGISTER] Auth token created: %s", token_str[:8] + "...")
    except Exception as exc:
        logger.error("[REGISTER] Failed to create auth token: %s", exc)
        token_str = None

    if token_str:
        try:
            from app.services.email_service import send_verification_email
            import concurrent.futures
            logger.info("[REGISTER] Sending verification email to %s", email_lower)
            # Run in thread pool so it doesn't block the async event loop
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(send_verification_email, email_lower, body.first_name.strip(), token_str)
                result = future.result(timeout=12)
            logger.info("[REGISTER] send_verification_email result: %s", result)
        except Exception as exc:
            logger.error("[REGISTER] Failed to send verification email: %s", exc)

    logger.info("[REGISTER] Registration complete for %s — returning pending_verification", email_lower)
    return {
        "status": "pending_verification",
        "email": email_lower,
        "message": "Ro'yxatdan o'tdingiz! Email manzilingizga tasdiqlash havolasi yuborildi.",
    }


@router.post("/email-login")
async def email_login(body: EmailLoginRequest, db: Session = Depends(get_db)):
    email_lower = body.email.lower()
    profile = db.query(Profile).filter(Profile.email == email_lower).first()
    if not profile:
        raise HTTPException(status_code=401, detail="Email yoki parol noto'g'ri")
    if not profile.password_hash:
        raise HTTPException(status_code=401, detail="Bu akkaunt parol bilan ro'yxatdan o'tmagan")
    if not bcrypt.checkpw(body.password.encode(), profile.password_hash.encode()):
        raise HTTPException(status_code=401, detail="Email yoki parol noto'g'ri")
    if profile.status == "suspended":
        raise HTTPException(status_code=403, detail="Akkauntingiz bloklangan")
    if not profile.email_verified:
        raise HTTPException(status_code=403, detail="EMAIL_NOT_VERIFIED")

    profile.app_last_login = datetime.now(UTC)
    try:
        db.commit()
    except Exception:
        db.rollback()

    token_data = create_access_token(profile.telegram_id, profile.role or "student")
    return {
        "status": "ok",
        "telegram_id": profile.telegram_id, "first_name": profile.first_name or "",
        "username": profile.site_username, "photo_url": profile.photo_url,
        "email": profile.email,
        "email_verified": profile.email_verified,
        "role": profile.role or "student", "status_account": profile.status or "active",
        **token_data,
    }


# ── Account linking ──────────────────────────────────────────────────────────

# Tables whose FK column references profiles.telegram_id (i.e. user_id).
# When merging an email-only profile into a Telegram profile we reassign
# all rows from the old user_id to the Telegram telegram_id.
_MERGEABLE_TABLES: list[tuple[type, str]] = []  # populated lazily below


def _get_mergeable_tables():
    """Import once to avoid circular-import issues."""
    global _MERGEABLE_TABLES
    if _MERGEABLE_TABLES:
        return _MERGEABLE_TABLES
    from app.models.models import (
        XpLog, UserBadge, PlannerTask, PlannerNote,
    )
    _MERGEABLE_TABLES = [
        (XpLog,        "user_id"),
        (UserBadge,    "user_id"),
        (PlannerTask,  "user_id"),
        (PlannerNote,  "user_id"),
    ]
    # Optional tables — may not exist in older deployments
    try:
        from app.models.models import BookPurchase
        _MERGEABLE_TABLES.append((BookPurchase, "user_id"))
    except ImportError:
        pass
    try:
        from app.models.models import BookReadProgress
        _MERGEABLE_TABLES.append((BookReadProgress, "user_id"))
    except ImportError:
        pass
    try:
        from app.models.models import Order
        _MERGEABLE_TABLES.append((Order, "user_id"))
    except ImportError:
        pass
    try:
        from app.models.models import UserQuizCompletion
        _MERGEABLE_TABLES.append((UserQuizCompletion, "user_id"))
    except ImportError:
        pass
    try:
        from app.models.models import Enrollment
        _MERGEABLE_TABLES.append((Enrollment, "user_id"))
    except ImportError:
        pass
    return _MERGEABLE_TABLES


def _merge_profiles(db: Session, primary_id: int, secondary_id: int) -> dict:
    """
    Merge *secondary_id* profile into *primary_id*.

    All child rows (purchases, XP logs, badges, …) are reassigned to
    *primary_id*.  XP / focus totals from the secondary profile are added
    to the primary.  The secondary profile row is then deleted.

    Returns a summary dict of how many rows were moved per table.
    """
    primary   = db.query(Profile).filter(Profile.telegram_id == primary_id).first()
    secondary = db.query(Profile).filter(Profile.telegram_id == secondary_id).first()
    if not primary or not secondary:
        return {"moved": {}}

    summary: dict[str, int] = {}
    for model, col_name in _get_mergeable_tables():
        col = getattr(model, col_name)
        rows = db.query(model).filter(col == secondary_id).all()
        for row in rows:
            setattr(row, col_name, primary_id)
        if rows:
            summary[model.__tablename__] = len(rows)

    # Accumulate gamification stats
    primary.total_xp          = (primary.total_xp or 0) + (secondary.total_xp or 0)
    primary.focus_seconds     = (primary.focus_seconds or 0) + (secondary.focus_seconds or 0)
    primary.quizzes_completed = (primary.quizzes_completed or 0) + (secondary.quizzes_completed or 0)
    primary.total_focus_minutes = (primary.total_focus_minutes or 0) + (secondary.total_focus_minutes or 0)
    # Keep the higher level
    if (secondary.level or 1) > (primary.level or 1):
        primary.level = secondary.level

    # Delete the secondary profile
    db.delete(secondary)
    return {"moved": summary}


@router.post("/link-email")
async def link_email(
    body: LinkEmailRequest,
    authorization: str = Header(None),
    db: Session = Depends(get_db),
):
    """
    Link an email address to the currently-authenticated (Telegram / Google)
    profile.  If the email already belongs to a standalone email-registered
    account, merge that account's purchases, XP, and data into this profile.

    The caller's telegram_id remains the canonical primary key for all data.
    """
    telegram_id = _require_bearer(authorization)
    profile = _get_profile(db, telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile topilmadi")

    email_lower = body.email.lower().strip()

    # ── Already linked to this same profile? ──────────────────────────────
    if profile.email and profile.email.lower() == email_lower:
        return {"ok": True, "email": profile.email, "merged": False,
                "message": "Bu email allaqachon sizning akkauntingizga ulangan"}

    # ── Check if email is used by ANOTHER profile ─────────────────────────
    existing = db.query(Profile).filter(
        Profile.email == email_lower,
        Profile.telegram_id != telegram_id,
    ).first()

    merged_summary: dict = {}
    if existing:
        # If the other profile has a real Telegram id (positive = real TG user),
        # we cannot silently steal it — that would break the other user's access.
        if existing.telegram_id > 0:
            raise HTTPException(
                status_code=409,
                detail="Bu email boshqa Telegram akkauntiga ulangan. "
                       "Agar bu sizning emailingiz bo'lsa, avval o'sha akkauntdan "
                       "emailni ajrating yoki adminga murojaat qiling.",
            )
        # The other profile was created via email-register (negative synthetic id)
        # → safe to merge into the Telegram profile.
        merged_summary = _merge_profiles(db, primary_id=telegram_id, secondary_id=existing.telegram_id)

    # ── Attach email to the primary profile (unverified until confirmed) ──
    profile.email = email_lower
    profile.email_verified = False
    try:
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ma'lumotlar bazasi xatoligi")

    # Send verification email
    try:
        token_str = _create_auth_token(db, telegram_id, "email_verification", hours=24)
        from app.services.email_service import send_verification_email
        send_verification_email(email_lower, profile.first_name or "", token_str)
    except Exception as exc:
        logger.error("link-email: failed to send verification email: %s", exc)

    merged = bool(merged_summary.get("moved"))
    logger.info(
        "link-email: user %s linked email %s (merged=%s, summary=%s)",
        telegram_id, email_lower, merged, merged_summary,
    )
    return {
        "ok": True,
        "email": profile.email,
        "email_verified": False,
        "merged": merged,
        "merge_summary": merged_summary.get("moved", {}),
        "message": (
            "Akkauntlar birlashtirildi. Emailni tasdiqlash uchun pochta qutingizni tekshiring."
            if merged else
            "Tasdiqlash havolasi emailingizga yuborildi"
        ),
        "verification_sent": True,
    }


# ══════════════════════════════════════════════════════════════════════════════
# EMAIL VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/verify-email")
async def verify_email(token: str, db: Session = Depends(get_db)):
    """Verify email address using the one-time token from the verification email."""
    auth_token = (
        db.query(AuthToken)
        .filter(AuthToken.token == token, AuthToken.type == "email_verification")
        .first()
    )
    if not auth_token:
        raise HTTPException(status_code=400, detail="Havola noto'g'ri yoki muddati o'tgan")
    if auth_token.used_at is not None:
        raise HTTPException(status_code=400, detail="Bu havola allaqachon ishlatilgan")

    expires = auth_token.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if datetime.now(UTC) > expires:
        raise HTTPException(status_code=410, detail="Havola muddati o'tgan. Yangi havola so'rang.")

    # Mark token used
    auth_token.used_at = datetime.now(UTC)

    # Verify the user's email
    profile = db.query(Profile).filter(Profile.telegram_id == auth_token.user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    profile.email_verified = True
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ma'lumotlar bazasi xatoligi")

    # Send welcome email (best-effort)
    try:
        from app.services.email_service import send_welcome_email
        send_welcome_email(profile.email or "", profile.first_name or "")
    except Exception:
        pass

    return {
        "ok": True,
        "message": "Email tasdiqlandi! Endi tizimga kirishingiz mumkin.",
        "email": profile.email,
        "first_name": profile.first_name,
    }


@router.post("/resend-verification")
async def resend_verification(body: ResendVerificationRequest, db: Session = Depends(get_db)):
    """Resend email verification link. Max 3 per hour per email."""
    email_lower = body.email.lower().strip()
    profile = db.query(Profile).filter(Profile.email == email_lower).first()

    # Always return success — don't reveal if email exists
    if not profile:
        return {"ok": True, "message": "Agar bu email ro'yxatdan o'tgan bo'lsa, tasdiqlash havolasi yuborildi."}

    if profile.email_verified:
        return {"ok": True, "message": "Email allaqachon tasdiqlangan."}

    # Rate limit: count tokens created in last hour
    one_hour_ago = datetime.now(UTC) - timedelta(hours=1)
    recent = (
        db.query(AuthToken)
        .filter(
            AuthToken.user_id == profile.telegram_id,
            AuthToken.type == "email_verification",
            AuthToken.created_at >= one_hour_ago,
        )
        .count()
    )
    if recent >= 3:
        raise HTTPException(status_code=429, detail="Juda ko'p urinish. 1 soatdan keyin qayta urinib ko'ring.")

    try:
        token_str = _create_auth_token(db, profile.telegram_id, "email_verification", hours=24)
        from app.services.email_service import send_verification_email
        send_verification_email(email_lower, profile.first_name or "", token_str)
    except Exception as exc:
        logger.error("resend_verification failed: %s", exc)

    return {"ok": True, "message": "Tasdiqlash havolasi qayta yuborildi."}


# ══════════════════════════════════════════════════════════════════════════════
# PASSWORD RESET
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Request a password reset email. Always returns the same message (no info leak)."""
    email_lower = body.email.lower().strip()
    generic_ok = {"ok": True, "message": "Agar bu email ro'yxatdan o'tgan bo'lsa, parolni tiklash havolasi yuborildi."}

    profile = db.query(Profile).filter(Profile.email == email_lower).first()
    if not profile or not profile.password_hash:
        return generic_ok  # Don't reveal non-existence

    # Rate limit: 3 reset requests per hour
    one_hour_ago = datetime.now(UTC) - timedelta(hours=1)
    recent = (
        db.query(AuthToken)
        .filter(
            AuthToken.user_id == profile.telegram_id,
            AuthToken.type == "password_reset",
            AuthToken.created_at >= one_hour_ago,
        )
        .count()
    )
    if recent >= 3:
        raise HTTPException(status_code=429, detail="Juda ko'p urinish. 1 soatdan keyin qayta urinib ko'ring.")

    try:
        token_str = _create_auth_token(db, profile.telegram_id, "password_reset", hours=1)
        from app.services.email_service import send_password_reset_email
        send_password_reset_email(email_lower, profile.first_name or "", token_str)
    except Exception as exc:
        logger.error("forgot_password email send failed: %s", exc)

    return generic_ok


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Set a new password using the one-time reset token."""
    auth_token = (
        db.query(AuthToken)
        .filter(AuthToken.token == body.token, AuthToken.type == "password_reset")
        .first()
    )
    if not auth_token:
        raise HTTPException(status_code=400, detail="Havola noto'g'ri yoki muddati o'tgan")
    if auth_token.used_at is not None:
        raise HTTPException(status_code=400, detail="Bu havola allaqachon ishlatilgan")

    expires = auth_token.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    if datetime.now(UTC) > expires:
        raise HTTPException(status_code=410, detail="Havola muddati o'tgan. Yangi havola so'rang.")

    pw_errors = _validate_password(body.new_password)
    if pw_errors:
        raise HTTPException(status_code=400, detail="; ".join(pw_errors))

    profile = db.query(Profile).filter(Profile.telegram_id == auth_token.user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    # Mark token used + update password
    auth_token.used_at = datetime.now(UTC)
    profile.password_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    profile.password_changed_at = datetime.now(UTC)

    # Invalidate all other reset tokens for this user
    db.query(AuthToken).filter(
        AuthToken.user_id == profile.telegram_id,
        AuthToken.type == "password_reset",
        AuthToken.id != auth_token.id,
        AuthToken.used_at.is_(None),
    ).update({"used_at": datetime.now(UTC)})

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ma'lumotlar bazasi xatoligi")

    return {"ok": True, "message": "Parol muvaffaqiyatli o'zgartirildi!"}


# ══════════════════════════════════════════════════════════════════════════════
# CHANGE PASSWORD (logged-in users)
# ══════════════════════════════════════════════════════════════════════════════

@router.put("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Change password for a logged-in email-registered user."""
    telegram_id = _require_bearer(authorization)
    profile = _get_profile(db, telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    if not profile.password_hash:
        raise HTTPException(status_code=400, detail="Bu akkaunt parol bilan ro'yxatdan o'tmagan")

    if not bcrypt.checkpw(body.current_password.encode(), profile.password_hash.encode()):
        raise HTTPException(status_code=401, detail="Joriy parol noto'g'ri")

    if body.current_password == body.new_password:
        raise HTTPException(status_code=400, detail="Yangi parol eski paroldan farqli bo'lishi kerak")

    pw_errors = _validate_password(body.new_password)
    if pw_errors:
        raise HTTPException(status_code=400, detail="; ".join(pw_errors))

    profile.password_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    profile.password_changed_at = datetime.now(UTC)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ma'lumotlar bazasi xatoligi")

    return {"ok": True, "message": "Parol o'zgartirildi"}


@router.post("/set-password")
async def set_password(
    body: NewPasswordRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Set a password for the first time (no current password required).
    Requires: authenticated user + email_verified=True + no existing password."""
    telegram_id = _require_bearer(authorization)
    profile = _get_profile(db, telegram_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")
    if not profile.email_verified:
        raise HTTPException(status_code=403, detail="Avval emailingizni tasdiqlang")
    if profile.password_hash:
        raise HTTPException(status_code=400, detail="Parol allaqachon o'rnatilgan. Parolni o'zgartirish uchun change-password dan foydalaning")

    pw_errors = _validate_password(body.new_password)
    if pw_errors:
        raise HTTPException(status_code=400, detail="; ".join(pw_errors))

    profile.password_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    profile.password_changed_at = datetime.now(UTC)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ma'lumotlar bazasi xatoligi")

    return {"ok": True, "message": "Parol o'rnatildi. Endi email va parol bilan kirishingiz mumkin."}

