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
import asyncio
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
                "select": "id, title, is_published, is_paid, enrolled_count, total_lessons, price, created_at",
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
        raise HTTPException(status_code=500, detail="Profil yangilashda xatolik")

    return await _get_profile_row(telegram_id)


@router.get("/profile/{telegram_id}")
async def get_teacher_profile_by_id(telegram_id: int):
    """
    Public endpoint — fetch any teacher's profile by telegram_id.
    Also enriches the response with first_name, username, photo_url from profiles table.
    Returns partial data (from profiles only) even if no teacher_profiles row exists.
    """
    _ensure_supabase()

    # Fetch teacher profile row and user profile row in parallel
    async with httpx.AsyncClient(timeout=10) as client:
        tp_res, up_res = await asyncio.gather(
            client.get(
                f"{SUPABASE_URL}/rest/v1/teacher_profiles",
                params={"telegram_id": f"eq.{telegram_id}", "select": "*"},
                headers=_supabase_headers(),
            ),
            client.get(
                f"{SUPABASE_URL}/rest/v1/profiles",
                params={"telegram_id": f"eq.{telegram_id}", "select": "first_name,username,photo_url"},
                headers=_supabase_headers(),
            ),
        )

    tp_rows = tp_res.json() if tp_res.status_code == 200 else []
    up_rows = up_res.json() if up_res.status_code == 200 else []

    teacher_row = tp_rows[0] if isinstance(tp_rows, list) and tp_rows else {}
    user_row    = up_rows[0] if isinstance(up_rows, list) and up_rows else {}

    if not teacher_row and not user_row:
        raise HTTPException(status_code=404, detail="Teacher profile not found")

    # Merge: teacher profile wins on field conflicts; add user display fields
    return {
        **teacher_row,
        "telegram_id": telegram_id,
        "first_name":  user_row.get("first_name"),
        "username":    user_row.get("username"),
        "photo_url":   user_row.get("photo_url"),
    }


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

    total_revenue_uzs = 0.0
    completed_orders = 0
    recent_orders: list[dict] = []
    course_performance: list[dict] = []
    top_students: list[dict] = []

    if course_ids:
        ids_csv = ",".join(str(x) for x in course_ids)

        # Lesson counts by course (for completion rates)
        async with httpx.AsyncClient(timeout=10) as client:
            lres = await client.get(
                f"{SUPABASE_URL}/rest/v1/lessons",
                params={"course_id": f"in.({ids_csv})", "select": "course_id,id"},
                headers=_supabase_headers(),
            )
        if lres.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Supabase error: {lres.text}")
        lesson_rows = lres.json() if isinstance(lres.json(), list) else []

        lesson_count_by_course: dict[int, int] = {}
        for r in lesson_rows:
            cid = int(r.get("course_id") or 0)
            if cid:
                lesson_count_by_course[cid] = lesson_count_by_course.get(cid, 0) + 1

        # Enrollment rows (for enrolled students per course)
        async with httpx.AsyncClient(timeout=10) as client:
            eres = await client.get(
                f"{SUPABASE_URL}/rest/v1/course_enrollments",
                params={
                    "course_id": f"in.({ids_csv})",
                    "is_active": "eq.true",
                    "select": "course_id,student_id",
                },
                headers=_supabase_headers(),
            )
        if eres.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Supabase error: {eres.text}")
        enroll_rows = eres.json() if isinstance(eres.json(), list) else []

        students_by_course: dict[int, set[int]] = {}
        for r in enroll_rows:
            cid = int(r.get("course_id") or 0)
            sid = int(r.get("student_id") or 0)
            if cid and sid:
                students_by_course.setdefault(cid, set()).add(sid)

        # Lesson progress rows
        async with httpx.AsyncClient(timeout=10) as client:
            pres = await client.get(
                f"{SUPABASE_URL}/rest/v1/lesson_progress",
                params={
                    "course_id": f"in.({ids_csv})",
                    "is_completed": "eq.true",
                    "select": "course_id,lesson_id,student_id",
                    "limit": "50000",
                },
                headers=_supabase_headers(),
            )
        if pres.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Supabase error: {pres.text}")
        progress_rows = pres.json() if isinstance(pres.json(), list) else []

        completed_count_by_course: dict[int, int] = {}
        student_completed_total: dict[int, int] = {}
        for r in progress_rows:
            cid = int(r.get("course_id") or 0)
            sid = int(r.get("student_id") or 0)
            if cid:
                completed_count_by_course[cid] = completed_count_by_course.get(cid, 0) + 1
            if sid:
                student_completed_total[sid] = student_completed_total.get(sid, 0) + 1

        # Build course performance rows
        for c in courses:
            cid = int(c.get("id") or 0)
            if not cid:
                continue
            lesson_count = int(c.get("total_lessons") or lesson_count_by_course.get(cid, 0) or 0)
            enrolled_students = len(students_by_course.get(cid, set()))
            completed_lessons = int(completed_count_by_course.get(cid, 0))
            total_expected = lesson_count * enrolled_students
            completion_rate = round((completed_lessons / total_expected) * 100, 1) if total_expected > 0 else 0.0
            course_performance.append({
                "course_id": cid,
                "title": c.get("title", f"Course {cid}"),
                "lesson_count": lesson_count,
                "enrolled_students": enrolled_students,
                "completed_lessons": completed_lessons,
                "completion_rate": completion_rate,
            })

        course_performance.sort(key=lambda x: x["completion_rate"], reverse=True)

        # Top students by completed lessons across teacher's courses
        student_ids = [str(sid) for sid in sorted(student_completed_total.keys())[:2000]]
        if student_ids:
            sid_csv = ",".join(student_ids)
            async with httpx.AsyncClient(timeout=10) as client:
                sres = await client.get(
                    f"{SUPABASE_URL}/rest/v1/profiles",
                    params={
                        "telegram_id": f"in.({sid_csv})",
                        "select": "telegram_id,first_name,username,total_xp,level",
                    },
                    headers=_supabase_headers(),
                )
            profiles = sres.json() if sres.status_code == 200 and isinstance(sres.json(), list) else []
            pmap = {int(p.get("telegram_id")): p for p in profiles if p.get("telegram_id") is not None}

            ranked = sorted(student_completed_total.items(), key=lambda kv: kv[1], reverse=True)[:10]
            for sid, completed in ranked:
                p = pmap.get(sid, {})
                top_students.append({
                    "student_id": sid,
                    "first_name": p.get("first_name", "Student"),
                    "username": p.get("username"),
                    "total_xp": int(p.get("total_xp") or 0),
                    "level": int(p.get("level") or 1),
                    "completed_lessons": completed,
                })

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
        total_revenue_uzs = sum(float(o.get("amount") or 0) for o in orders)
        recent_orders = orders[:20]

    return {
        "teacher_id": teacher_id,
        "courses_count": len(courses),
        "published_courses": published_courses,
        "paid_courses": paid_courses,
        "total_students": total_students,
        "completed_orders": completed_orders,
        "total_revenue_uzs": total_revenue_uzs,
        "course_performance": course_performance,
        "top_students": top_students,
        "recent_orders": recent_orders,
    }
