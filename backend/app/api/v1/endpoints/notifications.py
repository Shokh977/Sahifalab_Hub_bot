"""
SAHIFALAB — Notification endpoints

Endpoints:
  GET  /api/notifications              — paginated feed (keyset cursor, selective columns)
  GET  /api/notifications/unread-count — lightweight unread badge count
  GET  /api/notifications/{id}         — fetch single notification by id
  POST /api/notifications/read         — mark specific or all notifications as read (RPC)
  POST /api/notifications/create       — internal: create a notification for a user
  POST /api/notifications/push-subscribe   — register browser push subscription
  DELETE /api/notifications/push-subscribe — remove push subscription

All reads use targeted column selection (never SELECT *).
"""
from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel
from typing import Optional, List
import os, logging, httpx, json, asyncio
from functools import partial

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


# ── GET /notifications/{id} — single item (used by Realtime fetchById) ───────
# Must be declared AFTER all explicit string routes (/unread-count, /read)
# so FastAPI's router matches those first (int conversion rejects them anyway).

@router.get("/{notification_id}")
async def get_notification_by_id(
    notification_id: int,
    authorization: Optional[str] = Header(None),
):
    tid = await _get_tid(authorization)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                f"{SUPABASE_URL}/rest/v1/notifications",
                headers={**_headers_rep()},
                params={
                    "id": f"eq.{notification_id}",
                    "user_id": f"eq.{tid}",
                    "select": "id,type,category,meta,is_read,created_at,sender_id",
                    "limit": "1",
                },
            )
            if resp.status_code >= 400:
                raise HTTPException(resp.status_code, "Failed to fetch notification")
            rows = resp.json()
            if not rows:
                raise HTTPException(404, "Notification not found")
            return rows[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_notification_by_id error: {e}")
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
    Create a notification for a user.
    Only the user themselves or an admin can create notifications.
    """
    tid = await _get_tid(authorization)
    # Restrict: users can only notify themselves; admins can target anyone
    admin_ids = [int(x) for x in os.getenv("ADMIN_TELEGRAM_IDS", "").split(",") if x.strip().isdigit()]
    if body.user_id != tid and tid not in admin_ids:
        raise HTTPException(403, "Siz faqat o'zingizga bildirishnoma yaratishingiz mumkin")
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

async def send_notification(user_id: int, notif_type: str, category: str = "SOCIAL", meta: Optional[dict] = None):
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
                    "p_meta": meta or {},
                },
            )
            if resp.status_code >= 400:
                logger.warning(f"send_notification failed for user {user_id}: {resp.text}")
                return
            # Also deliver via Web Push (non-blocking)
            notif_id = resp.json()
            asyncio.create_task(
                _dispatch_push(user_id, notif_type, meta or {}, notif_id)
            )
    except Exception as e:
        logger.warning(f"send_notification exception for user {user_id}: {e}")


# ── Web Push dispatch ────────────────────────────────────────────────────────

VAPID_PRIVATE_KEY  = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_PUBLIC_KEY   = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_CLAIM_EMAIL  = os.getenv("VAPID_CLAIM_EMAIL", "mailto:admin@sahifalab.com")

# Human-readable push titles per notification type
_PUSH_TITLES: dict[str, str] = {
    "follow":              "Yangi obunachi",
    "like":                "Layk",
    "comment":             "Yangi izoh",
    "repost":              "Repost",
    "save":                "Foydali",
    "mention":             "Eslatma",
    "connection_request":  "Ulanish so'rovi",
    "connection_accepted": "So'rov qabul qilindi",
    "level_up":            "Yangi daraja",
    "achievement":         "Yutuq ochildi",
    "xp_reward":           "XP mukofot",
    "course_complete":     "Kurs yakunlandi",
    "certificate":         "Sertifikat tayyor",
    "quiz_pass":           "Test natijasi",
    "new_student":         "Yangi talaba",
    "new_sale":            "Yangi sotish",
    "payout":              "To'lov o'tkazildi",
    "welcome":             "Sahifalab'ga xush kelibsiz",
}

# Body templates — {actor} is replaced with the actor's name at send time
_PUSH_BODY_TPL: dict[str, str] = {
    "follow":              "{actor} sizga obuna bo'ldi.",
    "like":                "{actor} postingizga layk bosdi.",
    "comment":             "{actor} postingizga izoh qoldirdi.",
    "repost":              "{actor} postingizni repost qildi.",
    "save":                "{actor} postingizni foydali deb belgiladi.",
    "mention":             "{actor} sizni eslatib o'tdi.",
    "connection_request":  "{actor} sizga ulanish so'rovi yubordi.",
    "connection_accepted": "{actor} ulanish so'rovingizni qabul qildi.",
    "level_up":            "Tabriklaymiz! Yangi darajaga ko'tarildingiz.",
    "achievement":         "Yangi yutuq ochildi — davom eting!",
    "xp_reward":           "Postingiz ko'p ko'rindi — XP mukofot oldiniz.",
    "course_complete":     "Kurs muvaffaqiyatli yakunlandi.",
    "certificate":         "Sertifikatingiz tayyor — yuklab oling.",
    "quiz_pass":           "Testni muvaffaqiyatli topshirdingiz.",
    "new_student":         "Yangi o'quvchi kursingizga yozildi.",
    "new_sale":            "Yangi daromad tushdi.",
    "payout":              "Daromadingiz hisobingizga o'tkazildi.",
    "welcome":             "Ilm yo'liga xush kelibsiz. Profilingizni to'ldiring.",
}

# Keep _PUSH_BODIES as fallback alias
_PUSH_BODIES = _PUSH_BODY_TPL


async def _dispatch_push(user_id: int, notif_type: str, meta: dict, notif_id: object):
    """Fetch push subscriptions for user and send Web Push to each device."""
    if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
        return  # VAPID not configured — skip silently

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.warning("pywebpush not installed — skipping push delivery")
        return

    # Fetch subscriptions from Supabase
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/get_push_subscriptions_for_user",
                headers=_headers_rep(),
                json={"p_user_id": user_id},
            )
            if resp.status_code >= 400 or not resp.json():
                return
            subscriptions = resp.json()
    except Exception as e:
        logger.warning(f"push: failed to fetch subscriptions for {user_id}: {e}")
        return

    # Build payload
    actor = meta.get("actor_name") or meta.get("first_name") or "Kimdir"
    title = _PUSH_TITLES.get(notif_type, "SAHIFALAB")
    tpl   = _PUSH_BODY_TPL.get(notif_type, "Yangi bildirishnoma")
    body  = tpl.format(actor=actor)

    # Build route (mirrors notificationDictionary logic)
    route = _push_route(notif_type, meta)

    payload = json.dumps({
        "title": title,
        "body":  body,
        "url":   route,
        "tag":   notif_type,
        "icon":  "/sahifalab.jpg",
        "badge": "/sahifalab.jpg",
    })

    vapid_claims = {"sub": VAPID_CLAIM_EMAIL}

    expired_ids: list[int] = []

    for sub in subscriptions:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": {
                "p256dh": sub["p256dh"],
                "auth":   sub["auth"],
            },
        }
        try:
            await asyncio.to_thread(
                partial(
                    webpush,
                    subscription_info=subscription_info,
                    data=payload,
                    vapid_private_key=VAPID_PRIVATE_KEY,
                    vapid_claims=vapid_claims,
                )
            )
        except Exception as exc:
            # 410 Gone = subscription expired → clean up
            is_410 = (
                hasattr(exc, "response") and
                exc.response is not None and
                exc.response.status_code == 410
            )
            if is_410:
                expired_ids.append(sub["id"])
            else:
                logger.warning(f"push: send failed for sub {sub['id']}: {exc}")

    # Remove expired subscriptions
    if expired_ids:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                for sid in expired_ids:
                    await client.post(
                        f"{SUPABASE_URL}/rest/v1/rpc/delete_push_subscription_by_id",
                        headers=_headers(),
                        json={"p_id": sid},
                    )
        except Exception as e:
            logger.warning(f"push: failed to purge expired subs: {e}")


def _push_route(notif_type: str, meta: dict) -> str:
    """Mirror notificationDictionary.ts route() logic in Python."""
    routes = {
        "follow":              f"/profile/{meta.get('actor_id', '')}",
        "connection_request":  f"/profile/{meta.get('actor_id', '')}",
        "connection_accepted": f"/profile/{meta.get('actor_id', '')}",
        "like":            f"/feed?post={meta.get('post_id', '')}" if meta.get("post_id") else "/feed",
        "comment":         f"/feed?post={meta.get('post_id', '')}" if meta.get("post_id") else "/feed",
        "repost":          f"/feed?post={meta.get('post_id', '')}" if meta.get("post_id") else "/feed",
        "save":            f"/feed?post={meta.get('post_id', '')}" if meta.get("post_id") else "/feed",
        "mention":         f"/feed?post={meta.get('post_id', '')}" if meta.get("post_id") else "/feed",
        "new_content":     f"/courses/{meta['course_id']}" if meta.get("course_id") else "/courses",
        "course_complete": f"/courses/{meta['course_id']}" if meta.get("course_id") else "/courses",
        "certificate":     f"/courses/{meta['course_id']}" if meta.get("course_id") else "/profile/me",
        "quiz_pass":       f"/quiz/{meta['quiz_id']}"   if meta.get("quiz_id")   else "/quiz",
        "new_student":     f"/courses/{meta['course_id']}" if meta.get("course_id") else "/teacher",
        "new_sale":        f"/courses/{meta['course_id']}" if meta.get("course_id") else "/teacher",
        "payout":          "/teacher",
        "analytics_report":"/teacher",
        "new_review":      f"/courses/{meta['course_id']}" if meta.get("course_id") else "/teacher",
        "level_up":        "/profile/me",
        "achievement":     "/profile/me",
        "welcome":         "/profile/me",
        "leaderboard_rank":"/leaderboard",
    }
    return routes.get(notif_type, "/notifications")


# ── POST /push-subscribe ─────────────────────────────────────────────────────

class PushSubscribeRequest(BaseModel):
    endpoint:    str
    p256dh:      str
    auth:        str
    user_agent:  Optional[str] = None


@router.post("/push-subscribe")
async def push_subscribe(
    body: PushSubscribeRequest,
    authorization: Optional[str] = Header(None),
):
    """Register or refresh a browser push subscription for the authenticated user."""
    tid = await _get_tid(authorization)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/upsert_push_subscription",
                headers=_headers_rep(),
                json={
                    "p_user_id":  tid,
                    "p_endpoint": body.endpoint,
                    "p256dh":     body.p256dh,
                    "p_auth":     body.auth,
                    "p_ua":       body.user_agent,
                },
            )
            if resp.status_code >= 400:
                logger.error(f"push_subscribe upsert error: {resp.text}")
                raise HTTPException(resp.status_code, "Failed to save subscription")
            return {"id": resp.json(), "vapid_public_key": VAPID_PUBLIC_KEY}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"push_subscribe error: {e}")
        raise HTTPException(500, "Internal server error")


# ── DELETE /push-subscribe ───────────────────────────────────────────────────

class PushUnsubscribeRequest(BaseModel):
    endpoint: str


@router.delete("/push-subscribe")
async def push_unsubscribe(
    body: PushUnsubscribeRequest,
    authorization: Optional[str] = Header(None),
):
    """Remove a push subscription (user opted out or SW unregistered)."""
    tid = await _get_tid(authorization)
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{SUPABASE_URL}/rest/v1/rpc/delete_push_subscription",
                headers=_headers(),
                json={"p_user_id": tid, "p_endpoint": body.endpoint},
            )
            if resp.status_code >= 400:
                logger.error(f"push_unsubscribe error: {resp.text}")
                raise HTTPException(resp.status_code, "Failed to remove subscription")
            return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"push_unsubscribe error: {e}")
        raise HTTPException(500, "Internal server error")


# ── GET /push-vapid-key — public key for frontend subscription ────────────────

@router.get("/push-vapid-key")
async def get_vapid_public_key():
    """Returns the VAPID public key so the frontend can subscribe."""
    key = VAPID_PUBLIC_KEY
    if not key:
        raise HTTPException(503, "Push notifications not configured")
    return {"vapid_public_key": key}
