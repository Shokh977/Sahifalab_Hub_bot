"""
SAHIFALAB — Course enrollments endpoints

Routes (Bearer JWT required):
  GET    /api/enrollments/check?course_id={id}      — check if caller is enrolled
  POST   /api/enrollments/enroll                    — enroll caller into a course (free only)
  DELETE /api/enrollments/enroll?course_id={id}     — unenroll caller
  GET    /api/enrollments/mine                      — list caller's active enrollments
  POST   /api/enrollments/request-code              — generate/return payment reference code for paid course
  GET    /api/enrollments/pending-status?course_id= — check if caller has a pending payment request
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional
import os
import httpx
import secrets
import string
from datetime import datetime, timezone, timedelta

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


def _generate_ref_code() -> str:
    chars = string.ascii_uppercase + string.digits
    part1 = "".join(secrets.choice(chars) for _ in range(4))
    part2 = "".join(secrets.choice(chars) for _ in range(4))
    return f"PAY-{part1}-{part2}"


TELEGRAM_BOT_URL = os.getenv("PAYMENT_BOT_URL", "https://t.me/sahifalab_pay_bot")


class RequestCodeBody(BaseModel):
    course_id: int


@router.post("/request-code")
async def request_enrollment_code(body: RequestCodeBody, authorization: Optional[str] = Header(None)):
    caller_id = await _resolve_caller(authorization)
    course = await _get_course(body.course_id)

    if not course.get("is_paid"):
        raise HTTPException(status_code=400, detail="Course is not paid")

    already = await _is_enrolled(body.course_id, caller_id)
    if already:
        raise HTTPException(status_code=400, detail="Already enrolled in this course")

    _ensure_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Return existing valid pending request if one exists
    async with httpx.AsyncClient(timeout=10) as client:
        existing_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/pending_enrollments",
            params={
                "user_id":   f"eq.{caller_id}",
                "course_id": f"eq.{body.course_id}",
                "status":    "in.(awaiting_payment,paid)",
                "expires_at": f"gt.{now_iso}",
                "select":    "reference_code,expires_at,status",
                "limit":     "1",
            },
            headers=_supabase_headers(),
        )
    existing = existing_res.json() if existing_res.status_code == 200 else []
    if existing:
        row = existing[0]
        return {
            "reference_code":  row["reference_code"],
            "telegram_bot_url": TELEGRAM_BOT_URL,
            "expires_at":      row["expires_at"],
            "status":          row["status"],
        }

    ref_code  = _generate_ref_code()
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()

    async with httpx.AsyncClient(timeout=10) as client:
        insert_res = await client.post(
            f"{SUPABASE_URL}/rest/v1/pending_enrollments",
            json={
                "user_id":        caller_id,
                "course_id":      body.course_id,
                "reference_code": ref_code,
                "expected_amount": int(course.get("price", 0)),
                "status":         "awaiting_payment",
                "expires_at":     expires_at,
            },
            headers=_supabase_headers(),
        )
    if insert_res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Failed to create enrollment request")

    return {
        "reference_code":  ref_code,
        "telegram_bot_url": TELEGRAM_BOT_URL,
        "expires_at":      expires_at,
        "status":          "awaiting_payment",
    }


@router.get("/pending-status")
async def pending_enrollment_status(course_id: int = Query(...), authorization: Optional[str] = Header(None)):
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/pending_enrollments",
            params={
                "user_id":    f"eq.{caller_id}",
                "course_id":  f"eq.{course_id}",
                "status":     "in.(awaiting_payment,paid)",
                "expires_at": f"gt.{now_iso}",
                "select":     "reference_code,expires_at,status",
                "limit":      "1",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    if not rows:
        return {"has_pending": False}
    row = rows[0]
    return {
        "has_pending":     True,
        "reference_code":  row["reference_code"],
        "status":          row["status"],
        "expires_at":      row["expires_at"],
    }


@router.get("/mine")
async def my_enrollments(authorization: Optional[str] = Header(None)):
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        # Step 1: get enrolled course IDs (no join — avoids FK schema cache dependency)
        enroll_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            params={
                "student_id": f"eq.{caller_id}",
                "is_active":  "eq.true",
                "select":     "course_id, created_at",
                "order":      "created_at.desc",
            },
            headers=_supabase_headers(),
        )
    if enroll_res.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Supabase error: {enroll_res.text}")

    enrollments = enroll_res.json()
    if not enrollments:
        return []

    # Step 2: fetch course details for those IDs in one query
    course_ids = ",".join(str(e["course_id"]) for e in enrollments)
    async with httpx.AsyncClient(timeout=10) as client:
        courses_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={
                "id":     f"in.({course_ids})",
                "select": "id, title, slug, thumbnail_url, is_paid, price, total_lessons, total_duration_minutes, enrolled_count, rating, is_published",
            },
            headers=_supabase_headers(),
        )
    courses_by_id = (
        {c["id"]: c for c in courses_res.json()}
        if courses_res.status_code == 200 else {}
    )

    return [
        {
            "course_id":  e["course_id"],
            "created_at": e["created_at"],
            "courses":    courses_by_id.get(e["course_id"]),
        }
        for e in enrollments
    ]
