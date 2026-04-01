"""
SAHIFALAB — Courses endpoints

Public routes (no auth):
  GET  /api/courses                  — list published courses (filters: category, level, search, teacher_id)
  GET  /api/courses/categories       — list all categories
  GET  /api/courses/{id}             — course detail (published, or own unpublished)
  GET  /api/courses/{id}/reviews     — list ratings/reviews for a course

Auth routes (Bearer JWT):
  POST   /api/courses/{id}/rate      — enrolled student submits/updates a rating + review
  GET    /api/courses/{id}/my-rating — current user's own rating for a course

Teacher/Admin routes (Bearer JWT required):
  POST   /api/courses                — create course (teacher/admin only)
  PATCH  /api/courses/{id}           — update course (owner or admin)
  DELETE /api/courses/{id}           — delete course (owner or admin)
  GET    /api/courses/mine           — list calling teacher's own courses (all statuses)
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional, List
import os
import logging
import httpx
import re

from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

ADMIN_IDS: list[int] = []
_raw = os.getenv("ADMIN_TELEGRAM_IDS", "")
if _raw:
    try:
        import json
        ADMIN_IDS = json.loads(_raw) if _raw.startswith("[") else [int(x.strip()) for x in _raw.split(",") if x.strip()]
    except Exception:
        pass


# ── Helpers ───────────────────────────────────────────────────────────────────

def _supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _ensure_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=503, detail="Supabase not configured")


async def _resolve_teacher_id(authorization: Optional[str]) -> int:
    """Decode JWT and return telegram_id; raises 401 if invalid."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return tid


async def _get_caller_role(telegram_id: int) -> str:
    """Return caller's role from profiles table."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"telegram_id": f"eq.{telegram_id}", "select": "role"},
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    return rows[0].get("role", "student") if rows else "student"


def _slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    text = re.sub(r"-+", "-", text)
    return text


# ── Schemas ───────────────────────────────────────────────────────────────────

class CourseCreate(BaseModel):
    title:                  str
    description:            Optional[str] = ""
    category_id:            Optional[int] = None
    thumbnail_url:          Optional[str] = ""
    price:                  Optional[float] = 0.0
    is_paid:                Optional[bool] = False
    level:                  Optional[str] = "beginner"   # beginner|intermediate|advanced
    language:               Optional[str] = "uz"
    is_published:           Optional[bool] = False


class CourseUpdate(BaseModel):
    title:                  Optional[str] = None
    description:            Optional[str] = None
    category_id:            Optional[int] = None
    thumbnail_url:          Optional[str] = None
    price:                  Optional[float] = None
    is_paid:                Optional[bool] = None
    level:                  Optional[str] = None
    language:               Optional[str] = None
    is_published:           Optional[bool] = None
    total_lessons:          Optional[int] = None
    total_duration_minutes: Optional[int] = None


class CourseRateBody(BaseModel):
    rating: int                 # 1–5
    review: Optional[str] = ""  # optional text review


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/categories")
async def list_categories():
    """Public: list all categories ordered by sort_order."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/categories",
            params={"select": "*", "order": "sort_order.asc"},
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase error: {res.text}")
    return res.json()


@router.get("/mine")
async def list_my_courses(authorization: Optional[str] = Header(None)):
    """Teacher: list all own courses regardless of published status."""
    teacher_id = await _resolve_teacher_id(authorization)
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={
                "teacher_id": f"eq.{teacher_id}",
                "select": "*, categories(name, slug, icon)",
                "order": "created_at.desc",
            },
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase error: {res.text}")
    return res.json()


