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


async def _can_access_lesson(lesson: dict, caller_id: int) -> bool:
    """Return True when caller can access the lesson content."""
    teacher_id = await _get_course_teacher(lesson["course_id"])
    if caller_id == teacher_id or caller_id in ADMIN_IDS:
        return True
    if lesson.get("is_free"):
        return True
    return await _is_enrolled(lesson["course_id"], caller_id)


# ── Schemas ───────────────────────────────────────────────────────────────────

class LessonCreate(BaseModel):
    course_id:        int
    title:            str
    description:      Optional[str] = ""
    video_url:        Optional[str] = ""
    video_source:     Optional[str] = "bunny"   # 'youtube' | 'bunny' | 'none'
    bunny_video_id:   Optional[str] = ""        # Bunny Stream GUID (new)
    encoding_status:  Optional[str] = "none"    # Stream transcoding status
    duration_minutes: Optional[int] = 0
    order_index:      Optional[int] = 0
    is_free:          Optional[bool] = False
    material_url:     Optional[str] = ""
    material_name:    Optional[str] = ""
    lesson_type:      Optional[str] = "video"   # 'video' | 'material' | 'quiz'
    section_title:    Optional[str] = ""


class LessonUpdate(BaseModel):
    title:            Optional[str] = None
    description:      Optional[str] = None
    video_url:        Optional[str] = None
    video_source:     Optional[str] = None      # 'youtube' | 'bunny' | 'none'
    bunny_video_id:   Optional[str] = None      # Bunny Stream GUID
    encoding_status:  Optional[str] = None      # Stream transcoding status
    duration_minutes: Optional[int] = None
    order_index:      Optional[int] = None
    is_free:          Optional[bool] = None
    material_url:     Optional[str] = None
    material_name:    Optional[str] = None
    lesson_type:      Optional[str] = None      # 'video' | 'material' | 'quiz'
    section_title:    Optional[str] = None


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
                "select": "id, course_id, title, description, video_source, encoding_status, duration_minutes, order_index, is_free, lesson_type, section_title, material_url, material_name, created_at",
                "order": "order_index.asc",
            },
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase error: {res.text}")
    return res.json()


