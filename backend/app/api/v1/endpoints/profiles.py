"""
profiles.py — proxy endpoints for gamification progress and cabinet data.

All queries use SQLAlchemy ORM (direct Postgres TCP), bypassing Supabase REST.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, UTC, timedelta
from pydantic import BaseModel

from app.db.session import get_db
from app.models.models import Profile, UserQuizCompletion, BookPurchase, BookRating

router = APIRouter()


# ── Request models ─────────────────────────────────────────────────────────────

class ProfileUpsertRequest(BaseModel):
    telegram_id: int
    first_name:  str = "Foydalanuvchi"
    username:    Optional[str] = None


class ProgressSyncRequest(BaseModel):
    telegram_id:       int
    first_name:        Optional[str] = None
    username:          Optional[str] = None
    total_xp:          Optional[int] = None
    focus_seconds:     Optional[int] = None
    level:             Optional[int] = None
    quizzes_completed: Optional[int] = None
    app_online_at:     Optional[str] = None   # ISO-8601


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


@router.post("/upsert")
async def upsert_profile(body: ProfileUpsertRequest, db: Session = Depends(get_db)):
    """Create a new profile row if it doesn't exist yet."""
    profile = db.query(Profile).filter(Profile.telegram_id == body.telegram_id).first()
    if profile is None:
        profile = Profile(
            telegram_id=body.telegram_id,
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
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}


@router.post("/sync")
async def sync_progress(body: ProgressSyncRequest, db: Session = Depends(get_db)):
    """
    Upsert XP / focus / level / presence data from the frontend.
    Called by progressStore.syncToSupabase() and pingPresence().
    """
    profile = db.query(Profile).filter(Profile.telegram_id == body.telegram_id).first()
    if profile is None:
        profile = Profile(
            telegram_id=body.telegram_id,
            first_name=body.first_name or "Foydalanuvchi",
            username=body.username,
            app_created_at=datetime.now(UTC),
        )
        db.add(profile)

    if body.first_name        is not None: profile.first_name        = body.first_name
    if body.username          is not None: profile.username          = body.username
    if body.total_xp          is not None: profile.total_xp          = body.total_xp
    if body.focus_seconds     is not None: profile.focus_seconds     = body.focus_seconds
    if body.level             is not None: profile.level             = body.level
    if body.quizzes_completed is not None: profile.quizzes_completed = body.quizzes_completed
    if body.app_online_at     is not None:
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
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}


@router.get("/{telegram_id}")
async def get_profile(telegram_id: int, db: Session = Depends(get_db)):
    """Fetch a single user's gamification state."""
    profile = db.query(Profile).filter(Profile.telegram_id == telegram_id).first()
    if not profile:
        return None
    return {
        "telegram_id":       profile.telegram_id,
        "total_xp":          profile.total_xp          or 0,
        "focus_seconds":     profile.focus_seconds      or 0,
        "level":             profile.level              or 1,
        "quizzes_completed": profile.quizzes_completed  or 0,
        "first_name":        profile.first_name,
        "username":          profile.username,
        "photo_url":         profile.photo_url,
        "role":              profile.role   or "student",
        "status":            profile.status or "active",
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
async def get_purchases(telegram_id: int, db: Session = Depends(get_db)):
    """Fetch completed book purchases for a user (cabinet page)."""
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
