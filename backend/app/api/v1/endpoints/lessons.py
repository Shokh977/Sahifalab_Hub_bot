"""
SAHIFALAB — Lessons endpoints

Routes:
  GET  /api/lessons?course_id={id}   — list lessons for a course (public)
  GET  /api/lessons/{id}             — single lesson detail (public)
  POST /api/lessons                  — create lesson (teacher/admin, owns course)
  PATCH /api/lessons/{id}            — update lesson (owner/admin)
  DELETE /api/lessons/{id}           — delete lesson (owner/admin)
  PATCH /api/lessons/reorder         — bulk reorder lessons (owner/admin)
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional, List
import os
import logging
import httpx

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


async def _resolve_caller(authorization: Optional[str]) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return tid


async def _get_course_teacher(course_id: int) -> Optional[int]:
    """Return teacher_id for a course, or None if not found."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}", "select": "teacher_id"},
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    return rows[0]["teacher_id"] if rows else None


async def _assert_course_owner(course_id: int, caller_id: int):
    """Raise 403 unless caller is the course teacher or an admin."""
    teacher_id = await _get_course_teacher(course_id)
    if teacher_id is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if caller_id != teacher_id and caller_id not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Not your course")


async def _is_enrolled(course_id: int, student_id: int) -> bool:
    """Return True if the student has an active enrollment in the course."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            params={
                "course_id": f"eq.{course_id}",
                "student_id": f"eq.{student_id}",
                "is_active": "eq.true",
                "select": "id",
                "limit": "1",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    return len(rows) > 0


# ── Schemas ───────────────────────────────────────────────────────────────────

class LessonCreate(BaseModel):
    course_id:        int
    title:            str
    description:      Optional[str] = ""
    video_url:        Optional[str] = ""
    video_source:     Optional[str] = "bunny"   # 'youtube' | 'bunny' | 'none'
    duration_minutes: Optional[int] = 0
    order_index:      Optional[int] = 0
    is_free:          Optional[bool] = False


class LessonUpdate(BaseModel):
    title:            Optional[str] = None
    description:      Optional[str] = None
    video_url:        Optional[str] = None
    video_source:     Optional[str] = None      # 'youtube' | 'bunny' | 'none'
    duration_minutes: Optional[int] = None
    order_index:      Optional[int] = None
    is_free:          Optional[bool] = None


class ReorderItem(BaseModel):
    id:          int
    order_index: int


class ReorderRequest(BaseModel):
    lessons: List[ReorderItem]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_lessons(course_id: int = Query(..., description="Course ID")):
    """Public: list all lessons for a course ordered by order_index."""
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={
                "course_id": f"eq.{course_id}",
                "select": "id, course_id, title, description, video_source, duration_minutes, order_index, is_free, created_at",
                "order": "order_index.asc",
            },
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase error: {res.text}")
    return res.json()


@router.get("/{lesson_id}")
async def get_lesson(lesson_id: int, authorization: Optional[str] = Header(None)):
    """
    Get a single lesson.
    - is_free lessons: video_url visible to all
    - paid lessons: video_url only for enrolled users (enrollment check in future step)
    """
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={"id": f"eq.{lesson_id}", "select": "*"},
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase error: {res.text}")
    rows = res.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Lesson not found")
    lesson = rows[0]

    # Hide video_url only for Bunny-hosted paid lessons (YouTube URLs are already public)
    # Step 11: enrolled students (or owner/admin) can view paid Bunny URLs
    is_bunny = lesson.get("video_source", "bunny") == "bunny"
    if not lesson.get("is_free") and is_bunny:
        caller_id: Optional[int] = None
        if authorization:
            try:
                caller_id = await _resolve_caller(authorization)
            except HTTPException:
                pass

        if caller_id is None:
            lesson = {**lesson, "video_url": ""}
        else:
            teacher_id = await _get_course_teacher(lesson["course_id"])
            is_owner_or_admin = caller_id == teacher_id or caller_id in ADMIN_IDS
            if not is_owner_or_admin:
                enrolled = await _is_enrolled(lesson["course_id"], caller_id)
                if not enrolled:
                    lesson = {**lesson, "video_url": ""}

    return lesson


@router.post("")
async def create_lesson(body: LessonCreate, authorization: Optional[str] = Header(None)):
    """Teacher: create a new lesson in own course."""
    caller_id = await _resolve_caller(authorization)
    await _assert_course_owner(body.course_id, caller_id)
    _ensure_supabase()

    payload = {
        "course_id":        body.course_id,
        "title":            body.title,
        "description":      body.description or "",
        "video_url":        body.video_url or "",
        "video_source":     body.video_source or "bunny",
        "duration_minutes": body.duration_minutes or 0,
        "order_index":      body.order_index or 0,
        "is_free":          bool(body.is_free),
    }

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/lessons",
            json=payload,
            headers=_supabase_headers(),
        )
    if res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Failed to create lesson: {res.text}")

    created = res.json()
    lesson = created[0] if isinstance(created, list) else created

    # Update total_lessons + total_duration_minutes on the course
    await _sync_course_totals(body.course_id)

    return lesson


@router.patch("/reorder")
async def reorder_lessons(body: ReorderRequest, authorization: Optional[str] = Header(None)):
    """Teacher: bulk update order_index for a list of lessons."""
    caller_id = await _resolve_caller(authorization)
    if not body.lessons:
        return {"ok": True}

    _ensure_supabase()

    # Verify ownership via first lesson's course
    async with httpx.AsyncClient(timeout=10) as client:
        chk = await client.get(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={"id": f"eq.{body.lessons[0].id}", "select": "course_id"},
            headers=_supabase_headers(),
        )
    rows = chk.json() if chk.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Lesson not found")
    await _assert_course_owner(rows[0]["course_id"], caller_id)

    # Patch each lesson's order_index
    async with httpx.AsyncClient(timeout=10) as client:
        for item in body.lessons:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/lessons",
                params={"id": f"eq.{item.id}"},
                json={"order_index": item.order_index},
                headers=_supabase_headers(),
            )

    return {"ok": True, "updated": len(body.lessons)}


@router.patch("/{lesson_id}")
async def update_lesson(
    lesson_id: int,
    body: LessonUpdate,
    authorization: Optional[str] = Header(None),
):
    """Teacher: update own lesson."""
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()

    # Fetch lesson to get course_id for ownership check
    async with httpx.AsyncClient(timeout=10) as client:
        chk = await client.get(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={"id": f"eq.{lesson_id}", "select": "course_id"},
            headers=_supabase_headers(),
        )
    rows = chk.json() if chk.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Lesson not found")
    course_id = rows[0]["course_id"]
    await _assert_course_owner(course_id, caller_id)

    patch = body.model_dump(exclude_none=True)
    if not patch:
        raise HTTPException(status_code=400, detail="No fields to update")

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.patch(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={"id": f"eq.{lesson_id}"},
            json=patch,
            headers=_supabase_headers(),
        )
    if res.status_code not in (200, 201, 204):
        raise HTTPException(status_code=502, detail=f"Failed to update lesson: {res.text}")

    # Re-sync totals if duration changed
    if "duration_minutes" in patch:
        await _sync_course_totals(course_id)

    rows = res.json()
    return rows[0] if isinstance(rows, list) and rows else {"ok": True}


@router.delete("/{lesson_id}")
async def delete_lesson(lesson_id: int, authorization: Optional[str] = Header(None)):
    """Teacher: delete own lesson."""
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        chk = await client.get(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={"id": f"eq.{lesson_id}", "select": "course_id"},
            headers=_supabase_headers(),
        )
    rows = chk.json() if chk.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Lesson not found")
    course_id = rows[0]["course_id"]
    await _assert_course_owner(course_id, caller_id)

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.delete(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={"id": f"eq.{lesson_id}"},
            headers=_supabase_headers(),
        )
    if res.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"Failed to delete lesson: {res.text}")

    await _sync_course_totals(course_id)
    return {"ok": True, "deleted_id": lesson_id}


# ── Sync helper ───────────────────────────────────────────────────────────────

async def _sync_course_totals(course_id: int):
    """Recalculate total_lessons + total_duration_minutes on the courses row."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{SUPABASE_URL}/rest/v1/lessons",
                params={"course_id": f"eq.{course_id}", "select": "duration_minutes"},
                headers=_supabase_headers(),
            )
        rows = res.json() if res.status_code == 200 else []
        total_lessons   = len(rows)
        total_duration  = sum(r.get("duration_minutes", 0) for r in rows)
        async with httpx.AsyncClient(timeout=10) as client:
            await client.patch(
                f"{SUPABASE_URL}/rest/v1/courses",
                params={"id": f"eq.{course_id}"},
                json={"total_lessons": total_lessons, "total_duration_minutes": total_duration},
                headers=_supabase_headers(),
            )
    except Exception as e:
        logger.warning("Failed to sync course totals for course %s: %s", course_id, e)
