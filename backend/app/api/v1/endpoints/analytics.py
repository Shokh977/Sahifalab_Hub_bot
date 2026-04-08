"""
SAHIFALAB — Analytics event tracking endpoints

Endpoints:
  POST /api/analytics/track          — bulk insert analytics events (course_view, profile_visit, etc.)
  GET  /api/analytics/teacher/funnel — traffic & conversion funnel for calling teacher
  GET  /api/analytics/teacher/growth — daily post count vs profile visits (30d)
  GET  /api/analytics/teacher/demographics — student level distribution
"""
from fastapi import APIRouter, HTTPException, Header, Request
from pydantic import BaseModel
from typing import Optional, List
import os, logging, httpx, json

from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def _headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


def _headers_rep():
    return {**_headers(), "Prefer": "return=representation"}


async def _get_tid(authorization: Optional[str]) -> int:
    if not authorization:
        raise HTTPException(401, "Missing auth header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(401, "Invalid auth header")
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(401, "Invalid or expired token")
    return tid


# ── Schemas ──────────────────────────────────────────────────────────────────

class AnalyticsEvent(BaseModel):
    event_type: str          # 'course_view' | 'course_impression' | 'profile_visit' | 'post_impression'
    target_id: int           # course_id or profile telegram_id or post_id
    teacher_id: int = 0      # the owner teacher's telegram_id
    source: str = "direct"   # 'lenta' | 'search' | 'external' | 'direct'
    meta: dict = {}


class TrackRequest(BaseModel):
    events: List[AnalyticsEvent]


# ── POST /analytics/track ────────────────────────────────────────────────────

@router.post("/track")
async def track_events(
    body: TrackRequest,
    request: Request,
    authorization: Optional[str] = Header(None),
):
    """
    Bulk insert analytics events. Auth is optional — anonymous events use actor_id=0.
    """
    actor_id = 0
    if authorization:
        try:
            actor_id = await _get_tid(authorization)
        except HTTPException:
            pass  # anonymous is fine

    if not body.events:
        return {"ok": True, "inserted": 0}

    # Cap at 50 events per request to prevent abuse
    events = body.events[:50]

    rows = []
    for ev in events:
        rows.append({
            "event_type": ev.event_type,
            "actor_id": actor_id,
            "target_id": ev.target_id,
            "teacher_id": ev.teacher_id,
            "source": ev.source,
            "meta": ev.meta,
        })

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.post(
                f"{SUPABASE_URL}/rest/v1/analytics_events",
                json=rows,
                headers=_headers(),
            )
        if res.status_code not in (200, 201):
            logger.warning(f"Analytics insert failed: {res.status_code} {res.text}")
    except Exception as e:
        logger.warning(f"Analytics insert error: {e}")

    return {"ok": True, "inserted": len(rows)}


# ── GET /analytics/teacher/funnel ────────────────────────────────────────────

@router.get("/teacher/funnel")
async def teacher_funnel(
    days: int = 30,
    authorization: Optional[str] = Header(None),
):
    """
    Traffic & conversion funnel for the calling teacher:
    impressions → course_views → enrollments, broken down by source.
    """
    teacher_id = await _get_tid(authorization)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/teacher_traffic_funnel",
                json={"p_teacher_id": teacher_id, "p_days": days},
                headers=_headers_rep(),
            )
        data = res.json()
        # rpc returns a list with one row
        row = data[0] if isinstance(data, list) and data else data if isinstance(data, dict) else {}
    except Exception as e:
        logger.error(f"Funnel query error: {e}")
        row = {}

    impressions = int(row.get("impressions", 0))
    course_views = int(row.get("course_views", 0))
    enrollments = int(row.get("enrollments", 0))

    return {
        "teacher_id": teacher_id,
        "days": days,
        "impressions": impressions,
        "course_views": course_views,
        "enrollments": enrollments,
        "ctr": round((course_views / impressions * 100), 1) if impressions > 0 else 0.0,
        "conversion_rate": round((enrollments / course_views * 100), 1) if course_views > 0 else 0.0,
        "sources": {
            "lenta": int(row.get("source_lenta", 0)),
            "search": int(row.get("source_search", 0)),
            "external": int(row.get("source_external", 0)),
            "direct": int(row.get("source_direct", 0)),
        },
    }


# ── GET /analytics/teacher/growth ────────────────────────────────────────────

@router.get("/teacher/growth")
async def teacher_growth(
    days: int = 30,
    authorization: Optional[str] = Header(None),
):
    """
    Daily correlation: post frequency vs profile visits over last N days.
    Proves to teachers that writing posts → more profile visits → more sales.
    """
    teacher_id = await _get_tid(authorization)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/teacher_growth_correlation",
                json={"p_teacher_id": teacher_id, "p_days": days},
                headers=_headers_rep(),
            )
        data = res.json()
        rows = data if isinstance(data, list) else []
    except Exception as e:
        logger.error(f"Growth query error: {e}")
        rows = []

    return {
        "teacher_id": teacher_id,
        "days": days,
        "series": [
            {
                "day": r.get("day"),
                "posts_count": int(r.get("posts_count", 0)),
                "profile_visits": int(r.get("profile_visits", 0)),
            }
            for r in rows
        ],
    }


# ── GET /analytics/teacher/demographics ──────────────────────────────────────

@router.get("/teacher/demographics")
async def teacher_demographics(
    authorization: Optional[str] = Header(None),
):
    """
    Student demographics: level distribution (XP rank buckets).
    """
    teacher_id = await _get_tid(authorization)

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/teacher_student_demographics",
                json={"p_teacher_id": teacher_id},
                headers=_headers_rep(),
            )
        data = res.json()
        rows = data if isinstance(data, list) else []
    except Exception as e:
        logger.error(f"Demographics query error: {e}")
        rows = []

    return {
        "teacher_id": teacher_id,
        "level_distribution": [
            {
                "bucket": r.get("level_bucket", "?"),
                "count": int(r.get("student_count", 0)),
            }
            for r in rows
        ],
    }
