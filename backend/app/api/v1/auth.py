"""
auth.py — SAHIFALAB authentication endpoints.

All profile/user data is accessed via SQLAlchemy ORM (direct Postgres TCP),
bypassing Supabase's REST API entirely — unaffected by cached-egress quota.
"""
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
from sqlalchemy import or_

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

from app.core.config import settings
from app.db.session import get_db
from app.models.models import Profile, AuthCode, TeacherProfile
from app.services.auth_service import (
    TelegramAuthData,
    verify_telegram_auth,
    create_access_token,
    decode_token,
    decode_token_payload,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

BOT_TOKEN        = os.getenv("TELEGRAM_BOT_TOKEN", "")
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
BOT_USERNAME     = os.getenv("BOT_USERNAME", "Sahifalab_hub_bot")
CODE_TTL_MINUTES = 10


# ── Pydantic models ───────────────────────────────────────────────────────────

class GoogleSignInRequest(BaseModel):
    id_token: str

class PhotoUpdateRequest(BaseModel):
    photo_url: HttpUrl

class ProfileUpdateRequest(BaseModel):
    first_name: Optional[str] = None
    username:   Optional[str] = None
    bio:        Optional[str] = None
    about_me:   Optional[str] = None

class ApplyTeacherRequest(BaseModel):
    specialization:   str
    experience_years: int
    bio:              str
    course_idea:      str
    motivation:       str

class SetUserRoleRequest(BaseModel):
    role:   str
    status: str = "active"

class EmailRegisterRequest(BaseModel):
    first_name: str
    email:      EmailStr
    password:   str

class EmailLoginRequest(BaseModel):
    email:    EmailStr
    password: str


# ── ORM helpers ───────────────────────────────────────────────────────────────

def _get_profile(db: Session, telegram_id: int) -> Optional[Profile]:
    return db.query(Profile).filter(Profile.telegram_id == telegram_id).first()


def _upsert_profile(db: Session, telegram_id: int, **kwargs) -> Profile:
    """Create or update a profile row via ORM (no Supabase REST involved)."""
    profile = db.query(Profile).filter(Profile.telegram_id == telegram_id).first()
    if profile is None:
        if "app_created_at" not in kwargs:
            kwargs["app_created_at"] = datetime.now(UTC)
        profile = Profile(telegram_id=telegram_id, **kwargs)
        db.add(profile)
    else:
        for key, value in kwargs.items():
            setattr(profile, key, value)
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

@router.post("/telegram")
async def telegram_login(data: TelegramAuthData, db: Session = Depends(get_db)):
    """Authenticate with Telegram Login Widget data."""
    if not verify_telegram_auth(data, BOT_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid Telegram authentication")

    profile = _upsert_profile(
        db, data.id,
        first_name=data.first_name, username=data.username,
        photo_url=data.photo_url, app_last_login=datetime.now(UTC),
    )
    token_data = create_access_token(data.id, profile.role or "student")
    return {
        "success": True, "telegram_id": data.id,
        "first_name": data.first_name, "username": data.username,
        "photo_url": data.photo_url or profile.photo_url,
        "role": profile.role or "student", "status": profile.status or "active",
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
        "telegram_id": profile.telegram_id, "first_name": profile.first_name,
        "username": profile.username, "photo_url": profile.photo_url,
        "role": profile.role or "student", "status": profile.status or "active",
        "level": profile.level or 1, "total_xp": profile.total_xp or 0,
        "bio": getattr(profile, "bio", None),
        "about_me": getattr(profile, "about_me", None),
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
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    sub = idinfo.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid Google token payload")

    telegram_id = _google_sub_to_internal_id(sub)
    first_name  = idinfo.get("given_name") or idinfo.get("name") or "Google User"
    email       = idinfo.get("email")
    username    = email.split("@")[0] if isinstance(email, str) and "@" in email else None
    photo_url   = idinfo.get("picture")

    profile = _upsert_profile(
        db, telegram_id, first_name=first_name, username=username,
        photo_url=photo_url, app_last_login=datetime.now(UTC),
    )
    token_data = create_access_token(telegram_id, profile.role or "student")
    return {
        "status": "ok", "telegram_id": telegram_id,
        "first_name": first_name, "username": username, "photo_url": photo_url,
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
    if not payload:
        return {"ok": True}
    _upsert_profile(db, telegram_id, **payload)
    return {"ok": True, **payload}


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

    async with httpx.AsyncClient(timeout=60.0) as client:
        put_res = await client.put(
            put_url, content=file_bytes,
            headers={
                "AccessKey": settings.BUNNY_API_KEY,
                "Content-Type": upload_content_type,
                "Content-Length": str(len(file_bytes)),
            },
        )
    if put_res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Bunny upload error: {put_res.text[:200]}")

    public_url = f"https://{settings.BUNNY_CDN_HOSTNAME.rstrip('/')}/{remote_path}"
    _upsert_profile(db, telegram_id, photo_url=public_url)
    return {"ok": True, "photo_url": public_url, "remote_path": remote_path}


@router.post("/logout")
async def logout(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    return {"success": True, "message": "Logged out"}


# ── Bot-code auth flow ────────────────────────────────────────────────────────

@router.post("/request-code")
async def request_code(db: Session = Depends(get_db)):
    """Generate a one-time login code for the bot flow."""
    code       = secrets.token_hex(4)
    expires_at = datetime.now(UTC) + timedelta(minutes=CODE_TTL_MINUTES)
    db.add(AuthCode(code=code, expires_at=expires_at))
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    return {
        "code": code,
        "bot_link": f"https://t.me/{BOT_USERNAME}?start=auth_{code}",
        "expires_in_seconds": CODE_TTL_MINUTES * 60,
    }


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

    profile = _upsert_profile(
        db, telegram_id, first_name=first_name, username=username,
        photo_url=photo_url, app_last_login=datetime.now(UTC),
    )
    token_data = create_access_token(telegram_id, profile.role or "student")
    return {
        "status": "ok", "telegram_id": telegram_id,
        "first_name": first_name, "username": username, "photo_url": photo_url,
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
    if profile.role == "teacher":
        return {"success": True, "already_applied": True, "status": profile.status}

    profile.role = "teacher"
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
    tp.applied_at       = datetime.now(UTC)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    return {"success": True, "already_applied": False, "status": "pending"}


@router.get("/admin/teacher-requests")
async def list_teacher_requests(
    authorization: Optional[str] = Header(None), db: Session = Depends(get_db)
):
    _require_admin(db, authorization)
    profiles = db.query(Profile).filter(Profile.role == "teacher", Profile.status == "pending").all()
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
            "username": p.username, "photo_url": p.photo_url,
            "total_xp": p.total_xp, "level": p.level,
            **(
                {
                    "specialization": tp_map[p.telegram_id].specialization,
                    "experience_years": tp_map[p.telegram_id].experience_years,
                    "bio": tp_map[p.telegram_id].bio,
                    "course_idea": tp_map[p.telegram_id].course_idea,
                    "motivation": tp_map[p.telegram_id].motivation,
                    "applied_at": (
                        tp_map[p.telegram_id].applied_at.isoformat()
                        if tp_map[p.telegram_id].applied_at else None
                    ),
                }
                if p.telegram_id in tp_map else
                {"specialization": None, "experience_years": None, "bio": None,
                 "course_idea": None, "motivation": None, "applied_at": None}
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
            "username": p.username, "photo_url": p.photo_url,
            "role": p.role, "status": p.status,
            "total_xp": p.total_xp, "level": p.level,
            "app_created_at": p.app_created_at.isoformat() if p.app_created_at else None,
        }
        for p in profiles
    ]


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
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Parol kamida 6 ta belgidan iborat bo'lishi kerak")
    email_lower = body.email.lower()
    if db.query(Profile).filter(Profile.email == email_lower).first():
        raise HTTPException(status_code=400, detail="Bu email allaqachon ro'yxatdan o'tgan")
    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    internal_id   = _email_to_internal_id(email_lower)
    _upsert_profile(
        db, internal_id,
        first_name=body.first_name.strip(), email=email_lower,
        password_hash=password_hash, role="student", status="active",
        app_last_login=datetime.now(UTC),
    )
    token_data = create_access_token(internal_id, "student")
    return {
        "status": "ok", "telegram_id": internal_id,
        "first_name": body.first_name.strip(), "email": email_lower,
        "username": None, "photo_url": None,
        "role": "student", "status_account": "active",
        **token_data,
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

    profile.app_last_login = datetime.now(UTC)
    try:
        db.commit()
    except Exception:
        db.rollback()

    token_data = create_access_token(profile.telegram_id, profile.role or "student")
    return {
        "status": "ok",
        "telegram_id": profile.telegram_id, "first_name": profile.first_name or "",
        "username": profile.username, "photo_url": profile.photo_url,
        "role": profile.role or "student", "status_account": profile.status or "active",
        **token_data,
    }

