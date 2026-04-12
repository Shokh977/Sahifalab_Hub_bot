"""
profiles.py — proxy endpoints for gamification progress and cabinet data.

All queries use SQLAlchemy ORM (direct Postgres TCP), bypassing Supabase REST.
"""
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, UTC, timedelta
from pydantic import BaseModel
import time as _time

from app.db.session import get_db
from app.models.models import Profile, UserQuizCompletion, BookPurchase, BookRating
from app.services.auth_service import decode_token, decode_token_payload

router = APIRouter()

# ── Module-level motivation state (single Railway dyno, ephemeral) ────────────
# Resets on redeploy — motivation is intentionally ephemeral.
_last_motivation_ts: float = 0.0


# ── Auth helpers ───────────────────────────────────────────────────────────────

async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    """Extract telegram_id from Bearer JWT. Raises 401 on failure."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split(None, 1)  # split on first whitespace only
    if len(parts) != 2 or parts[0].lower() not in ("bearer",):
        scheme = repr(parts[0]) if parts else "none"
        raise HTTPException(
            status_code=401,
            detail=f"Invalid authorization header (scheme={scheme})"
        )
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return tid


async def _require_admin(authorization: Optional[str] = Header(None)) -> int:
    """Require JWT with role=admin or role=teacher. Returns telegram_id."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    payload = decode_token_payload(parts[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("role") not in ("admin", "teacher"):
        raise HTTPException(status_code=403, detail="Admin or teacher role required")
    return payload["telegram_id"]
_last_motivation_ts: float = 0.0


# ── Request models ─────────────────────────────────────────────────────────────

class ProfileUpsertRequest(BaseModel):
    telegram_id: int
    first_name:  str = "Foydalanuvchi"
    username:    Optional[str] = None


class ProgressSyncRequest(BaseModel):
    telegram_id:          int
    first_name:           Optional[str] = None
    username:             Optional[str] = None
    total_xp:             Optional[int] = None
    focus_seconds:        Optional[int] = None
    total_focus_minutes:  Optional[int] = None   # new: derived from focus_seconds
    level:                Optional[int] = None
    quizzes_completed:    Optional[int] = None
    app_online_at:        Optional[str] = None   # ISO-8601


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/leaderboard")
async def get_leaderboard(limit: int = 10, db: Session = Depends(get_db)):
    """Top-N users by XP."""
    profiles = (
        db.query(Profile)
        .order_by(Profile.total_xp.desc())
        .limit(min(limit, 100))
        .all()
    )
    return [
        {
            "telegram_id":        p.telegram_id,
            "first_name":         p.first_name,
            "username":           p.username,
            "photo_url":          p.photo_url,
            "total_xp":           p.total_xp          or 0,
            "level":              p.level              or 1,
            "quizzes_completed":  p.quizzes_completed  or 0,
            "app_online_at":      p.app_online_at.isoformat() if p.app_online_at else None,
        }
        for p in profiles
    ]


@router.get("/dashboard-stats")
async def get_dashboard_stats(db: Session = Depends(get_db)):
    """Summary stats for the teacher dashboard."""
    yesterday    = datetime.now(UTC) - timedelta(days=1)
    total        = db.query(Profile).count()
    active_today = db.query(Profile).filter(Profile.app_online_at >= yesterday).count()
    rows         = db.query(Profile.total_xp, Profile.quizzes_completed).all()
    avg_xp       = round(sum(r.total_xp or 0 for r in rows) / len(rows)) if rows else 0
    total_q      = sum(r.quizzes_completed or 0 for r in rows)
    return {
        "totalStudents": total,
        "activeToday":   active_today,
        "avgXP":         avg_xp,
        "totalQuizzes":  total_q,
    }


@router.get("/pulse")
async def get_pulse(db: Session = Depends(get_db)):
    """
    Live Pulse — returns:
      active_count      : number of users with app_online_at within the last 5 minutes
      last_motivation_ts: Unix timestamp of the last motivation broadcast (0 if none)
    Frontend polls this every 8 s to update the live counter and detect new motivation events.
    """
    cutoff = datetime.now(UTC) - timedelta(minutes=5)
    active_count = (
        db.query(Profile)
        .filter(Profile.app_online_at >= cutoff)
        .count()
    )
    return {
        "active_count":       active_count,
        "last_motivation_ts": _last_motivation_ts,
    }


