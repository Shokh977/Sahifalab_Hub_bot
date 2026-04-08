"""
SAHIFALAB — Notification endpoints

Endpoints:
  GET  /api/notifications              — paginated feed (keyset cursor, selective columns)
  GET  /api/notifications/unread-count — lightweight unread badge count
  POST /api/notifications/read         — mark specific or all notifications as read (RPC)
  POST /api/notifications/create       — internal: create a notification for a user

All reads use targeted column selection (never SELECT *).
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional, List
import os, logging, httpx

from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])

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


# ── GET /notifications — paginated feed ──────────────────────────────────────

@router.get("")
async def get_notifications(
    limit: int = Query(30, ge=1, le=100),
    cursor: Optional[int] = Query(None, description="Last notification id for keyset pagination"),
    authorization: Optional[str] = Header(None),
):
    tid = await _get_tid(authorization)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/get_notifications_page",
                headers=_headers_rep(),
                json={
                    "p_user_id": tid,
                    "p_limit": limit,
                    "p_cursor": cursor,
                },
            )
            if resp.status_code >= 400:
                logger.error(f"get_notifications_page RPC error: {resp.text}")
                raise HTTPException(resp.status_code, "Failed to fetch notifications")
            rows = resp.json()
            return {
                "notifications": rows,
                "next_cursor": rows[-1]["id"] if rows else None,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Notifications fetch error: {e}")
        raise HTTPException(500, "Internal server error")


# ── GET /notifications/unread-count ──────────────────────────────────────────

@router.get("/unread-count")
async def get_unread_count(
    authorization: Optional[str] = Header(None),
):
    tid = await _get_tid(authorization)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/get_unread_count_fast",
                headers=_headers_rep(),
                json={"p_user_id": tid},
            )
            if resp.status_code >= 400:
                # Graceful fallback to the old RPC if 037 hasn't been applied yet
                resp2 = await client.post(
                    f"{SUPABASE_URL}/rest/v1/rpc/get_unread_notification_count",
                    headers=_headers_rep(),
                    json={"p_user_id": tid},
                )
                if resp2.status_code >= 400:
                    raise HTTPException(resp2.status_code, "Failed to get unread count")
                count = resp2.json()
            else:
                count = resp.json()
            return {"count": count if isinstance(count, int) else 0}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unread count error: {e}")
        raise HTTPException(500, "Internal server error")


# ── POST /notifications/read — mark as read ─────────────────────────────────

class MarkReadRequest(BaseModel):
    notification_ids: Optional[List[int]] = None  # None = mark all


@router.post("/read")
async def mark_read(
    body: MarkReadRequest,
    authorization: Optional[str] = Header(None),
):
    tid = await _get_tid(authorization)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/mark_notifications_read",
                headers=_headers_rep(),
                json={
                    "p_user_id": tid,
                    "p_notification_ids": body.notification_ids,
                },
            )
            if resp.status_code >= 400:
                logger.error(f"mark_read RPC error: {resp.text}")
                raise HTTPException(resp.status_code, "Failed to mark as read")
            updated = resp.json()
            return {"updated": updated if isinstance(updated, int) else 0}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Mark read error: {e}")
        raise HTTPException(500, "Internal server error")


# ── POST /notifications/create — create notification (called by backend) ─────

class CreateNotificationRequest(BaseModel):
    user_id: int
    type: str
    category: str = "SOCIAL"
    meta: dict = {}


@router.post("/create")
async def create_notification(
    body: CreateNotificationRequest,
    authorization: Optional[str] = Header(None),
):
    """
    Create a notification for a user. Intended for internal backend use.
    The row insert triggers Supabase Realtime broadcast automatically.
    """
    tid = await _get_tid(authorization)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/create_notification",
                headers=_headers_rep(),
                json={
                    "p_user_id": body.user_id,
                    "p_type": body.type,
                    "p_category": body.category,
                    "p_meta": body.meta,
                },
            )
            if resp.status_code >= 400:
                logger.error(f"create_notification RPC error: {resp.text}")
                raise HTTPException(resp.status_code, "Failed to create notification")
            new_id = resp.json()
            return {"id": new_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Create notification error: {e}")
        raise HTTPException(500, "Internal server error")


# ── Helper: fire-and-forget notification from other backend services ─────────

async def send_notification(user_id: int, notif_type: str, category: str = "SOCIAL", meta: dict = {}):
    """
    Utility for other backend endpoints to create notifications without going through HTTP.
    Inserts directly into Supabase — triggers Realtime broadcast.
    """
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/create_notification",
                headers={
                    "apikey": SUPABASE_KEY,
                    "Authorization": f"Bearer {SUPABASE_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                },
                json={
                    "p_user_id": user_id,
                    "p_type": notif_type,
                    "p_category": category,
                    "p_meta": meta,
                },
            )
            if resp.status_code >= 400:
                logger.warning(f"send_notification failed for user {user_id}: {resp.text}")
    except Exception as e:
        logger.warning(f"send_notification exception for user {user_id}: {e}")
