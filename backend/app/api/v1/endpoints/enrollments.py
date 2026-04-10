"""
SAHIFALAB — Course enrollments endpoints

Routes (Bearer JWT required):
  GET    /api/enrollments/check?course_id={id}   — check if caller is enrolled
  POST   /api/enrollments/enroll                 — enroll caller into a course (free only)
  DELETE /api/enrollments/enroll?course_id={id}  — unenroll caller
  GET    /api/enrollments/mine                   — list caller's active enrollments
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional
import os
import httpx

from app.services.auth_service import decode_token

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
    if tid is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return tid


async def _get_course(course_id: int) -> dict:
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={
                "id": f"eq.{course_id}",
                "select": "id, title, price, teacher_id, is_paid, is_published",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Course not found")
    return rows[0]


async def _is_enrolled(course_id: int, student_id: int) -> bool:
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


async def _sync_enrolled_count(course_id: int):
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        cnt = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            params={
                "course_id": f"eq.{course_id}",
                "is_active": "eq.true",
                "select": "id",
            },
            headers={**_supabase_headers(), "Prefer": "count=exact"},
        )
    total = int(cnt.headers.get("content-range", "0/0").split("/")[-1] or 0)

    async with httpx.AsyncClient(timeout=10) as client:
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}"},
            json={"enrolled_count": total},
            headers=_supabase_headers(),
        )


class EnrollRequest(BaseModel):
    course_id: int


@router.get("/check")
async def check_enrollment(course_id: int = Query(...), authorization: Optional[str] = Header(None)):
    caller_id = await _resolve_caller(authorization)
    course = await _get_course(course_id)

    if caller_id == course["teacher_id"] or caller_id in ADMIN_IDS:
        return {"enrolled": True, "owner": True}

    enrolled = await _is_enrolled(course_id, caller_id)
    return {"enrolled": enrolled, "owner": False}


@router.post("/enroll")
async def enroll_course(body: EnrollRequest, authorization: Optional[str] = Header(None)):
    caller_id = await _resolve_caller(authorization)
    course = await _get_course(body.course_id)

    if caller_id == course["teacher_id"] or caller_id in ADMIN_IDS:
        return {"ok": True, "already_enrolled": True, "owner": True}

    if not course.get("is_published"):
        raise HTTPException(status_code=403, detail="Course is not published")

    if course.get("is_paid"):
        raise HTTPException(status_code=402, detail="Paid enrollment requires payment")

    already = await _is_enrolled(body.course_id, caller_id)
    if already:
        return {"ok": True, "already_enrolled": True}

    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            json={"course_id": body.course_id, "student_id": caller_id, "is_active": True},
            headers=_supabase_headers(),
        )
    if res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Failed to enroll: {res.text}")

    await _sync_enrolled_count(body.course_id)
    # Notify teacher about new student
    teacher_id = course.get("teacher_id")
    if teacher_id and teacher_id != caller_id:
        from app.api.v1.endpoints.notifications import send_notification
        await send_notification(
            teacher_id, "new_student", "BUSINESS",
            {"actor_id": caller_id, "course_id": body.course_id},
        )
    return {"ok": True, "already_enrolled": False}


@router.delete("/enroll")
async def unenroll_course(course_id: int = Query(...), authorization: Optional[str] = Header(None)):
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.patch(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            params={"course_id": f"eq.{course_id}", "student_id": f"eq.{caller_id}"},
            json={"is_active": False},
            headers=_supabase_headers(),
        )
    if res.status_code not in (200, 201, 204):
        raise HTTPException(status_code=502, detail=f"Failed to unenroll: {res.text}")

    await _sync_enrolled_count(course_id)
    return {"ok": True}


@router.get("/mine")
async def my_enrollments(authorization: Optional[str] = Header(None)):
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            params={
                "student_id": f"eq.{caller_id}",
                "is_active": "eq.true",
                "select": "course_id, created_at, courses(id, title, slug, thumbnail_url, is_paid, price)",
                "order": "created_at.desc",
            },
            headers=_supabase_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase error: {res.text}")
    return res.json()
