"""
admin_challenges.py — Admin CRUD for Musobaqalar challenges (step-21,
extended step-25 — metrics/types/team battles).

Mounted at /api/admin/challenges. Admin-only (verify_admin, reused from admin.py).

POST   /                       — create a challenge (type-specific fields — see ChallengeCreate)
GET    /                       — list all challenges with status/participant/completion stats
GET    /{id}                   — full detail + participant list (split by team / ranked by sprint)
PATCH  /{id}                   — edit. Once a challenge is 'active', only cosmetic
                                 fields may change — metric, challenge_type, target,
                                 daily_minimum, required_days, winner_count, team
                                 config, and dates are frozen server-side.
POST   /{id}/cancel            — cancel (status='cancelled'); awards/takes nothing

Anti-overlap rule (step-25 Part 2 — the core fix): at most one challenge per
metric may be upcoming/active with an overlapping date range. Enforced here,
server-side, on create AND update. No override flag — if two focus
challenges are wanted, they run sequentially.

All actions write to challenge_audit_log.
"""
import asyncio
import logging
import uuid
from datetime import datetime, UTC
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db, SessionLocal
from app.api.v1.endpoints.admin import verify_admin
from app.models.admin_models import AdminUser, ChallengeAuditLog
from app.services.challenge_service import IMPLEMENTED_METRICS

logger = logging.getLogger(__name__)
router = APIRouter()

CHALLENGE_TYPES = {"cumulative", "consistency", "sprint", "team"}


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
            "title": "Yangi bellashuv boshlandi! 🏁",
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
_EDITABLE_ONLY_UPCOMING = {
    "target_value", "starts_at", "ends_at", "join_deadline", "metric", "challenge_type",
    "daily_minimum", "required_days", "allowed_misses", "winner_count",
    "team_a_name", "team_a_color", "team_a_icon", "team_b_name", "team_b_color", "team_b_icon",
}


def _log(db: Session, action: str, challenge_id: Optional[str], admin: AdminUser, details: dict) -> None:
    db.add(ChallengeAuditLog(
        challenge_id=challenge_id,
        action=action,
        admin_telegram_id=admin.telegram_id,
        details=details,
    ))


def _check_metric_overlap(db: Session, metric: str, starts_at: datetime, ends_at: datetime, exclude_id: Optional[str] = None):
    """
    step-25 Part 2 — the core anti-double-dipping fix. At most one
    upcoming/active challenge per metric may have an overlapping date range.
    Returns the conflicting challenge row (id, slug, title) if one exists.
    """
    params = {"metric": metric, "starts_at": starts_at, "ends_at": ends_at}
    exclude_clause = ""
    if exclude_id:
        exclude_clause = "AND id != :exclude_id"
        params["exclude_id"] = exclude_id
    return db.execute(
        text(f"""
            SELECT id, slug, title FROM challenges
            WHERE metric = :metric
              AND status IN ('upcoming', 'active')
              AND starts_at < :ends_at AND ends_at > :starts_at
              {exclude_clause}
            LIMIT 1
        """),
        params,
    ).fetchone()


