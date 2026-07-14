"""
challenges.py — Musobaqalar: cohort challenges (step-21, extended step-25 —
metrics/types/team battles).

GET    /api/challenges                       — list (upcoming/active/ended/all)
GET    /api/challenges/{slug}                — detail + caller state + leaderboard slice
POST   /api/challenges/{id}/join             — join (FREE — no XP cost, ever)
DELETE /api/challenges/{id}/leave            — leave (blocked for active 'team' challenges)
GET    /api/challenges/{id}/leaderboard      — ranked participants + caller's own rank
GET    /api/challenges/{id}/team-leaderboard — top contributors per team ('team' type only)
GET    /api/challenges/me                    — caller's active + past challenges

Product rules enforced here (see step-21/step-25 specs — do not relax these):
  - Joining NEVER costs XP. There is no code path in this file that debits
    total_xp on join. If you're tempted to add one, stop and re-read the spec.
  - Progress and completion are written exclusively by
    app/services/challenge_service.py, inside the same transaction as the
    triggering activity. Nothing in this file ever writes
    challenge_participants.progress_value directly.
  - This file never touches profiles.streak_days, streak_stages, or
    user_stage_completions. Challenge completion is a separate economy from
    the tree/streak by design.
  - A user may be in at most 3 active/upcoming challenges at once (step-25
    Part 3) — scarcity makes each one matter.
  - 'team' challenges auto-balance assignment to the smaller team on join,
    and block leaving once the challenge is active (step-25 Part 4).
"""
import logging
import uuid
from datetime import datetime, UTC, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)
router = APIRouter()

MAX_ACTIVE_CHALLENGES = 3


def _date_range(start, end):
    """Inclusive list of dates from start to end (both date objects)."""
    days = (end - start).days
    if days < 0:
        return []
    return [start + timedelta(days=i) for i in range(days + 1)]


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


def _challenge_dict(
    row, caller_participation: Optional[dict] = None,
    avatars: Optional[list] = None, team_totals: Optional[dict] = None,
) -> dict:
    d = {
        "id":                str(row.id),
        "slug":               row.slug,
        "title":              row.title,
        "description":        row.description,
        "metric":             row.metric,
        "challenge_type":     row.challenge_type,
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
        # consistency
        "daily_minimum":      row.daily_minimum,
        "required_days":      row.required_days,
        "allowed_misses":     row.allowed_misses,
        # sprint
        "winner_count":       row.winner_count,
        # team
        "team_a_name":        row.team_a_name,
        "team_a_color":       row.team_a_color,
        "team_a_icon":        row.team_a_icon,
        "team_b_name":        row.team_b_name,
        "team_b_color":       row.team_b_color,
        "team_b_icon":        row.team_b_icon,
        "team_a_total":       (team_totals or {}).get("A", 0),
        "team_b_total":       (team_totals or {}).get("B", 0),
    }
    if caller_participation is not None:
        d["joined"] = True
        d["progress_value"] = caller_participation["progress_value"]
        d["completed_at"] = caller_participation["completed_at"].isoformat() if caller_participation["completed_at"] else None
        d["rank"] = caller_participation.get("rank")
        d["team"] = caller_participation.get("team")
        d["qualifying_days"] = caller_participation.get("qualifying_days", 0)
        d["current_run"] = caller_participation.get("current_run", 0)
        d["misses_used"] = caller_participation.get("misses_used", 0)
        d["failed_at"] = caller_participation["failed_at"].isoformat() if caller_participation.get("failed_at") else None
        d["final_rank"] = caller_participation.get("final_rank")
        d["is_winner"] = caller_participation.get("is_winner", False)
    else:
        d["joined"] = False
        d["progress_value"] = 0
        d["completed_at"] = None
        d["rank"] = None
        d["team"] = None
        d["qualifying_days"] = 0
        d["current_run"] = 0
        d["misses_used"] = 0
        d["failed_at"] = None
        d["final_rank"] = None
        d["is_winner"] = False
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