@router.get("/my-progress")
async def my_lesson_progress(
    course_id: int = Query(..., description="Course ID"),
    authorization: Optional[str] = Header(None),
):
    """Student: return list of lesson_ids they have completed in a given course."""
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/lesson_progress",
            params={
                "student_id": f"eq.{caller_id}",
                "course_id": f"eq.{course_id}",
                "is_completed": "eq.true",
                "select": "lesson_id",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    return {"completed_lesson_ids": [r["lesson_id"] for r in rows if isinstance(r, dict)]}


@router.get("/my-course-certificates")
async def my_course_certificates(authorization: Optional[str] = Header(None)):
    """Student: list course completion certificates for current user."""
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_certificates",
            params={
                "student_id": f"eq.{caller_id}",
                "select": "course_id,certificate_id,issued_at,total_lessons,completed_lessons,courses(id,title,thumbnail_url)",
                "order": "issued_at.desc",
            },
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Failed to fetch certificates: {res.text}")
    return res.json()


@router.get("/{lesson_id}")
async def get_lesson(lesson_id: int, authorization: Optional[str] = Header(None)):
    """
    Get a single lesson.
    - is_free lessons: video visible to all
    - paid lessons: video only for enrolled users / owner / admin
    - Bunny Stream videos: returns signed embed_url + hls_url (no raw video_url leak)
    - Legacy CDN videos: returns video_url as-is (backward compat)
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

    # Determine access level
    is_bunny = lesson.get("video_source", "bunny") == "bunny"
    has_access = lesson.get("is_free", False)

    caller_id: Optional[int] = None
    if authorization:
        try:
            caller_id = await _resolve_caller(authorization)
        except HTTPException:
            pass

    if caller_id is not None and not has_access:
        teacher_id = await _get_course_teacher(lesson["course_id"])
        is_owner_or_admin = caller_id == teacher_id or caller_id in ADMIN_IDS
        if is_owner_or_admin:
            has_access = True
        else:
            enrolled = await _is_enrolled(lesson["course_id"], caller_id)
            has_access = enrolled

    # ── Bunny Stream video: inject signed URLs ────────────────────────────
    bunny_vid = lesson.get("bunny_video_id") or ""
    if bunny_vid and is_bunny:
        if has_access:
            try:
                from app.services import bunny_stream_service as bss
                lesson["embed_url"] = bss.signed_embed_url(bunny_vid, expires_seconds=14400)
                lesson["hls_url"] = bss.signed_hls_url(bunny_vid, expires_seconds=14400)
                lesson["thumbnail_url"] = bss.thumbnail_url(bunny_vid)
            except Exception as e:
                logger.warning("Failed to generate signed Stream URLs: %s", e)
                lesson["embed_url"] = ""
                lesson["hls_url"] = ""
        else:
            lesson["embed_url"] = ""
            lesson["hls_url"] = ""
        # Never expose the raw CDN video_url for Stream videos
        lesson["video_url"] = ""
    elif is_bunny and not has_access:
        # Legacy CDN video — hide URL for non-enrolled
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
        "bunny_video_id":   body.bunny_video_id or "",
        "encoding_status":  body.encoding_status or "none",
        "duration_minutes": body.duration_minutes or 0,
        "order_index":      body.order_index or 0,
        "is_free":          bool(body.is_free),
        "material_url":     body.material_url or "",
        "material_name":    body.material_name or "",
        "lesson_type":      body.lesson_type or "video",
        "section_title":    body.section_title or "",
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


@router.post("/{lesson_id}/complete")
async def complete_lesson(lesson_id: int, authorization: Optional[str] = Header(None)):
    """Student marks lesson as completed (tracked per user+lesson)."""
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        chk = await client.get(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={"id": f"eq.{lesson_id}", "select": "id, course_id, is_free"},
            headers=_supabase_headers(),
        )
    rows = chk.json() if chk.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Lesson not found")
    lesson = rows[0]

    if not await _can_access_lesson(lesson, caller_id):
        raise HTTPException(status_code=403, detail="Lesson is locked")

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/lesson_progress",
            params={"on_conflict": "lesson_id,student_id"},
            json={
                "course_id": lesson["course_id"],
                "lesson_id": lesson_id,
                "student_id": caller_id,
                "is_completed": True,
            },
            headers={**_supabase_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
        )
    if res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Failed to save progress: {res.text}")

    certificate_issued = False
    course_id = lesson["course_id"]

    # Auto-issue course certificate when all lessons are completed
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            total_res = await client.get(
                f"{SUPABASE_URL}/rest/v1/lessons",
                params={"course_id": f"eq.{course_id}", "select": "id"},
                headers=_supabase_headers(),
            )
            done_res = await client.get(
                f"{SUPABASE_URL}/rest/v1/lesson_progress",
                params={
                    "course_id": f"eq.{course_id}",
                    "student_id": f"eq.{caller_id}",
                    "is_completed": "eq.true",
                    "select": "lesson_id",
                },
                headers=_supabase_headers(),
            )

        total_rows = total_res.json() if total_res.status_code == 200 else []
        done_rows = done_res.json() if done_res.status_code == 200 else []
        total_lessons = len(total_rows)
        completed_lessons = len(done_rows)

        if total_lessons > 0 and completed_lessons >= total_lessons:
            async with httpx.AsyncClient(timeout=10) as client:
                cert_res = await client.post(
                    f"{SUPABASE_URL}/rest/v1/course_certificates",
                    params={"on_conflict": "course_id,student_id"},
                    json={
                        "course_id": course_id,
                        "student_id": caller_id,
                        "certificate_id": f"CRS-{course_id}-{caller_id}",
                        "total_lessons": total_lessons,
                        "completed_lessons": completed_lessons,
                    },
                    headers={**_supabase_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
                )
            certificate_issued = cert_res.status_code in (200, 201)
    except Exception as e:
        logger.warning("Failed to auto-issue course certificate for course %s, student %s: %s", course_id, caller_id, e)

    return {
        "ok": True,
        "lesson_id": lesson_id,
        "completed": True,
        "certificate_issued": certificate_issued,
    }


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