class ChallengeCreate(BaseModel):
    slug:             str
    title:            str
    description:      Optional[str] = None
    metric:           str = "focus_minutes"
    challenge_type:   str = "cumulative"
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

    # cumulative — entered in the metric's natural unit (hours for
    # focus_minutes, cards for flashcard_reviews, count for the rest);
    # converted to storage units server-side (see _target_value_from_amount).
    target_amount:    Optional[float] = Field(None, gt=0)
    # consistency
    daily_minimum:    Optional[int] = Field(None, gt=0)
    required_days:    Optional[int] = Field(None, gt=0)
    allowed_misses:   int = 1
    # sprint
    winner_count:     Optional[int] = Field(None, gt=0)
    # team
    team_a_name:      Optional[str] = None
    team_a_color:     Optional[str] = None
    team_a_icon:      Optional[str] = None
    team_b_name:      Optional[str] = None
    team_b_color:     Optional[str] = None
    team_b_icon:      Optional[str] = None

    @model_validator(mode="after")
    def _validate_type_fields(self):
        if self.challenge_type not in CHALLENGE_TYPES:
            raise ValueError(f"challenge_type noto'g'ri: {self.challenge_type}")
        if self.challenge_type == "cumulative" and not self.target_amount:
            raise ValueError("To'plash turi uchun maqsad qiymati kerak")
        if self.challenge_type == "consistency" and (not self.daily_minimum or not self.required_days):
            raise ValueError("Izchillik turi uchun kunlik minimum va kunlar soni kerak")
        if self.challenge_type == "sprint" and not self.winner_count:
            raise ValueError("Sprint turi uchun g'oliblar soni kerak")
        if self.challenge_type == "team" and not all([self.team_a_name, self.team_a_color, self.team_b_name, self.team_b_color]):
            raise ValueError("Guruhlar jangi uchun ikkala guruh nomi va rangi kerak")
        return self


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
    challenge_type:   Optional[str] = None
    target_amount:    Optional[float] = Field(None, gt=0)
    starts_at:        Optional[datetime] = None
    ends_at:          Optional[datetime] = None
    join_deadline:    Optional[datetime] = None
    metric:           Optional[str] = None
    daily_minimum:    Optional[int] = Field(None, gt=0)
    required_days:    Optional[int] = Field(None, gt=0)
    allowed_misses:   Optional[int] = None
    winner_count:     Optional[int] = Field(None, gt=0)
    team_a_name:      Optional[str] = None
    team_a_color:     Optional[str] = None
    team_a_icon:      Optional[str] = None
    team_b_name:      Optional[str] = None
    team_b_color:     Optional[str] = None
    team_b_icon:      Optional[str] = None


def _target_value_from_amount(metric: str, amount: float) -> int:
    """
    Admins enter the target in the metric's natural unit — hours for
    focus_minutes, cards/lessons/courses/tests as a plain count for the
    rest. Only focus_minutes needs an hours→minutes conversion; every other
    metric's storage unit already IS the natural unit (getting this wrong
    would silently multiply e.g. a "500 cards" target by 60).
    """
    if metric == "focus_minutes":
        return round(amount * 60)
    return round(amount)


def _target_amount_from_value(metric: str, target_value: Optional[int]) -> Optional[float]:
    if target_value is None:
        return None
    if metric == "focus_minutes":
        return round(target_value / 60, 2)
    return float(target_value)


def _challenge_admin_dict(row) -> dict:
    completion_rate = (row.completion_count / row.participant_count * 100) if row.participant_count > 0 else 0.0
    return {
        "id":                str(row.id),
        "slug":               row.slug,
        "title":              row.title,
        "description":        row.description,
        "metric":             row.metric,
        "challenge_type":     row.challenge_type,
        "target_value":       row.target_value,
        "target_amount":      _target_amount_from_value(row.metric, row.target_value),
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
        "daily_minimum":      row.daily_minimum,
        "required_days":      row.required_days,
        "allowed_misses":     row.allowed_misses,
        "winner_count":       row.winner_count,
        "team_a_name":        row.team_a_name,
        "team_a_color":       row.team_a_color,
        "team_a_icon":        row.team_a_icon,
        "team_b_name":        row.team_b_name,
        "team_b_color":       row.team_b_color,
        "team_b_icon":        row.team_b_icon,
    }


