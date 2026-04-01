"""
Teacher profile endpoints.

GET  /api/teacher/profile  — fetch own teacher_profiles row (auto-creates on first call)
PUT  /api/teacher/profile  — update bio, specialization, social_links
GET  /api/teacher/profile/{telegram_id}  — public: fetch any teacher's profile (for course pages)
"""
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from pydantic import BaseModel
import os
import httpx

from app.services.auth_service import decode_token

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def _headers() -> dict:
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
            detail="Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)",
        )


async def _resolve_telegram_id(authorization: Optional[str]) -> int:
    """Decode Bearer JWT → telegram_id."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return telegram_id


async def _require_teacher_or_admin(telegram_id: int):
    """Verify that the token owner is a teacher (active) or admin."""
    _ensure_supabase()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}", "select": "role,status"},
                headers=_headers(),
            )
            profile = (res.json() or [{}])[0] if res.status_code == 200 else {}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    role   = profile.get("role", "student")
    status = profile.get("status", "active")

    if role not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Teacher or admin access required")
    if role == "teacher" and status == "pending":
        raise HTTPException(status_code=403, detail="Teacher account pending admin approval")


class TeacherProfileUpdate(BaseModel):
    bio:            Optional[str]  = None
    specialization: Optional[str]  = None
    social_links:   Optional[dict] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _fetch_row(telegram_id: int) -> Optional[dict]:
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/teacher_profiles",
            params={"telegram_id": f"eq.{telegram_id}", "select": "*"},
            headers=_headers(),
        )
        rows = res.json() if res.status_code == 200 else []
    return rows[0] if rows else None


async def _ensure_row(telegram_id: int) -> dict:
    """Fetch existing row or create an empty one on first access."""
    row = await _fetch_row(telegram_id)
    if row:
        return row

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/teacher_profiles",
            json={"telegram_id": telegram_id},
            headers=_headers(),
        )
        if res.status_code not in (200, 201):
            raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
        created = res.json()
        return created[0] if isinstance(created, list) else created


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_own_teacher_profile(authorization: Optional[str] = Header(None)):
    """
    Fetch (or auto-create) the calling teacher's teacher_profiles row.
    Requires: role = teacher (active) or admin.
    """
    _ensure_supabase()
    telegram_id = await _resolve_telegram_id(authorization)
    await _require_teacher_or_admin(telegram_id)
    try:
        return await _ensure_row(telegram_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.put("/profile")
async def update_teacher_profile(
    body: TeacherProfileUpdate,
    authorization: Optional[str] = Header(None),
):
    """
    Update own teacher profile (bio, specialization, social_links).
    Uses Supabase upsert so the row is created if it doesn't exist.
    """
    _ensure_supabase()
    telegram_id = await _resolve_telegram_id(authorization)
    await _require_teacher_or_admin(telegram_id)

    patch: dict = {"telegram_id": telegram_id}
    if body.bio is not None:
        patch["bio"] = body.bio.strip()
    if body.specialization is not None:
        patch["specialization"] = body.specialization.strip()
    if body.social_links is not None:
        patch["social_links"] = body.social_links

    if len(patch) == 1:  # only telegram_id — nothing to update
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        upsert_headers = {
            **_headers(),
            "Prefer": "return=representation,resolution=merge-duplicates",
        }
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{SUPABASE_URL}/rest/v1/teacher_profiles",
                json=patch,
                headers=upsert_headers,
            )
            if res.status_code not in (200, 201):
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
            updated = res.json()
            return updated[0] if isinstance(updated, list) else updated
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")


@router.get("/profile/{target_telegram_id}")
async def get_public_teacher_profile(target_telegram_id: int):
    """
    Public endpoint: fetch any teacher's profile by Telegram ID.
    Used on course detail pages to show teacher info.
    No auth required.
    """
    _ensure_supabase()
    try:
        row = await _fetch_row(target_telegram_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    if not row:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    return row