@router.get("/{course_id}")
async def get_course(course_id: int, authorization: Optional[str] = Header(None)):
    """Public: get a published course. Owner/admin can also see unpublished."""
    _ensure_supabase()

    # Determine caller identity (optional auth)
    caller_id: Optional[int] = None
    if authorization:
        try:
            caller_id = await _resolve_teacher_id(authorization)
        except HTTPException:
            pass

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={
                "id": f"eq.{course_id}",
                "select": "*, categories(name, slug, icon)",
            },
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase error: {res.text}")
    rows = res.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Course not found")
    course = rows[0]

    # Gate unpublished courses to owner or admin
    if not course["is_published"]:
        if caller_id is None:
            raise HTTPException(status_code=404, detail="Course not found")
        if caller_id != course["teacher_id"] and caller_id not in ADMIN_IDS:
            raise HTTPException(status_code=404, detail="Course not found")

    return course


@router.get("")
async def list_courses(
    category:   Optional[str] = Query(None, description="Category slug"),
    level:      Optional[str] = Query(None, description="beginner|intermediate|advanced"),
    search:     Optional[str] = Query(None, description="Title search (case-insensitive)"),
    teacher_id: Optional[int] = Query(None, description="Filter by teacher telegram_id"),
    limit:      int           = Query(20, ge=1, le=100),
    offset:     int           = Query(0, ge=0),
):
    """Public: list published courses with optional filters."""
    _ensure_supabase()

    params: dict = {
        "is_published": "eq.true",
        "select": "id, teacher_id, category_id, title, slug, description, thumbnail_url, "
                  "price, is_paid, level, language, total_lessons, total_duration_minutes, "
                  "enrolled_count, rating, created_at, categories(name, slug, icon)",
        "order": "created_at.desc",
        "limit": str(limit),
        "offset": str(offset),
    }
    if level:
        params["level"] = f"eq.{level}"
    if teacher_id:
        params["teacher_id"] = f"eq.{teacher_id}"
    if search:
        params["title"] = f"ilike.*{search}*"

    # Category slug filter requires a join via category_id; we resolve slug → id first
    if category:
        async with httpx.AsyncClient(timeout=10) as client:
            cat_res = await client.get(
                f"{SUPABASE_URL}/rest/v1/categories",
                params={"slug": f"eq.{category}", "select": "id"},
                headers=_supabase_headers(),
            )
        cat_rows = cat_res.json() if cat_res.status_code == 200 else []
        if cat_rows:
            params["category_id"] = f"eq.{cat_rows[0]['id']}"

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params=params,
            headers={**_supabase_headers(), "Prefer": "count=exact"},
        )
    if res.status_code not in (200, 206):
        raise HTTPException(status_code=502, detail=f"Supabase error: {res.text}")

    total = int(res.headers.get("content-range", "0/0").split("/")[-1] or 0)
    return {"courses": res.json(), "total": total, "limit": limit, "offset": offset}


@router.post("")
async def create_course(
    body: CourseCreate,
    authorization: Optional[str] = Header(None),
):
    """Teacher/Admin: create a new course."""
    teacher_id = await _resolve_teacher_id(authorization)
    role = await _get_caller_role(teacher_id)
    if role not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Only teachers can create courses")

    _ensure_supabase()

    # Build slug from title + teacher_id for uniqueness
    base_slug = _slugify(body.title)
    slug = f"{base_slug}-{teacher_id}"

    payload = {
        "teacher_id":    teacher_id,
        "title":         body.title,
        "slug":          slug,
        "description":   body.description or "",
        "thumbnail_url": body.thumbnail_url or "",
        "price":         float(body.price or 0),
        "is_paid":       bool(body.is_paid),
        "level":         body.level or "beginner",
        "language":      body.language or "uz",
        "is_published":  bool(body.is_published),
    }
    if body.category_id:
        payload["category_id"] = body.category_id

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/courses",
            json=payload,
            headers=_supabase_headers(),
        )
    if res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Failed to create course: {res.text}")
    rows = res.json()
    return rows[0] if isinstance(rows, list) else rows