@router.post("")
async def create_challenge(
    body: ChallengeCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    admin = await verify_admin(authorization=authorization, db=db)

    if body.metric not in IMPLEMENTED_METRICS:
        raise HTTPException(status_code=422, detail=f"'{body.metric}' metrikasi hozircha ishlamaydi (Tez kunda)")
    if body.ends_at <= body.starts_at:
        raise HTTPException(status_code=422, detail="Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak")

    if body.challenge_type == "consistency":
        duration_days = (body.ends_at - body.starts_at).days
        if body.required_days > duration_days:
            raise HTTPException(status_code=422, detail="Kunlar soni bellashuv davomidan oshib ketmasligi kerak")

    existing = db.execute(text("SELECT id FROM challenges WHERE slug = :slug"), {"slug": body.slug}).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Bu slug allaqachon band")

    if body.badge_key:
        existing_badge = db.execute(
            text("SELECT id FROM challenges WHERE badge_key = :key"), {"key": body.badge_key},
        ).fetchone()
        if existing_badge:
            raise HTTPException(status_code=400, detail="Bu belgi kaliti (badge_key) boshqa bellashuvda band")

    # step-25 Part 2 — the core fix, no override flag.
    conflict = _check_metric_overlap(db, body.metric, body.starts_at, body.ends_at)
    if conflict:
        raise HTTPException(
            status_code=400,
            detail=f"Bu vaqt oralig'ida ushbu metrika bo'yicha faol bellashuv allaqachon mavjud: "
                   f"«{conflict.title}». Avval uni yakunlang yoki sanalarni o'zgartiring.",
        )

    target_value = _target_value_from_amount(body.metric, body.target_amount) if body.target_amount else None
    now = datetime.now(UTC)
    status = "active" if body.starts_at <= now else "upcoming"

    try:
        row = db.execute(
            text("""
                INSERT INTO challenges (
                    slug, title, description, metric, challenge_type, target_value,
                    starts_at, ends_at, join_deadline, is_official, created_by,
                    reward_xp, badge_key, color, icon, cover_image_url, is_featured, max_participants, status,
                    daily_minimum, required_days, allowed_misses, winner_count,
                    team_a_name, team_a_color, team_a_icon, team_b_name, team_b_color, team_b_icon
                ) VALUES (
                    :slug, :title, :description, :metric, :challenge_type, :target_value,
                    :starts_at, :ends_at, :join_deadline, TRUE, NULL,
                    :reward_xp, :badge_key, :color, :icon, :cover_image_url, :is_featured, :max_participants, :status,
                    :daily_minimum, :required_days, :allowed_misses, :winner_count,
                    :team_a_name, :team_a_color, :team_a_icon, :team_b_name, :team_b_color, :team_b_icon
                ) RETURNING *
            """),
            {
                "slug": body.slug, "title": body.title, "description": body.description,
                "metric": body.metric, "challenge_type": body.challenge_type, "target_value": target_value,
                "starts_at": body.starts_at, "ends_at": body.ends_at, "join_deadline": body.join_deadline,
                "reward_xp": body.reward_xp, "badge_key": body.badge_key,
                "color": body.color, "icon": body.icon, "cover_image_url": body.cover_image_url,
                "is_featured": body.is_featured,
                "max_participants": body.max_participants, "status": status,
                "daily_minimum": body.daily_minimum, "required_days": body.required_days,
                "allowed_misses": body.allowed_misses, "winner_count": body.winner_count,
                "team_a_name": body.team_a_name, "team_a_color": body.team_a_color, "team_a_icon": body.team_a_icon,
                "team_b_name": body.team_b_name, "team_b_color": body.team_b_color, "team_b_icon": body.team_b_icon,
            },
        ).fetchone()
        _log(db, "challenge_created", str(row.id), admin, {"slug": body.slug, "title": body.title, "type": body.challenge_type})
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Failed to create challenge slug=%s", body.slug, exc_info=True)
        raise HTTPException(status_code=500, detail="Bellashuv yaratishda xatolik")

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


@router.get("/check-overlap")
async def check_overlap_live(
    metric: str,
    starts_at: datetime,
    ends_at: datetime,
    exclude_id: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Live anti-overlap validation for the admin form, before save (step-25 Part 6)."""
    await verify_admin(authorization=authorization, db=db)
    conflict = _check_metric_overlap(db, metric, starts_at, ends_at, exclude_id)
    if not conflict:
        return {"conflict": None}
    return {"conflict": {"id": str(conflict.id), "slug": conflict.slug, "title": conflict.title}}


@router.get("/{challenge_id}")
async def get_challenge_admin(
    challenge_id: uuid.UUID,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    await verify_admin(authorization=authorization, db=db)
    row = db.execute(text("SELECT * FROM challenges WHERE id = :cid"), {"cid": str(challenge_id)}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Bellashuv topilmadi")

    order_clause = "cp.progress_value DESC, cp.joined_at ASC"
    participants = db.execute(
        text(f"""
            SELECT p.telegram_id, p.first_name, p.site_username AS username,
                   cp.progress_value, cp.completed_at, cp.joined_at, cp.xp_awarded,
                   cp.team, cp.qualifying_days, cp.current_run, cp.misses_used,
                   cp.failed_at, cp.final_rank, cp.is_winner
            FROM challenge_participants cp
            JOIN profiles p ON p.telegram_id = cp.user_id
            WHERE cp.challenge_id = :cid
            ORDER BY {order_clause}
        """),
        {"cid": str(challenge_id)},
    ).fetchall()

    result = _challenge_admin_dict(row)
    participant_list = [
        {
            "user_id": p.telegram_id, "first_name": p.first_name, "username": p.username,
            "progress_value": p.progress_value, "xp_awarded": p.xp_awarded,
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
            "joined_at": p.joined_at.isoformat(),
            "team": p.team, "qualifying_days": p.qualifying_days, "current_run": p.current_run,
            "misses_used": p.misses_used, "failed_at": p.failed_at.isoformat() if p.failed_at else None,
            "final_rank": p.final_rank, "is_winner": p.is_winner,
        }
        for p in participants
    ]

    if row.challenge_type == "team":
        result["participants_team_a"] = [p for p in participant_list if p["team"] == "A"]
        result["participants_team_b"] = [p for p in participant_list if p["team"] == "B"]
        result["team_a_total"] = sum(p["progress_value"] for p in result["participants_team_a"])
        result["team_b_total"] = sum(p["progress_value"] for p in result["participants_team_b"])
    else:
        result["participants"] = participant_list

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
        raise HTTPException(status_code=404, detail="Bellashuv topilmadi")

    updates = body.model_dump(exclude_none=True, exclude={"target_amount"})
    if body.target_amount is not None:
        updates["target_value"] = _target_value_from_amount(updates.get("metric", row.metric), body.target_amount)

    if not updates:
        raise HTTPException(status_code=400, detail="O'zgartiriladigan maydon topilmadi")

    if updates.get("badge_key"):
        existing_badge = db.execute(
            text("SELECT id FROM challenges WHERE badge_key = :key AND id != :cid"),
            {"key": updates["badge_key"], "cid": str(challenge_id)},
        ).fetchone()
        if existing_badge:
            raise HTTPException(status_code=400, detail="Bu belgi kaliti (badge_key) boshqa bellashuvda band")

    # Server-side enforcement: type/metric/target/dates/team-config are frozen
    # once the challenge is no longer 'upcoming' — never relax this, it would
    # be unfair to people already competing under the original terms.
    if row.status != "upcoming":
        locked_fields = set(updates.keys()) & (_EDITABLE_ONLY_UPCOMING | {"target_value"})
        if locked_fields:
            raise HTTPException(
                status_code=400,
                detail=f"Bellashuv faol bo'lgach, quyidagilarni o'zgartirib bo'lmaydi: {', '.join(sorted(locked_fields))}",
            )

    new_start = updates.get("starts_at", row.starts_at)
    new_end   = updates.get("ends_at", row.ends_at)
    if "ends_at" in updates or "starts_at" in updates:
        if new_end <= new_start:
            raise HTTPException(status_code=422, detail="Tugash sanasi boshlanish sanasidan keyin bo'lishi kerak")

    # Anti-overlap re-check whenever metric or dates are part of the edit
    # (only reachable when status == 'upcoming', per the lock above).
    if {"metric", "starts_at", "ends_at"} & set(updates.keys()):
        new_metric = updates.get("metric", row.metric)
        conflict = _check_metric_overlap(db, new_metric, new_start, new_end, exclude_id=str(challenge_id))
        if conflict:
            raise HTTPException(
                status_code=400,
                detail=f"Bu vaqt oralig'ida ushbu metrika bo'yicha faol bellashuv allaqachon mavjud: "
                       f"«{conflict.title}». Avval uni yakunlang yoki sanalarni o'zgartiring.",
            )

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
        raise HTTPException(status_code=404, detail="Bellashuv topilmadi")
    if row.status == "cancelled":
        raise HTTPException(status_code=400, detail="Bellashuv allaqachon bekor qilingan")

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
