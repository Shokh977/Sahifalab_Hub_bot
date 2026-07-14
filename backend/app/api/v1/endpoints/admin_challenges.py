"""
admin_challenges.py — Admin CRUD for Musobaqalar cohort challenges (step-21).

Mounted at /api/admin/challenges. Admin-only (verify_admin, reused from admin.py).

POST   /                — create a challenge (target entered in hours, stored as minutes)
GET    /                 — list all challenges with status/participant/completion stats
GET    /{id}             — full detail + full participant list with progress
PATCH  /{id}             — edit. Once a challenge is 'active', only cosmetic
                           fields (title/description/color/icon/is_featured)
                           may change — target_value and dates are frozen
                           server-side, not just hidden in the UI.
POST   /{id}/cancel      — cancel (status='cancelled'); awards/takes nothing

All actions write to challenge_audit_log.
"""
import asyncio
import logging
import uuid
from datetime import datetime, UTC
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db, SessionLocal
from app.api.v1.endpoints.admin import verify_admin
from app.models.admin_models import AdminUser, ChallengeAuditLog

logger = logging.getLogger(__name__)
router = APIRouter()


async def _broadcast_new_challenge(title: str, slug: str) -> None:
    """
    Announce a newly-created FEATURED challenge to every user with a push
    token, batched through Expo's push API exactly like cron.py's
    weekly-report job (max 100 messages/request) — a naive per-user
    asyncio.create_task loop is untested at this scale (~1800+ users) and
    risks hammering the push service; this is the same pattern already
    proven to work for the weekly digest.

    Runs after the request has already returned, so it opens its OWN db
    session (the request-scoped one from Depends(get_db) may already be
    closed by the time this fires — same reasoning as flashcards.py's
    _finish_clone_in_background).
    """
    bg_db = SessionLocal()
    try:
        rows = bg_db.execute(text("""
            SELECT user_settings->>'expo_push_token' AS token
            FROM profiles
            WHERE user_settings->>'expo_push_token' IS NOT NULL
              AND user_settings->>'expo_push_token' != ''
        """)).fetchall()
    finally:
        bg_db.close()

    messages = [
        {
            "to": r.token,
            "title": "Yangi musobaqa boshlandi! 🏁",
            "body": f"{title} — hoziroq qo'shiling!",
            "data": {"screen": "challenge_detail", "slug": slug},
            "sound": "default",
        }
        for r in rows if r.token
    ]
    if not messages:
        return

    for i in range(0, len(messages), 100):
        batch = messages[i:i + 100]
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=batch,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
        except Exception:
            logger.error("Failed to broadcast new-challenge announcement batch %d", i // 100, exc_info=True)

_EDITABLE_ANYTIME = {"title", "description", "color", "icon", "is_featured", "max_participants", "badge_key", "reward_xp", "cover_image_url"}
_EDITABLE_ONLY_UPCOMING = {"target_value", "starts_at", "ends_at", "join_deadline", "metric"}


def _log(db: Session, action: str, challenge_id: Optional[str], admin: AdminUser, details: dict) -> None:
    db.add(ChallengeAuditLog(
        challenge_id=challenge_id,
        action=action,
        admin_telegram_id=admin.telegram_id,
        details=details,
    ))


class ChallengeCreate(BaseModel):
    slug:             str
    title:            str
    description:      Optional[str] = None
    metric:           str = "focus_minutes"
    target_hours:     float = Field(..., gt=0, description="Entered in hours; stored as minutes")
    starts_at:        datetime
    ends_at:          datetime
    join_deadline:    Optional[datetime] = None
    reward_xp:        int = 0
    badge_key:        Optional[str] = None
    color:            str = "#F5A623"
    icon:             str = "timer"
    is_featured:      bool = False
    max_participants: Optional[int] = None
    cover_image_url:  Optional[str] = None


class ChallengeUpdate(BaseModel):
    title:            Optional[str] = None
    description:      Optional[str] = None
    color:            Optional[str] = None
    icon:             Optional[str] = None
    is_featured:      Optional[bool] = None
    max_participants: Optional[int] = None
    badge_key:        Optional[str] = None
    reward_xp:        Optional[int] = None
    cover_image_url:  Optional[str] = None
    # Only editable while status == 'upcoming' — enforced below, not just in the UI
    target_hours:     Optional[float] = Field(None, gt=0)
    starts_at:        Optional[datetime] = None
    ends_at:          Optional[datetime] = None
    join_deadline:    Optional[datetime] = None
    metric:           Optional[str] = None


def _challenge_admin_dict(row) -> dict:
    completion_rate = (row.completion_count / row.participant_count * 100) if row.participant_count > 0 else 0.0
    return {
        "id":                str(row.id),
        "slug":               row.slug,
        "title":              row.title,
        "description":        row.description,
        "metric":             row.metric,
        "target_value":       row.target_value,
        "target_hours":       round(row.target_value / 60, 2),
        "starts_at":          row.starts_at.isoformat(),
        "ends_at":            row.ends_at.isoformat(),
        "join_deadline":      row.join_deadline.isoformat() if row.join_deadline else None,
        "is_official":        row.is_official,
        "created_by":         row.created_by,
        "is_private":         row.is_private,
        "max_participants":   row.max_participants,
        "reward_xp":          row.reward_xp,
        "badge_key":          row.badge_key,
        "color":              row.color,
        "icon":               row.icon,
        "cover_image_url":    row.cover_image_url,
        "is_featured":        row.is_featured,
        "status":             row.status,
        "participant_count":  row.participant_count,
        "completion_count":   row.completion_count,
        "completion_rate":    round(completion_rate, 1),
        "created_at":         row.created_at.isoformat(),
    }


@router.post("")
async def create_challenge(
    body: ChallengeCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    admin = await verify_admin(authorization=authorization, db=db)

    if body.metric != "focus_minutes":
        raise HTTPException(status_code=422, detail="Faqat 'focus_minutes' metrikasi hozircha ishlaydi")
    if body.ends_at <= body.starts_at:
        raise HTTPException(status_code=422, detail="Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak")

    existing = db.execute(text("SELECT id FROM challenges WHERE slug = :slug"), {"slug": body.slug}).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Bu slug allaqachon band")

    if body.badge_key:
        existing_badge = db.execute(
            text("SELECT id FROM challenges WHERE badge_key = :key"), {"key": body.badge_key},
        ).fetchone()
        if existing_badge:
            raise HTTPException(status_code=400, detail="Bu belgi kaliti (badge_key) boshqa musobaqada band")

    target_minutes = round(body.target_hours * 60)
    now = datetime.now(UTC)
    status = "active" if body.starts_at <= now else "upcoming"

    try:
        row = db.execute(
            text("""
                INSERT INTO challenges (
                    slug, title, description, metric, target_value,
                    starts_at, ends_at, join_deadline, is_official, created_by,
                    reward_xp, badge_key, color, icon, cover_image_url, is_featured, max_participants, status
                ) VALUES (
                    :slug, :title, :description, :metric, :target_value,
                    :starts_at, :ends_at, :join_deadline, TRUE, NULL,
                    :reward_xp, :badge_key, :color, :icon, :cover_image_url, :is_featured, :max_participants, :status
                ) RETURNING *
            """),
            {
                "slug": body.slug, "title": body.title, "description": body.description,
                "metric": body.metric, "target_value": target_minutes,
                "starts_at": body.starts_at, "ends_at": body.ends_at, "join_deadline": body.join_deadline,
                "reward_xp": body.reward_xp, "badge_key": body.badge_key,
                "color": body.color, "icon": body.icon, "cover_image_url": body.cover_image_url,
                "is_featured": body.is_featured,
                "max_participants": body.max_participants, "status": status,
            },
        ).fetchone()
        _log(db, "challenge_created", str(row.id), admin, {"slug": body.slug, "title": body.title})
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Failed to create challenge slug=%s", body.slug, exc_info=True)
        raise HTTPException(status_code=500, detail="Musobaqa yaratishda xatolik")

    # Announce featured challenges to everyone — this is the marketing/
    # discovery engine (step-21 Phase 6 framing). Non-featured challenges
    # don't broadcast, to avoid spamming for every low-key/test challenge.
    if body.is_featured:
        asyncio.create_task(_broadcast_new_challenge(body.title, body.slug))

    return _challenge_admin_dict(row)


@router.get("")
async def list_challenges_admin(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    await verify_admin(authorization=authorization, db=db)
    rows = db.execute(text("SELECT * FROM challenges ORDER BY created_at DESC")).fetchall()
    return [_challenge_admin_dict(r) for r in rows]


@router.get("/{challenge_id}")
async def get_challenge_admin(
    challenge_id: uuid.UUID,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    await verify_admin(authorization=authorization, db=db)
    row = db.execute(text("SELECT * FROM challenges WHERE id = :cid"), {"cid": str(challenge_id)}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Musobaqa topilmadi")

    participants = db.execute(
        text("""
            SELECT p.telegram_id, p.first_name, p.site_username AS username,
                   cp.progress_value, cp.completed_at, cp.joined_at, cp.xp_awarded
            FROM challenge_participants cp
            JOIN profiles p ON p.telegram_id = cp.user_id
            WHERE cp.challenge_id = :cid
            ORDER BY cp.progress_value DESC, cp.joined_at ASC
        """),
        {"cid": str(challenge_id)},
    ).fetchall()

    result = _challenge_admin_dict(row)
    result["participants"] = [
        {
            "user_id": p.telegram_id, "first_name": p.first_name, "username": p.username,
            "progress_value": p.progress_value, "xp_awarded": p.xp_awarded,
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
            "joined_at": p.joined_at.isoformat(),
        }
        for p in participants
    ]
    return result


@router.patch("/{challenge_id}")
async def update_challenge(
    challenge_id: uuid.UUID,
    body: ChallengeUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    admin = await verify_admin(authorization=authorization, db=db)
    row = db.execute(text("SELECT * FROM challenges WHERE id = :cid"), {"cid": str(challenge_id)}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Musobaqa topilmadi")

    updates = body.model_dump(exclude_none=True, exclude={"target_hours"})
    if body.target_hours is not None:
        updates["target_value"] = round(body.target_hours * 60)

    if not updates:
        raise HTTPException(status_code=400, detail="O'zgartiriladigan maydon topilmadi")

    if updates.get("badge_key"):
        existing_badge = db.execute(
            text("SELECT id FROM challenges WHERE badge_key = :key AND id != :cid"),
            {"key": updates["badge_key"], "cid": str(challenge_id)},
        ).fetchone()
        if existing_badge:
            raise HTTPException(status_code=400, detail="Bu belgi kaliti (badge_key) boshqa musobaqada band")

    # Server-side enforcement: target_value and dates are frozen once the
    # challenge is no longer 'upcoming' — never relax this, it would be unfair
    # to participants already competing under the original terms.
    if row.status != "upcoming":
        locked_fields = set(updates.keys()) & (_EDITABLE_ONLY_UPCOMING | {"target_value"})
        if locked_fields:
            raise HTTPException(
                status_code=400,
                detail=f"Musobaqa faol bo'lgach, quyidagilarni o'zgartirib bo'lmaydi: {', '.join(sorted(locked_fields))}",
            )

    if "ends_at" in updates or "starts_at" in updates:
        new_start = updates.get("starts_at", row.starts_at)
        new_end   = updates.get("ends_at", row.ends_at)
        if new_end <= new_start:
            raise HTTPException(status_code=422, detail="Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak")

    set_clause = ", ".join(f"{k} = :{k}" for k in updates.keys())
    try:
        db.execute(
            text(f"UPDATE challenges SET {set_clause} WHERE id = :cid"),
            {**updates, "cid": str(challenge_id)},
        )
        _log(db, "challenge_updated", str(challenge_id), admin, updates)
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Failed to update challenge_id=%s", challenge_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Yangilashda xatolik")

    updated = db.execute(text("SELECT * FROM challenges WHERE id = :cid"), {"cid": str(challenge_id)}).fetchone()
    return _challenge_admin_dict(updated)


@router.post("/{challenge_id}/cancel")
async def cancel_challenge(
    challenge_id: uuid.UUID,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Cancel a challenge. Awards nothing, takes nothing away from participants."""
    admin = await verify_admin(authorization=authorization, db=db)
    row = db.execute(text("SELECT * FROM challenges WHERE id = :cid"), {"cid": str(challenge_id)}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Musobaqa topilmadi")
    if row.status == "cancelled":
        raise HTTPException(status_code=400, detail="Musobaqa allaqachon bekor qilingan")

    try:
        db.execute(text("UPDATE challenges SET status = 'cancelled' WHERE id = :cid"), {"cid": str(challenge_id)})
        _log(db, "challenge_cancelled", str(challenge_id), admin, {"title": row.title})
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Failed to cancel challenge_id=%s", challenge_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Bekor qilishda xatolik")

    # Notify participants (best-effort, warm tone — see step-21 Phase 5)
    try:
        from app.api.v1.endpoints.notifications import send_notification
        import asyncio
        participants = db.execute(
            text("SELECT user_id FROM challenge_participants WHERE challenge_id = :cid"),
            {"cid": str(challenge_id)},
        ).fetchall()
        for p in participants:
            asyncio.create_task(send_notification(
                p.user_id, "challenge_cancelled", category="SYSTEM",
                meta={"challenge_id": str(challenge_id), "title": row.title},
            ))
    except Exception:
        logger.error("Failed to notify participants of cancellation for challenge_id=%s", challenge_id, exc_info=True)

    return {"ok": True}