def _fetch_team_totals_map(db: Session, challenge_ids: list) -> dict:
    """{challenge_id: {"A": total, "B": total}} — for the team head-to-head bar."""
    if not challenge_ids:
        return {}
    rows = db.execute(
        text("""
            SELECT challenge_id, team, COALESCE(SUM(progress_value), 0) AS total
            FROM challenge_participants
            WHERE challenge_id = ANY(:ids) AND team IS NOT NULL
            GROUP BY challenge_id, team
        """),
        {"ids": challenge_ids},
    ).fetchall()
    totals_map: dict = {}
    for r in rows:
        totals_map.setdefault(r.challenge_id, {})[r.team] = r.total
    return totals_map


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
                SELECT challenge_id, progress_value, completed_at, team,
                       qualifying_days, current_run, misses_used, failed_at, final_rank, is_winner
                FROM challenge_participants
                WHERE user_id = :uid AND challenge_id = ANY(:ids)
            """),
            {"uid": caller_id, "ids": challenge_ids},
        ).fetchall()
        participation_map = {p.challenge_id: dict(p._mapping) for p in p_rows}

    avatar_map = _fetch_avatar_map(db, challenge_ids)
    team_totals_map = _fetch_team_totals_map(db, [r.id for r in rows if r.challenge_type == "team"])
    return [
        _challenge_dict(r, participation_map.get(r.id), avatar_map.get(r.id), team_totals_map.get(r.id))
        for r in rows
    ]


# ── Detail ───────────────────────────────────────────────────────────────────

@router.get("/me")
async def my_challenges(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Caller's active + past challenges with progress (Musobaqalar tab, Taymer chip)."""
    rows = db.execute(
        text("""
            SELECT c.*, cp.progress_value, cp.completed_at, cp.joined_at, cp.team,
                   cp.qualifying_days, cp.current_run, cp.misses_used, cp.failed_at,
                   cp.final_rank, cp.is_winner
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
    team_totals_map = _fetch_team_totals_map(db, [r.id for r in rows if r.challenge_type == "team"])
    result = []
    for r in rows:
        rank = None
        if r.status == "active" and r.challenge_type in ("cumulative", "sprint"):
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
        participation = {
            "progress_value": r.progress_value, "completed_at": r.completed_at, "rank": rank,
            "team": r.team, "qualifying_days": r.qualifying_days, "current_run": r.current_run,
            "misses_used": r.misses_used, "failed_at": r.failed_at,
            "final_rank": r.final_rank, "is_winner": r.is_winner,
        }
        result.append(_challenge_dict(r, participation, avatar_map.get(r.id), team_totals_map.get(r.id)))
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
        text("""
            SELECT progress_value, completed_at, team, qualifying_days, current_run,
                   misses_used, failed_at, final_rank, is_winner
            FROM challenge_participants WHERE challenge_id = :cid AND user_id = :uid
        """),
        {"cid": row.id, "uid": caller_id},
    ).fetchone()
    caller_participation = dict(participation._mapping) if participation else None

    leaderboard_rows = db.execute(
        text("""
            SELECT
                p.telegram_id, p.first_name, p.site_username AS username, p.photo_url,
                cp.progress_value, cp.completed_at, cp.team,
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
    team_totals = _fetch_team_totals_map(db, [row.id]).get(row.id) if row.challenge_type == "team" else None
    result = _challenge_dict(row, caller_participation, avatar_map.get(row.id), team_totals)

    # Day-by-day breakdown for the consistency card's day-dots row — only
    # meaningful (and only fetched) for a joined 'consistency' challenge.
    if row.challenge_type == "consistency" and caller_participation is not None:
        daily_rows = db.execute(
            text("""
                SELECT day, value FROM challenge_daily_progress
                WHERE challenge_id = :cid AND user_id = :uid
                ORDER BY day ASC
            """),
            {"cid": row.id, "uid": caller_id},
        ).fetchall()
        daily_map = {d.day.isoformat(): d.value for d in daily_rows}
        result["daily_progress"] = [
            {
                "day": day.isoformat(),
                "value": daily_map.get(day.isoformat(), 0),
                "qualified": daily_map.get(day.isoformat(), 0) >= (row.daily_minimum or 0),
            }
            for day in _date_range(row.starts_at.date(), min(row.ends_at.date(), datetime.now(UTC).date()))
        ]
    else:
        result["daily_progress"] = []

    result["leaderboard"] = [
        {
            "rank": r.rank, "user_id": r.telegram_id, "first_name": r.first_name,
            "username": r.username, "photo_url": r.photo_url,
            "progress_value": r.progress_value, "team": r.team,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in leaderboard_rows
    ]
    return result


# ── Join / Leave ───────────────────────────────────────────────────────────────

def _assign_team(db: Session, challenge_id) -> str:
    """
    Auto-balance: join the team with fewer members. If equal, alternate by
    total participant-count parity (so consecutive equal-count joins
    naturally alternate A/B/A/B...). Keeps team sizes within 1 of each other
    at all times, which is what makes scoring by TOTAL fair (step-25 Part 4).
    """
    counts = db.execute(
        text("""
            SELECT team, COUNT(*) AS n FROM challenge_participants
            WHERE challenge_id = :cid AND team IS NOT NULL
            GROUP BY team
        """),
        {"cid": challenge_id},
    ).fetchall()
    count_map = {r.team: r.n for r in counts}
    a, b = count_map.get("A", 0), count_map.get("B", 0)
    if a < b:
        return "A"
    if b < a:
        return "B"
    return "A" if (a + b) % 2 == 0 else "B"


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

    # Join cap (step-25 Part 3) — scarcity makes each challenge matter.
    active_joined = db.execute(
        text("""
            SELECT c.title FROM challenge_participants cp
            JOIN challenges c ON c.id = cp.challenge_id
            WHERE cp.user_id = :uid AND c.status IN ('upcoming', 'active')
        """),
        {"uid": caller_id},
    ).fetchall()
    if len(active_joined) >= MAX_ACTIVE_CHALLENGES:
        names = ", ".join(f"«{r.title}»" for r in active_joined)
        raise HTTPException(
            status_code=400,
            detail=f"Siz bir vaqtda eng ko'pi {MAX_ACTIVE_CHALLENGES} ta musobaqada qatnasha olasiz. "
                   f"Avval birortasini yakunlang: {names}.",
        )

    team = _assign_team(db, str(challenge_id)) if row.challenge_type == "team" else None

    try:
        db.execute(
            text("""
                INSERT INTO challenge_participants (challenge_id, user_id, team)
                VALUES (:cid, :uid, :team)
            """),
            {"cid": str(challenge_id), "uid": caller_id, "team": team},
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
        text("SELECT progress_value, completed_at, joined_at, team FROM challenge_participants WHERE challenge_id = :cid AND user_id = :uid"),
        {"cid": str(challenge_id), "uid": caller_id},
    ).fetchone()

    return {
        "ok": True,
        "challenge_id": str(challenge_id),
        "joined_at": participant.joined_at.isoformat(),
        "progress_value": participant.progress_value,
        "team": participant.team,
    }


@router.delete("/{challenge_id}/leave")
async def leave_challenge(
    challenge_id: uuid.UUID,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    challenge = db.execute(text("SELECT status, challenge_type FROM challenges WHERE id = :cid"), {"cid": str(challenge_id)}).fetchone()
    if not challenge:
        raise HTTPException(status_code=404, detail="Musobaqa topilmadi")

    participant = db.execute(
        text("SELECT id, completed_at FROM challenge_participants WHERE challenge_id = :cid AND user_id = :uid"),
        {"cid": str(challenge_id), "uid": caller_id},
    ).fetchone()
    if not participant:
        raise HTTPException(status_code=404, detail="Siz bu musobaqaga qo'shilmagansiz")
    if participant.completed_at is not None:
        raise HTTPException(status_code=400, detail="Yakunlangan musobaqadan chiqib bo'lmaydi")

    # step-25 Part 4: once a team challenge is active, leaving is blocked —
    # a departure would unbalance the teams and the leaver's contribution is
    # already baked into their team's total.
    if challenge.challenge_type == "team" and challenge.status == "active":
        raise HTTPException(status_code=400, detail="Faol guruh jangidan chiqib bo'lmaydi")

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

    total_participants = db.execute(
        text("SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = :cid"),
        {"cid": str(challenge_id)},
    ).scalar() or 0

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

    caller_percentile = None
    if caller_row and total_participants > 0:
        # "Top X%" — never expose raw "you're in the bottom half" framing here;
        # the mobile client decides how to word it (step-25: never "you're losing").
        caller_percentile = round((1 - (caller_row.rank - 1) / total_participants) * 100)

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
        "total_participants": total_participants,
        "caller": {
            "rank": caller_row.rank,
            "progress_value": caller_row.progress_value,
            "completed_at": caller_row.completed_at.isoformat() if caller_row.completed_at else None,
            "percentile": caller_percentile,
        } if caller_row else None,
    }


@router.get("/{challenge_id}/team-leaderboard")
async def team_leaderboard(
    challenge_id: uuid.UUID,
    top_n: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """
    Within-team top contributors for a 'team' challenge — top N per team
    only. Nobody is publicly ranked at the bottom (step-25 Part 5): this is
    recognition, not a full leaderboard.
    """
    row = db.execute(text("SELECT * FROM challenges WHERE id = :cid"), {"cid": str(challenge_id)}).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Musobaqa topilmadi")
    if row.challenge_type != "team":
        raise HTTPException(status_code=400, detail="Bu musobaqa guruh jangi emas")

    def _top_contributors(team: str) -> list[dict]:
        rows = db.execute(
            text("""
                SELECT p.telegram_id, p.first_name, p.photo_url, cp.progress_value
                FROM challenge_participants cp
                JOIN profiles p ON p.telegram_id = cp.user_id
                WHERE cp.challenge_id = :cid AND cp.team = :team
                ORDER BY cp.progress_value DESC, cp.joined_at ASC
                LIMIT :n
            """),
            {"cid": str(challenge_id), "team": team, "n": top_n},
        ).fetchall()
        return [
            {"user_id": r.telegram_id, "first_name": r.first_name, "photo_url": r.photo_url, "progress_value": r.progress_value}
            for r in rows
        ]

    totals = _fetch_team_totals_map(db, [row.id]).get(row.id, {})
    caller_row = db.execute(
        text("SELECT team, progress_value FROM challenge_participants WHERE challenge_id = :cid AND user_id = :uid"),
        {"cid": str(challenge_id), "uid": caller_id},
    ).fetchone()

    return {
        "team_a": {
            "name": row.team_a_name, "color": row.team_a_color, "icon": row.team_a_icon,
            "total": totals.get("A", 0), "top": _top_contributors("A"),
        },
        "team_b": {
            "name": row.team_b_name, "color": row.team_b_color, "icon": row.team_b_icon,
            "total": totals.get("B", 0), "top": _top_contributors("B"),
        },
        "caller_team": caller_row.team if caller_row else None,
        "caller_contribution": caller_row.progress_value if caller_row else 0,
    }
