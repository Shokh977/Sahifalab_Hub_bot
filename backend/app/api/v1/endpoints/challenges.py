"""
challenges.py — Musobaqalar: cohort focus challenges (step-21).

GET    /api/challenges                    — list (upcoming/active/ended/all)
GET    /api/challenges/{slug}             — detail + caller state + leaderboard slice
POST   /api/challenges/{id}/join          — join (FREE — no XP cost, ever)
DELETE /api/challenges/{id}/leave         — leave (only while not completed)
GET    /api/challenges/{id}/leaderboard   — ranked participants + caller's own rank
GET    /api/challenges/me                 — caller's active + past challenges

Product rules enforced here (see step-21 spec — do not relax these):
  - Joining NEVER costs XP. There is no code path in this file that debits
    total_xp on join. If you're tempted to add one, stop and re-read the spec.
  - Progress and completion are written exclusively by
    app/services/challenge_service.py (called from record_study_activity),
    inside the same transaction as the study session. Nothing in this file
    ever writes challenge_participants.progress_value directly.
  - This file never touches profiles.streak_days, streak_stages, or
    user_stage_completions. Challenge completion is a separate economy from
    the tree/streak by design.
"""
import logging
import uuid
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)
router = APIRouter()


async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return telegram_id


def _challenge_dict(row, caller_participation: Optional[dict] = None, avatars: Optional[list] = None) -> dict:
    d = {
        "id":                str(row.id),
        "slug":               row.slug,
        "title":              row.title,
        "description":        row.description,
        "metric":             row.metric,
        "target_value":       row.target_value,
        "starts_at":          row.starts_at.isoformat(),
        "ends_at":            row.ends_at.isoformat(),
        "join_deadline":      row.join_deadline.isoformat() if row.join_deadline else None,
        "status":             row.status,
        "participant_count":  row.participant_count,
        "completion_count":   row.completion_count,
        "reward_xp":          row.reward_xp,
        "badge_key":          row.badge_key,
        "color":              row.color,
        "icon":               row.icon,
        "is_featured":        row.is_featured,
        "max_participants":   row.max_participants,
        "cover_image_url":    row.cover_image_url,
        "participant_avatars": avatars or [],
    }
    if caller_participation is not None:
        d["joined"] = True
        d["progress_value"] = caller_participation["progress_value"]
        d["completed_at"] = caller_participation["completed_at"].isoformat() if caller_participation["completed_at"] else None
        d["rank"] = caller_participation.get("rank")
    else:
        d["joined"] = False
        d["progress_value"] = 0
        d["completed_at"] = None
        d["rank"] = None
    return d


def _fetch_avatar_map(db: Session, challenge_ids: list) -> dict:
    """
    Up to 4 recent-joiner avatar URLs per challenge, for the Ochiq card's
    participant stack (step-23). Decoration, not a leaderboard — cheap by
    design: one batched query, capped at 4 rows/challenge via ROW_NUMBER.
    """
    if not challenge_ids:
        return {}
    rows = db.execute(
        text("""
            SELECT challenge_id, photo_url FROM (
                SELECT cp.challenge_id, p.photo_url,
                       ROW_NUMBER() OVER (PARTITION BY cp.challenge_id ORDER BY cp.joined_at DESC) AS rn
                FROM challenge_participants cp
                JOIN profiles p ON p.telegram_id = cp.user_id
                WHERE cp.challenge_id = ANY(:ids) AND p.photo_url IS NOT NULL AND p.photo_url != ''
            ) ranked
            WHERE rn <= 4
        """),
        {"ids": challenge_ids},
    ).fetchall()
    avatar_map: dict = {}
    for r in rows:
        avatar_map.setdefault(r.challenge_id, []).append(r.photo_url)
    return avatar_map


# ── List ─────────────────────────────────────────────────────────────────────

