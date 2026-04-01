"""
SAHIFALAB — Teacher profile endpoints

Routes (all require Bearer JWT):
  GET  /api/teacher/profile          — get own teacher_profiles row (auto-created on first call)
  PATCH /api/teacher/profile         — update bio, specialization, etc.
  GET  /api/teacher/profile/{id}     — public read of any teacher's profile (no auth)
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, HttpUrl
from typing import Optional
import os
import logging
import httpx
from datetime import datetime, UTC

from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)

router = APIRouter()

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
            detail="Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)",
        )


async def _get_telegram_id(authorization: Optional[str]) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return telegram_id


async def _get_profile_row(telegram_id: int) -> dict:
    """Fetch teacher_profiles row; returns {} if not found."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/teacher_profiles",
            params={"telegram_id": f"eq.{telegram_id}", "select": "*"},
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    return rows[0] if isinstance(rows, list) and rows else {}


async def _create_profile_row(telegram_id: int) -> dict:
    """Insert a fresh teacher_profiles row and return it."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/teacher_profiles",
            json={"telegram_id": telegram_id},
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code in (200, 201) else []
    if not rows:
        raise HTTPException(status_code=500, detail=f"Failed to create teacher profile: {res.text}")
    return rows[0]


async def _get_teacher_courses(teacher_id: int) -> list[dict]:
    """Fetch all courses owned by teacher."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={
                "teacher_id": f"eq.{teacher_id}",
                "select": "id, title, is_published, is_paid, enrolled_count, price, created_at",
                "order": "created_at.desc",
            },
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
    return res.json() if isinstance(res.json(), list) else []


# ── Schemas ──────────────────────────────────────────────────────────────────

class TeacherProfileUpdate(BaseModel):
    bio:              Optional[str] = None
    specialization:   Optional[str] = None
    experience_years: Optional[int] = None
    education:        Optional[str] = None
    website_url:      Optional[str] = None
    youtube_url:      Optional[str] = None
    telegram_channel: Optional[str] = None
    profile_complete: Optional[bool] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_own_teacher_profile(authorization: Optional[str] = Header(None)):
    """
    Get the calling teacher's profile.
    If no row exists yet, one is auto-created with default values.
    Requires role=teacher or role=admin (enforced by frontend RoleGuard;
    backend trusts the JWT but doesn't re-check role here).
    """
    _ensure_supabase()
    telegram_id = await _get_telegram_id(authorization)

    row = await _get_profile_row(telegram_id)
    if not row:
        row = await _create_profile_row(telegram_id)

    return row


@router.patch("/profile")
async def update_own_teacher_profile(
    data: TeacherProfileUpdate,
    authorization: Optional[str] = Header(None),
):
    """
    Update the calling teacher's profile fields.
    Auto-creates the row if it doesn't exist yet.
    Sets profile_complete=true automatically when all required fields are filled.
    """
    _ensure_supabase()
    telegram_id = await _get_telegram_id(authorization)

    # Ensure row exists
    existing = await _get_profile_row(telegram_id)
    if not existing:
        await _create_profile_row(telegram_id)

    update_payload = {k: v for k, v in data.model_dump().items() if v is not None}

    # Auto-mark complete if required fields are set
    merged = {**existing, **update_payload}
    if (
        merged.get("bio", "").strip() and
        merged.get("specialization", "").strip() and
        update_payload.get("profile_complete") is None  # don't override explicit flag
    ):
        update_payload["profile_complete"] = True

    if not update_payload:
        return existing

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.patch(
                f"{SUPABASE_URL}/rest/v1/teacher_profiles",
                params={"telegram_id": f"eq.{telegram_id}"},
                json=update_payload,
                headers=_supabase_headers(),
            )
            if res.status_code not in (200, 204):
                raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")

    return await _get_profile_row(telegram_id)


@router.get("/profile/{telegram_id}")
async def get_teacher_profile_by_id(telegram_id: int):
    """
    Public endpoint — fetch any teacher's profile by telegram_id.
    Used on public course / teacher pages.
    """
    _ensure_supabase()
    row = await _get_profile_row(telegram_id)
    if not row:
        raise HTTPException(status_code=404, detail="Teacher profile not found")
    return row


@router.get("/analytics")
async def get_teacher_analytics(authorization: Optional[str] = Header(None)):
    """
    Return aggregate analytics for the calling teacher:
      - courses/enrollments totals
      - completed paid orders (Telegram Stars)
      - estimated earnings in UZS
      - recent payment orders list
    """
    _ensure_supabase()
    teacher_id = await _get_telegram_id(authorization)

    courses = await _get_teacher_courses(teacher_id)
    course_ids = [c.get("id") for c in courses if c.get("id") is not None]

    total_students = sum(int(c.get("enrolled_count") or 0) for c in courses)
    published_courses = sum(1 for c in courses if c.get("is_published"))
    paid_courses = sum(1 for c in courses if c.get("is_paid"))

    gross_stars = 0
    completed_orders = 0
    recent_orders: list[dict] = []

    if course_ids:
        ids_csv = ",".join(str(x) for x in course_ids)
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/course_payment_orders",
                params={
                    "course_id": f"in.({ids_csv})",
                    "status": "eq.completed",
                    "select": "order_id, course_id, student_id, amount, currency, status, created_at, completed_at",
                    "order": "created_at.desc",
                    "limit": "200",
                },
                headers={**_supabase_headers(), "Prefer": "count=exact"},
            )
        if res.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Supabase error: {res.text}")

        orders = res.json() if isinstance(res.json(), list) else []
        completed_orders = int(res.headers.get("content-range", "0/0").split("/")[-1] or 0)
        gross_stars = sum(int(o.get("amount") or 0) for o in orders if o.get("currency") == "XTR")
        recent_orders = orders[:20]

    # Approximate conversion (same as payments module): 1 Star ≈ 250 UZS
    estimated_revenue_uzs = gross_stars * 250

    return {
        "teacher_id": teacher_id,
        "courses_count": len(courses),
        "published_courses": published_courses,
        "paid_courses": paid_courses,
        "total_students": total_students,
        "completed_orders": completed_orders,
        "gross_stars": gross_stars,
        "estimated_revenue_uzs": estimated_revenue_uzs,
        "recent_orders": recent_orders,
    }
