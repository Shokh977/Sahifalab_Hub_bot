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
from fastapi import APIRouter, Depends, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, UTC
import os
import logging
import httpx

from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.services.xp_service import add_xp, DEFAULT_COURSE_XP
from app.services.challenge_service import record_challenge_progress
from app.services.tanga_service import grant_tanga_for_xp
from app.core.admin_check import is_role_admin

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


async def _assert_course_owner(course_id: int, caller_id: int, db: Session):
    """Raise 403 unless caller is the course teacher or an admin."""
    teacher_id = await _get_course_teacher(course_id)
    if teacher_id is None:
        raise HTTPException(status_code=404, detail="Course not found")
    if caller_id != teacher_id and caller_id not in ADMIN_IDS and not is_role_admin(db, caller_id):
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


async def _can_access_lesson(lesson: dict, caller_id: int, db: Session) -> bool:
    """Return True when caller can access the lesson content."""
    teacher_id = await _get_course_teacher(lesson["course_id"])
    if caller_id == teacher_id or caller_id in ADMIN_IDS or is_role_admin(db, caller_id):
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
                "select": "id, course_id, title, description, video_source, encoding_status, duration_minutes, order_index, is_free, lesson_type, section_title, material_name, created_at",
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
async def get_lesson(lesson_id: int, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
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
        is_owner_or_admin = caller_id == teacher_id or caller_id in ADMIN_IDS or is_role_admin(db, caller_id)
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

    if not has_access:
        lesson = {**lesson, "material_url": ""}

    return lesson


_QUALITY_ALLOWLIST = ("360p", "480p", "720p")
_QUALITY_FALLBACK_ORDER = {
    "720p": ("720p", "480p", "360p"),
    "480p": ("480p", "360p", "720p"),
    "360p": ("360p", "480p", "720p"),
}


@router.get("/{lesson_id}/download-url")
async def get_lesson_download_url(
    lesson_id: int,
    quality: str = Query("480p", description="Preferred rendition: 360p | 480p | 720p"),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Return a short-lived signed MP4 download URL for offline use.
    Requires the caller to be enrolled in the course (or be the teacher/admin).
    The URL expires in 1 hour — the client should download immediately.

    `quality` is validated against an allowlist and falls back to the nearest
    available rendition if the requested one wasn't transcoded (Bunny only
    produces renditions up to the source resolution).
    """
    if quality not in _QUALITY_ALLOWLIST:
        raise HTTPException(status_code=422, detail="Noto'g'ri sifat. 360p, 480p yoki 720p bo'lishi kerak")

    _ensure_supabase()
    caller_id = await _resolve_caller(authorization)

    # Fetch lesson row
    # NOTE: "hls_url" is NOT a real column on the lessons table (it's synthesized
    # in Python by GET /lessons/{id} via bss.signed_hls_url()). Selecting it by
    # name here makes PostgREST return HTTP 400 ("column lessons.hls_url does not
    # exist"), which the status_code==200 check below silently turns into an
    # empty result set — i.e. every download-url request looked like "Lesson not
    # found" regardless of the actual lesson. Do not add hls_url back here.
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={"id": f"eq.{lesson_id}", "select": "id,course_id,bunny_video_id,video_source,title"},
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        logger.error("Lesson lookup failed for id %s: %s %s", lesson_id, res.status_code, res.text[:300])
        raise HTTPException(status_code=502, detail="Dars ma'lumotlarini olishda xatolik")
    rows = res.json()
    if not rows:
        raise HTTPException(status_code=404, detail="Lesson not found")
    lesson = rows[0]

    bunny_vid = lesson.get("bunny_video_id") or ""
    is_bunny  = lesson.get("video_source", "bunny") == "bunny"

    if not bunny_vid or not is_bunny:
        raise HTTPException(status_code=422, detail="Bu dars uchun yuklab olish mavjud emas")

    course_id = lesson["course_id"]

    # Verify access
    teacher_id      = await _get_course_teacher(course_id)
    is_owner_or_admin = caller_id == teacher_id or caller_id in ADMIN_IDS or is_role_admin(db, caller_id)
    if not is_owner_or_admin:
        enrolled = await _is_enrolled(course_id, caller_id)
        if not enrolled:
            raise HTTPException(status_code=403, detail="Bu kursga yozilmagan")

    # cdn_host_from_url previously tried to parse a CDN hostname out of the
    # (non-existent) hls_url DB column and was always empty in practice.
    # signed_mp4_url() falls back to settings.BUNNY_STREAM_CDN_HOST directly.
    cdn_host_from_url = ""

    EXPIRES_SECONDS = 3600
    try:
        from app.services import bunny_stream_service as bss
        # Pick the closest available rendition to what was requested (Bunny
        # only transcodes up to the source resolution).
        resolution = quality
        try:
            video_info = await bss.get_video(bunny_vid)
            available  = video_info.get("availableResolutions") or ""
            for r in _QUALITY_FALLBACK_ORDER[quality]:
                if r in available:
                    resolution = r
                    break
        except Exception:
            pass  # Use the requested quality as best-effort default
        url = bss.signed_mp4_url(bunny_vid, resolution=resolution, expires_seconds=EXPIRES_SECONDS, cdn_host_override=cdn_host_from_url)
    except Exception as e:
        logger.warning("signed_mp4_url failed for lesson %s: %s", lesson_id, e)
        raise HTTPException(status_code=503, detail="Yuklab olish URL yaratilmadi")

    from datetime import datetime, timedelta, timezone
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=EXPIRES_SECONDS)).isoformat()

    return {
        "url": url,
        "quality": resolution,
        "size_bytes": None,   # Bunny Stream API doesn't expose per-rendition size
        "expires_at": expires_at,
        "expires_in": EXPIRES_SECONDS,
        "lesson_id": lesson_id,
        "course_id": course_id,
    }


@router.post("/downloads/verify")
async def verify_downloads(
    body: dict,
    authorization: Optional[str] = Header(None),
):
    """
    Re-check that the caller still has access to a set of previously-downloaded
    lessons (e.g. their enrollment was refunded/revoked since downloading).
    Body: { "lesson_ids": [1, 2, 3] }
    Returns: { "allowed": [...], "revoked": [...] }
    """
    caller_id = await _resolve_caller(authorization)
    lesson_ids = body.get("lesson_ids") or []
    if not lesson_ids:
        return {"allowed": [], "revoked": []}

    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={
                "id": f"in.({','.join(str(int(i)) for i in lesson_ids)})",
                "select": "id,course_id",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    course_ids = {r["course_id"] for r in rows if r.get("course_id")}

    # Resolve access per course once, then map back to lessons
    access_by_course: dict[int, bool] = {}
    for course_id in course_ids:
        teacher_id = await _get_course_teacher(course_id)
        if caller_id == teacher_id or caller_id in ADMIN_IDS:
            access_by_course[course_id] = True
        else:
            access_by_course[course_id] = await _is_enrolled(course_id, caller_id)

    found_ids = {r["id"] for r in rows}
    allowed: list[int] = []
    revoked: list[int] = []
    for lid in lesson_ids:
        lid = int(lid)
        if lid not in found_ids:
            revoked.append(lid)  # lesson deleted entirely
            continue
        course_id = next((r["course_id"] for r in rows if r["id"] == lid), None)
        if course_id is not None and access_by_course.get(course_id):
            allowed.append(lid)
        else:
            revoked.append(lid)

    return {"allowed": allowed, "revoked": revoked}


@router.post("")
async def create_lesson(body: LessonCreate, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
    """Teacher: create a new lesson in own course."""
    caller_id = await _resolve_caller(authorization)
    await _assert_course_owner(body.course_id, caller_id, db)
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
async def reorder_lessons(body: ReorderRequest, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
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
    await _assert_course_owner(rows[0]["course_id"], caller_id, db)

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
    db: Session = Depends(get_db),
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
    await _assert_course_owner(course_id, caller_id, db)

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


@router.get("/{lesson_id}/position")
async def get_video_position(lesson_id: int, authorization: Optional[str] = Header(None)):
    """Return the saved video playback position (seconds) for the current user."""
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/lesson_progress",
            params={
                "lesson_id": f"eq.{lesson_id}",
                "student_id": f"eq.{caller_id}",
                "select": "video_position",
                "limit": "1",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 and isinstance(res.json(), list) else []
    return {"position": rows[0]["video_position"] if rows else 0}


@router.patch("/{lesson_id}/position")
async def save_video_position(
    lesson_id: int,
    body: dict,
    authorization: Optional[str] = Header(None),
):
    """
    Upsert video playback position (seconds) without marking lesson complete.
    Called every 10 seconds during playback.
    """
    caller_id = await _resolve_caller(authorization)
    position  = int(body.get("position_seconds", 0))
    _ensure_supabase()

    # Fetch lesson to get course_id
    async with httpx.AsyncClient(timeout=10) as client:
        lr = await client.get(
            f"{SUPABASE_URL}/rest/v1/lessons",
            params={"id": f"eq.{lesson_id}", "select": "course_id"},
            headers=_supabase_headers(),
        )
    lesson_rows = lr.json() if lr.status_code == 200 and isinstance(lr.json(), list) else []
    if not lesson_rows:
        raise HTTPException(status_code=404, detail="Lesson not found")
    course_id = lesson_rows[0]["course_id"]

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/lesson_progress",
            params={"on_conflict": "lesson_id,student_id"},
            json={
                "course_id":      course_id,
                "lesson_id":      lesson_id,
                "student_id":     caller_id,
                "is_completed":   False,
                "video_position": position,
            },
            headers={**_supabase_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
        )
    if res.status_code not in (200, 201, 204):
        raise HTTPException(status_code=502, detail="Failed to save position")
    return {"ok": True}


@router.post("/{lesson_id}/complete")
async def complete_lesson(
    lesson_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
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

    if not await _can_access_lesson(lesson, caller_id, db):
        raise HTTPException(status_code=403, detail="Lesson is locked")

    # Checked BEFORE the upsert below — this is what makes the
    # lessons_completed challenge-progress call idempotent. The upsert
    # itself doesn't tell us new-vs-already-completed (it always succeeds),
    # so without this a user re-opening an already-completed lesson would
    # count it again on every request.
    async with httpx.AsyncClient(timeout=10) as client:
        already_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/lesson_progress",
            params={
                "lesson_id": f"eq.{lesson_id}", "student_id": f"eq.{caller_id}",
                "select": "is_completed",
            },
            headers=_supabase_headers(),
        )
    already_rows = already_res.json() if already_res.status_code == 200 else []
    was_already_completed = bool(already_rows) and bool(already_rows[0].get("is_completed"))

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

    challenges_completed:  list = []
    challenges_progressed: list = []

    if not was_already_completed:
        try:
            completed, progressed = record_challenge_progress(db, caller_id, "lessons_completed", 1, occurred_at=datetime.now(UTC))
            challenges_completed.extend(completed)
            challenges_progressed.extend(progressed)
            db.commit()
        except Exception:
            db.rollback()
            logger.error("Failed to record lessons_completed challenge progress for user_id=%s lesson_id=%s", caller_id, lesson_id, exc_info=True)

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
                existing_cert_res = await client.get(
                    f"{SUPABASE_URL}/rest/v1/course_certificates",
                    params={"course_id": f"eq.{course_id}", "student_id": f"eq.{caller_id}", "select": "certificate_id"},
                    headers=_supabase_headers(),
                )
            cert_was_new = not (existing_cert_res.json() if existing_cert_res.status_code == 200 else [])

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

            if certificate_issued and cert_was_new:
                try:
                    completed, progressed = record_challenge_progress(db, caller_id, "courses_completed", 1, occurred_at=datetime.now(UTC))
                    challenges_completed.extend(completed)
                    challenges_progressed.extend(progressed)
                    db.commit()
                except Exception:
                    db.rollback()
                    logger.error("Failed to record courses_completed challenge progress for user_id=%s course_id=%s", caller_id, course_id, exc_info=True)

            # Award course completion XP (deduplicated by course_id — one-time only)
            try:
                xp_result = add_xp(db, user_id=caller_id, source="COURSE", amount=DEFAULT_COURSE_XP, reference_id=course_id)
                grant_tanga_for_xp(
                    db, caller_id, xp_result, reason="course_complete", reference_id=course_id,
                    idempotency_key=f"course:{caller_id}:{course_id}",
                )
            except Exception:
                logger.error(
                    "Course-completion XP award failed for user_id=%s course_id=%s amount=%s source=COURSE",
                    caller_id, course_id, DEFAULT_COURSE_XP, exc_info=True,
                )
    except Exception as e:
        logger.warning("Failed to auto-issue course certificate for course %s, student %s: %s", course_id, caller_id, e)

    return {
        "ok": True,
        "lesson_id": lesson_id,
        "completed": True,
        "certificate_issued": certificate_issued,
        "challenges_completed":  challenges_completed,
        "challenges_progressed": challenges_progressed,
    }


@router.delete("/{lesson_id}")
async def delete_lesson(lesson_id: int, authorization: Optional[str] = Header(None), db: Session = Depends(get_db)):
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
    await _assert_course_owner(course_id, caller_id, db)

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