@router.get("")
async def list_challenges(
    status: str = Query("upcoming_active", description="upcoming|active|ended|all|upcoming_active"),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    if status == "upcoming_active":
        status_filter = "status IN ('upcoming', 'active')"
        params: dict = {}
    elif status == "all":
        status_filter = "TRUE"
        params = {}
    elif status in ("upcoming", "active", "ended", "cancelled"):
        status_filter = "status = :status"
        params = {"status": status}
    else:
        raise HTTPException(status_code=422, detail="Invalid status filter")

    rows = db.execute(
        text(f"""
            SELECT * FROM challenges
            WHERE {status_filter}
            ORDER BY is_featured DESC, starts_at ASC
        """),
        params,
    ).fetchall()

    challenge_ids = [r.id for r in rows]
    participation_map: dict = {}
    if challenge_ids:
        p_rows = db.execute(
            text("""
                SELECT challenge_id, progress_value, completed_at
                FROM challenge_participants
                WHERE user_id = :uid AND challenge_id = ANY(:ids)
            """),
            {"uid": caller_id, "ids": challenge_ids},
        ).fetchall()
        participation_map = {p.challenge_id: {"progress_value": p.progress_value, "completed_at": p.completed_at} for p in p_rows}

    avatar_map = _fetch_avatar_map(db, challenge_ids)
    return [_challenge_dict(r, participation_map.get(r.id), avatar_map.get(r.id)) for r in rows]


# ── Detail ───────────────────────────────────────────────────────────────────

@router.get("/me")
async def my_challenges(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Caller's active + past challenges with progress (Musobaqalar tab, Taymer chip)."""
    rows = db.execute(
        text("""
            SELECT c.*, cp.progress_value, cp.completed_at, cp.joined_at
            FROM challenge_participants cp
            JOIN challenges c ON c.id = cp.challenge_id
            WHERE cp.user_id = :uid
            ORDER BY
                CASE c.status WHEN 'active' THEN 0 WHEN 'upcoming' THEN 1 ELSE 2 END,
                c.starts_at DESC
        """),
        {"uid": caller_id},
    ).fetchall()

    avatar_map = _fetch_avatar_map(db, [r.id for r in rows])
    result = []
    for r in rows:
        rank = None
        if r.status == "active":
            rank_row = db.execute(
                text("""
                    SELECT rank FROM (
                        SELECT user_id, RANK() OVER (ORDER BY progress_value DESC, joined_at ASC) AS rank
                        FROM challenge_participants WHERE challenge_id = :cid
                    ) ranked WHERE user_id = :uid
                """),
                {"cid": r.id, "uid": caller_id},
            ).fetchone()
            rank = rank_row.rank if rank_row else None
        result.append(_challenge_dict(r, {"progress_value": r.progress_value, "completed_at": r.completed_at, "rank": rank}, avatar_map.get(r.id)))
    return result


@router.get("/{slug}")
async def get_challenge(
    slug: str,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    row = db.execute(text("SELECT * FROM challenges WHERE slug = :slug"), {"slug": slug}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Musobaqa topilmadi")

    participation = db.execute(
        text("SELECT progress_value, completed_at FROM challenge_participants WHERE challenge_id = :cid AND user_id = :uid"),
        {"cid": row.id, "uid": caller_id},
    ).fetchone()
    caller_participation = {"progress_value": participation.progress_value, "completed_at": participation.completed_at} if participation else None

    leaderboard_rows = db.execute(
        text("""
            SELECT
                p.telegram_id, p.first_name, p.site_username AS username, p.photo_url,
                cp.progress_value, cp.completed_at,
                RANK() OVER (ORDER BY cp.progress_value DESC, cp.joined_at ASC) AS rank
            FROM challenge_participants cp
            JOIN profiles p ON p.telegram_id = cp.user_id
            WHERE cp.challenge_id = :cid
            ORDER BY rank ASC
            LIMIT 20
        """),
        {"cid": row.id},
    ).fetchall()

    avatar_map = _fetch_avatar_map(db, [row.id])
    result = _challenge_dict(row, caller_participation, avatar_map.get(row.id))
    result["leaderboard"] = [
        {
            "rank": r.rank, "user_id": r.telegram_id, "first_name": r.first_name,
            "username": r.username, "photo_url": r.photo_url,
            "progress_value": r.progress_value,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in leaderboard_rows
    ]
    return result


# ── Join / Leave ───────────────────────────────────────────────────────────────

@router.post("/{challenge_id}/join")
async def join_challenge(
    challenge_id: uuid.UUID,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """
    Join a challenge. ALWAYS FREE — no XP cost, no stake. This endpoint only
    ever INSERTs a challenge_participants row; it never debits total_xp.
    """
    row = db.execute(text("SELECT * FROM challenges WHERE id = :cid"), {"cid": str(challenge_id)}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Musobaqa topilmadi")

    if row.status not in ("upcoming", "active"):
        raise HTTPException(status_code=400, detail="Musobaqa allaqachon tugagan")

    now = datetime.now(UTC)
    if row.join_deadline and now > row.join_deadline:
        raise HTTPException(status_code=400, detail="Qo'shilish muddati tugagan")

    if row.max_participants is not None and row.participant_count >= row.max_participants:
        raise HTTPException(status_code=400, detail="Joylar to'lgan")

    existing = db.execute(
        text("SELECT id FROM challenge_participants WHERE challenge_id = :cid AND user_id = :uid"),
        {"cid": str(challenge_id), "uid": caller_id},
    ).fetchone()
    if existing:
        raise HTTPException(status_code=400, detail="Siz allaqachon qo'shilgansiz")

    try:
        db.execute(
            text("""
                INSERT INTO challenge_participants (challenge_id, user_id)
                VALUES (:cid, :uid)
            """),
            {"cid": str(challenge_id), "uid": caller_id},
        )
        db.execute(
            text("UPDATE challenges SET participant_count = participant_count + 1 WHERE id = :cid"),
            {"cid": str(challenge_id)},
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Failed to join challenge_id=%s user_id=%s", challenge_id, caller_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Qo'shilishda xatolik yuz berdi")

    participant = db.execute(
        text("SELECT progress_value, completed_at, joined_at FROM challenge_participants WHERE challenge_id = :cid AND user_id = :uid"),
        {"cid": str(challenge_id), "uid": caller_id},
    ).fetchone()

    return {
        "ok": True,
        "challenge_id": str(challenge_id),
        "joined_at": participant.joined_at.isoformat(),
        "progress_value": participant.progress_value,
    }


@router.delete("/{challenge_id}/leave")
async def leave_challenge(
    challenge_id: uuid.UUID,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    participant = db.execute(
        text("SELECT id, completed_at FROM challenge_participants WHERE challenge_id = :cid AND user_id = :uid"),
        {"cid": str(challenge_id), "uid": caller_id},
    ).fetchone()
    if not participant:
        raise HTTPException(status_code=404, detail="Siz bu musobaqaga qo'shilmagansiz")
    if participant.completed_at is not None:
        raise HTTPException(status_code=400, detail="Yakunlangan musobaqadan chiqib bo'lmaydi")

    try:
        db.execute(text("DELETE FROM challenge_participants WHERE id = :pid"), {"pid": participant.id})
        db.execute(
            text("UPDATE challenges SET participant_count = GREATEST(0, participant_count - 1) WHERE id = :cid"),
            {"cid": str(challenge_id)},
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Failed to leave challenge_id=%s user_id=%s", challenge_id, caller_id, exc_info=True)
        raise HTTPException(status_code=500, detail="Chiqishda xatolik yuz berdi")

    return {"ok": True}


# ── Leaderboard ────────────────────────────────────────────────────────────────

@router.get("/{challenge_id}/leaderboard")
async def challenge_leaderboard(
    challenge_id: uuid.UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    challenge = db.execute(text("SELECT id FROM challenges WHERE id = :cid"), {"cid": str(challenge_id)}).fetchone()
    if not challenge:
        raise HTTPException(status_code=404, detail="Musobaqa topilmadi")

    rows = db.execute(
        text("""
            SELECT
                p.telegram_id, p.first_name, p.site_username AS username, p.photo_url,
                cp.progress_value, cp.completed_at,
                RANK() OVER (ORDER BY cp.progress_value DESC, cp.joined_at ASC) AS rank
            FROM challenge_participants cp
            JOIN profiles p ON p.telegram_id = cp.user_id
            WHERE cp.challenge_id = :cid
            ORDER BY rank ASC
            LIMIT :limit OFFSET :offset
        """),
        {"cid": str(challenge_id), "limit": limit, "offset": offset},
    ).fetchall()

    # ALWAYS also return the caller's own rank + progress, even if outside the
    # returned page — a user must always be able to see where they stand.
    caller_row = db.execute(
        text("""
            SELECT rank, progress_value, completed_at FROM (
                SELECT
                    user_id, progress_value, completed_at,
                    RANK() OVER (ORDER BY progress_value DESC, joined_at ASC) AS rank
                FROM challenge_participants
                WHERE challenge_id = :cid
            ) ranked
            WHERE user_id = :uid
        """),
        {"cid": str(challenge_id), "uid": caller_id},
    ).fetchone()

    return {
        "leaderboard": [
            {
                "rank": r.rank, "user_id": r.telegram_id, "first_name": r.first_name,
                "username": r.username, "photo_url": r.photo_url,
                "progress_value": r.progress_value,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in rows
        ],
        "caller": {
            "rank": caller_row.rank,
            "progress_value": caller_row.progress_value,
            "completed_at": caller_row.completed_at.isoformat() if caller_row.completed_at else None,
        } if caller_row else None,
    }
