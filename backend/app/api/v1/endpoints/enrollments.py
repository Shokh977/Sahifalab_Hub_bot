"""
SAHIFALAB — Course enrollments endpoints (Step 11)

Routes (Bearer JWT required):
  GET    /api/enrollments/check?course_id={id}   — check if caller is enrolled
  POST   /api/enrollments/enroll                 — enroll caller into a course
  DELETE /api/enrollments/enroll?course_id={id}  — unenroll caller
  GET    /api/enrollments/mine                   — list caller's active enrollments
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional
import os
import httpx
from datetime import datetime, UTC
from typing import Literal
import uuid

from app.services.auth_service import decode_token

router = APIRouter()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")

STARS_RATE = 250  # 1 Star ≈ 250 UZS

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
                "select": "id, teacher_id, is_paid, is_published",
            },
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Course not found")
    return rows[0]


def _generate_order_id(provider: str, course_id: int, student_id: int) -> str:
    return f"course_{provider}_{course_id}_{student_id}_{uuid.uuid4().hex[:8]}"


def _resolve_provider(provider: str, amount_uzs: int):
    """Return (provider_token, currency, invoice_amount) for the given provider."""
    if provider == "telegram_stars":
        stars = max(1, int(amount_uzs / STARS_RATE))
        return "", "XTR", stars
    raise HTTPException(status_code=400, detail="Only telegram_stars is supported for course payments")


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


class CreateInvoiceRequest(BaseModel):
    course_id: int
    provider: Literal["telegram_stars"] = "telegram_stars"


class ConfirmCoursePaymentRequest(BaseModel):
    order_id: str


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
    return {"ok": True, "already_enrolled": False}


@router.post("/create-invoice-link")
async def create_invoice_link(body: CreateInvoiceRequest, authorization: Optional[str] = Header(None)):
    """Create course payment order and Telegram invoice link for paid courses."""
    caller_id = await _resolve_caller(authorization)
    course = await _get_course(body.course_id)

    if caller_id == course["teacher_id"] or caller_id in ADMIN_IDS:
        return {"already_enrolled": True, "owner": True}

    if not course.get("is_published"):
        raise HTTPException(status_code=403, detail="Course is not published")

    if not course.get("is_paid"):
        raise HTTPException(status_code=400, detail="Course is free; use enroll endpoint")

    if await _is_enrolled(body.course_id, caller_id):
        return {"already_enrolled": True}

    _ensure_supabase()
    if not TELEGRAM_BOT_TOKEN:
        raise HTTPException(status_code=500, detail="TELEGRAM_BOT_TOKEN is not configured")

    amount_uzs = int(float(course.get("price") or 0))
    if amount_uzs <= 0:
        raise HTTPException(status_code=400, detail="Invalid course price")

    provider_token, currency, invoice_amount = _resolve_provider(body.provider, amount_uzs)

    order_id = _generate_order_id(body.provider, body.course_id, caller_id)

    async with httpx.AsyncClient(timeout=10) as client:
        ins = await client.post(
            f"{SUPABASE_URL}/rest/v1/course_payment_orders",
            json={
                "order_id": order_id,
                "course_id": body.course_id,
                "student_id": caller_id,
                "provider": body.provider,
                "amount": invoice_amount,
                "currency": currency,
                "status": "pending",
            },
            headers=_supabase_headers(),
        )
    if ins.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Failed to create payment order: {ins.text}")

    tg_payload = {
        "title": f"🎓 {course.get('title', f'Course #{body.course_id}')}",
        "description": "SAHIFALAB kursiga yozilish (⭐ Stars)",
        "payload": order_id,
        "provider_token": provider_token,
        "currency": currency,
        "prices": [{"label": course.get("title", "Course"), "amount": invoice_amount}],
    }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/createInvoiceLink",
                json=tg_payload,
            )
            data = resp.json()
            if not data.get("ok"):
                raise HTTPException(status_code=502, detail=f"Telegram: {data.get('description', 'Unknown error')}")
            invoice_url = data["result"]
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Telegram API error: {e}")

    return {
        "order_id": order_id,
        "invoice_url": invoice_url,
        "amount": invoice_amount,
        "currency": currency,
        "already_enrolled": False,
    }


@router.post("/confirm-payment")
async def confirm_course_payment(body: ConfirmCoursePaymentRequest, authorization: Optional[str] = Header(None)):
    """
    Confirm paid course order and activate enrollment.
    Intended to be called from frontend after Telegram openInvoice callback returns 'paid'.
    """
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        order_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_payment_orders",
            params={"order_id": f"eq.{body.order_id}", "select": "*", "limit": "1"},
            headers=_supabase_headers(),
        )
    rows = order_res.json() if order_res.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Payment order not found")

    order = rows[0]
    if int(order.get("student_id", 0)) != caller_id:
        raise HTTPException(status_code=403, detail="Not your payment order")

    course_id = int(order["course_id"])

    now_iso = datetime.now(UTC).isoformat()
    if order.get("status") != "completed":
        async with httpx.AsyncClient(timeout=10) as client:
            upd = await client.patch(
                f"{SUPABASE_URL}/rest/v1/course_payment_orders",
                params={"order_id": f"eq.{body.order_id}"},
                json={"status": "completed", "completed_at": now_iso},
                headers=_supabase_headers(),
            )
        if upd.status_code not in (200, 201, 204):
            raise HTTPException(status_code=502, detail=f"Failed to complete payment: {upd.text}")

    async with httpx.AsyncClient(timeout=10) as client:
        upsert = await client.post(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            params={"on_conflict": "course_id,student_id"},
            json={"course_id": course_id, "student_id": caller_id, "is_active": True},
            headers={**_supabase_headers(), "Prefer": "resolution=merge-duplicates,return=representation"},
        )
    if upsert.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Failed to activate enrollment: {upsert.text}")

    await _sync_enrolled_count(course_id)
    return {"status": "completed", "order_id": body.order_id, "course_id": course_id}


@router.get("/order/{order_id}")
async def get_course_order(order_id: str, authorization: Optional[str] = Header(None)):
    caller_id = await _resolve_caller(authorization)
    _ensure_supabase()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_payment_orders",
            params={"order_id": f"eq.{order_id}", "select": "*", "limit": "1"},
            headers=_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Order not found")
    order = rows[0]
    if int(order.get("student_id", 0)) != caller_id and caller_id not in ADMIN_IDS:
        raise HTTPException(status_code=403, detail="Not your order")
    return order


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