@router.post("/motivation")
async def send_motivation(caller_id: int = Depends(_require_admin)):
    """
    Broadcast a motivation ping to all active study-page users.
    Requires admin or teacher JWT.
    Sets a module-level timestamp that /pulse returns on every poll.
    The ephemeral nature is intentional — motivation is a real-time signal.
    """
    global _last_motivation_ts
    _last_motivation_ts = _time.time()
    return {"ok": True, "ts": _last_motivation_ts}


@router.post("/upsert")
async def upsert_profile(
    body: ProfileUpsertRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Create a new profile row if it doesn't exist yet. Requires JWT auth.
    telegram_id is taken from JWT — body.telegram_id is ignored."""
    # Use JWT-derived identity
    telegram_id = caller_id
    profile = db.query(Profile).filter(Profile.telegram_id == telegram_id).first()
    if profile is None:
        profile = Profile(
            telegram_id=telegram_id,
            first_name=body.first_name,
            username=body.username,
            app_created_at=datetime.now(UTC),
        )
        db.add(profile)
    else:
        profile.first_name = body.first_name
        if body.username is not None:
            profile.username = body.username
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Profil saqlashda xatolik")
    return {"ok": True}


@router.post("/sync")
async def sync_progress(
    body: ProgressSyncRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """
    Upsert presence / cosmetic data from the frontend. Requires JWT auth.
    telegram_id is taken from JWT — body.telegram_id is ignored.

    SECURITY: XP, level, and quizzes_completed are SERVER-AUTHORITATIVE
    and can only be updated through the anti-cheat RPC in /api/xp/add.
    This endpoint only accepts presence fields (online status, focus time,
    first_name, username).
    """
    # Use JWT-derived identity
    telegram_id = caller_id

    profile = db.query(Profile).filter(Profile.telegram_id == telegram_id).first()
    if profile is None:
        profile = Profile(
            telegram_id=telegram_id,
            first_name=body.first_name or "Foydalanuvchi",
            username=body.username,
            app_created_at=datetime.now(UTC),
        )
        db.add(profile)

    # Only allow cosmetic/presence fields — XP, level, quizzes are server-authoritative
    if body.first_name           is not None: profile.first_name           = body.first_name
    if body.username             is not None: profile.username             = body.username
    if body.focus_seconds        is not None: profile.focus_seconds        = body.focus_seconds
    if body.total_focus_minutes  is not None: profile.total_focus_minutes  = body.total_focus_minutes
    if body.app_online_at        is not None:
        try:
            profile.app_online_at = datetime.fromisoformat(
                body.app_online_at.replace("Z", "+00:00")
            )
        except Exception:
            pass

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Progress saqlashda xatolik")
    return {"ok": True}


@router.get("/teachers")
async def get_teachers_gallery(db: Session = Depends(get_db)):
    """
    Public teachers gallery.
    Joins profiles + teacher_profiles + course aggregates in one raw SQL query.
    Returns every active teacher with their course count, total students, and avg rating.
    """
    from sqlalchemy import text
    rows = db.execute(text("""
        SELECT
            p.telegram_id,
            p.first_name,
            p.username,
            p.photo_url,
            COALESCE(tp.specialization, '')   AS specialization,
            tp.experience_years,
            COALESCE(tp.bio, '')              AS bio,
            COALESCE(cs.course_count, 0)      AS course_count,
            COALESCE(cs.total_students, 0)    AS total_students,
            COALESCE(cs.avg_rating, 0)        AS avg_rating
        FROM profiles p
        LEFT JOIN teacher_profiles tp
               ON tp.telegram_id = p.telegram_id
        LEFT JOIN (
            SELECT
                teacher_id,
                COUNT(*)                                             AS course_count,
                SUM(COALESCE(enrolled_count, 0))                    AS total_students,
                AVG(CASE WHEN rating > 0 THEN rating ELSE NULL END) AS avg_rating
            FROM courses
            WHERE is_published = true
            GROUP BY teacher_id
        ) cs ON cs.teacher_id = p.telegram_id
        WHERE p.role = 'teacher'
          AND p.status = 'active'
        ORDER BY COALESCE(cs.total_students, 0) DESC, p.first_name ASC
    """)).fetchall()

    return [
        {
            "telegram_id":      row.telegram_id,
            "first_name":       row.first_name or "O'qituvchi",
            "username":         row.username,
            "photo_url":        row.photo_url,
            "specialization":   row.specialization,
            "experience_years": row.experience_years,
            "bio":              row.bio,
            "course_count":     int(row.course_count),
            "total_students":   int(row.total_students),
            "avg_rating":       round(float(row.avg_rating), 1) if row.avg_rating else 0.0,
        }
        for row in rows
    ]


@router.get("/heatmap")
async def get_heatmap(
    telegram_id: int,
    days: int = 365,
    db: Session = Depends(get_db),
):
    """
    Per-day quiz-completion activity for the GitHub-style heatmap.
    Returns [{date: 'YYYY-MM-DD', count: int}] for the last `days` days.
    Uses user_quiz_completion.completed_at as the study-activity proxy.
    """
    from sqlalchemy import func, cast
    from sqlalchemy.types import Date as SQLDate

    cutoff = datetime.now(UTC) - timedelta(days=days)
    rows = (
        db.query(
            cast(UserQuizCompletion.completed_at, SQLDate).label("day"),
            func.count().label("count"),
        )
        .filter(
            UserQuizCompletion.telegram_id == telegram_id,
            UserQuizCompletion.completed_at >= cutoff,
        )
        .group_by(cast(UserQuizCompletion.completed_at, SQLDate))
        .order_by(cast(UserQuizCompletion.completed_at, SQLDate))
        .all()
    )
    return [{"date": str(r.day), "count": int(r.count)} for r in rows]


@router.get("/{telegram_id}")
async def get_profile(telegram_id: int, db: Session = Depends(get_db)):
    """Fetch a single user's gamification state."""
    profile = db.query(Profile).filter(Profile.telegram_id == telegram_id).first()
    if not profile:
        return None
    return {
        "telegram_id":          profile.telegram_id,
        "total_xp":             profile.total_xp          or 0,
        "focus_seconds":        profile.focus_seconds      or 0,
        "total_focus_minutes":  profile.total_focus_minutes or 0,
        "daily_quiz_xp":        profile.daily_quiz_xp      or 0,
        "level":                profile.level              or 1,
        "quizzes_completed":    profile.quizzes_completed  or 0,
        "first_name":           profile.first_name,
        "username":             profile.username,
        "photo_url":            profile.photo_url,
        "role":                 profile.role   or "student",
        "status":               profile.status or "active",
    }


@router.get("/{telegram_id}/completions")
async def get_completions(telegram_id: int, db: Session = Depends(get_db)):
    """Fetch all quiz completions for a user (cabinet page)."""
    rows = (
        db.query(UserQuizCompletion)
        .filter(UserQuizCompletion.telegram_id == telegram_id)
        .order_by(UserQuizCompletion.completed_at.desc())
        .all()
    )
    return [
        {
            "id":           r.id,
            "quiz_id":      r.quiz_id,
            "score":        r.score,
            "total":        r.total,
            "percentage":   r.percentage,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in rows
    ]


@router.get("/{telegram_id}/rating/{book_id}")
async def get_my_rating(telegram_id: int, book_id: int, db: Session = Depends(get_db)):
    """Fetch this user's rating for a specific book."""
    row = (
        db.query(BookRating)
        .filter(BookRating.telegram_id == telegram_id, BookRating.book_id == book_id)
        .first()
    )
    if not row:
        return None
    return {
        "id":          row.id,
        "book_id":     row.book_id,
        "telegram_id": row.telegram_id,
        "rating":      row.rating,
    }


@router.get("/{telegram_id}/purchases")
async def get_purchases(
    telegram_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Fetch completed book purchases for a user (cabinet page). Requires JWT auth.
    Users can only view their own purchases."""
    if caller_id != telegram_id:
        raise HTTPException(status_code=403, detail="Cannot view another user's purchases")
    rows = (
        db.query(BookPurchase)
        .filter(BookPurchase.telegram_id == telegram_id, BookPurchase.status == "completed")
        .order_by(BookPurchase.completed_at.desc())
        .all()
    )
    return [
        {
            "id":           r.id,
            "book_id":      r.book_id,
            "amount":       r.amount,
            "currency":     r.currency,
            "status":       r.status,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in rows
    ]