@router.patch("/{course_id}")
async def update_course(
    course_id: int,
    body: CourseUpdate,
    authorization: Optional[str] = Header(None),
):
    """Teacher: update own course. Admin: update any course."""
    caller_id = await _resolve_teacher_id(authorization)
    _ensure_supabase()

    # Fetch course to verify ownership
    async with httpx.AsyncClient(timeout=10) as client:
        chk = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}", "select": "teacher_id"},
            headers=_supabase_headers(),
        )
    rows = chk.json() if chk.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Course not found")
    if rows[0]["teacher_id"] != caller_id and caller_id not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Not your course")

    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.patch(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}"},
            json=patch,
            headers=_supabase_headers(),
        )
    if res.status_code not in (200, 201, 204):
        raise HTTPException(status_code=502, detail=f"Failed to update course: {res.text}")
    rows = res.json()
    return rows[0] if isinstance(rows, list) and rows else {"ok": True}


@router.get("/{course_id}/reviews")
async def list_course_reviews(course_id: int):
    """Public: list all ratings/reviews for a course, newest first."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_ratings",
            params={
                "course_id": f"eq.{course_id}",
                "select": "id, student_id, rating, review, created_at, profiles(first_name, username, photo_url)",
                "order": "created_at.desc",
                "limit": "50",
            },
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase error: {res.text}")
    return res.json()


@router.get("/{course_id}/my-rating")
async def my_course_rating(course_id: int, authorization: Optional[str] = Header(None)):
    """Auth: return current user's rating+review for a course, or null."""
    caller_id = await _resolve_teacher_id(authorization)
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_ratings",
            params={
                "course_id": f"eq.{course_id}",
                "student_id": f"eq.{caller_id}",
                "select": "rating, review",
                "limit": "1",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    return rows[0] if rows else {"rating": 0, "review": ""}


@router.post("/{course_id}/rate")
async def rate_course(
    course_id: int,
    body: CourseRateBody,
    authorization: Optional[str] = Header(None),
):
    """Enrolled student: submit or update a 1–5 star rating + optional text review."""
    caller_id = await _resolve_teacher_id(authorization)
    if not 1 <= body.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    _ensure_supabase()

    # Only enrolled students (or course owner / admin) may rate
    async with httpx.AsyncClient(timeout=10) as client:
        enroll_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            params={
                "course_id": f"eq.{course_id}",
                "student_id": f"eq.{caller_id}",
                "is_active": "eq.true",
                "select": "id",
                "limit": "1",
            },
            headers=_supabase_headers(),
        )
        course_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}", "select": "teacher_id"},
            headers=_supabase_headers(),
        )

    course_rows = course_res.json() if course_res.status_code == 200 else []
    if not course_rows:
        raise HTTPException(status_code=404, detail="Course not found")
    teacher_id = course_rows[0]["teacher_id"]

    enrolled = bool((enroll_res.json() if enroll_res.status_code == 200 else []))
    is_owner_or_admin = caller_id == teacher_id or caller_id in ADMIN_IDS
    if not enrolled and not is_owner_or_admin:
        raise HTTPException(status_code=403, detail="Only enrolled students can rate this course")

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/course_ratings",
            params={"on_conflict": "course_id,student_id"},
            json={
                "course_id": course_id,
                "student_id": caller_id,
                "rating": body.rating,
                "review": body.review or "",
            },
            headers={**_supabase_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
        )
    if res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Failed to save rating: {res.text}")

    rows = res.json()
    return rows[0] if isinstance(rows, list) and rows else {"ok": True}


@router.delete("/{course_id}")
async def delete_course(
    course_id: int,
    authorization: Optional[str] = Header(None),
):
    """Teacher: delete own course. Admin: delete any course."""
    caller_id = await _resolve_teacher_id(authorization)
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        chk = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}", "select": "teacher_id"},
            headers=_supabase_headers(),
        )
    rows = chk.json() if chk.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Course not found")
    if rows[0]["teacher_id"] != caller_id and caller_id not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Not your course")

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.delete(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}"},
            headers=_supabase_headers(),
        )
    if res.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"Failed to delete course: {res.text}")
    return {"ok": True, "deleted_id": course_id}
