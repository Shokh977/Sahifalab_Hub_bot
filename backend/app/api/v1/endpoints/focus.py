"""
focus.py — Study session completion and stats endpoints.

POST /api/focus/complete   — mark a focus session complete, award XP
GET  /api/focus/stats      — today/week/streak stats for the caller
GET  /api/focus/weekly     — 7-day breakdown [{ date, minutes, goal_met }]
"""

from datetime import datetime, UTC, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.services.xp_service import add_xp, focus_minutes_to_xp

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


class CompleteSessionRequest(BaseModel):
    minutes: int = Field(..., ge=1, le=480)


@router.post("/complete")
async def complete_focus_session(
    body: CompleteSessionRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    xp_amount = focus_minutes_to_xp(body.minutes)
    try:
        result = add_xp(db, user_id=caller_id, source="DEEP_WORK", amount=xp_amount)
    except Exception:
        raise HTTPException(status_code=500, detail="XP award failed")

    today = datetime.now(UTC).date()

    db.execute(
        text("""
            INSERT INTO focus_sessions (user_id, minutes, xp_awarded, session_date)
            VALUES (:uid, :min, :xp, :dt)
        """),
        {"uid": caller_id, "min": body.minutes, "xp": result["xp_added"], "dt": today},
    )

    # Streak logic: same day → no change; yesterday → +1; else → reset to 1
    db.execute(
        text("""
            UPDATE profiles SET
                total_focus_minutes = COALESCE(total_focus_minutes, 0) + :min,
                streak_days = CASE
                    WHEN streak_last_date = CURRENT_DATE     THEN COALESCE(streak_days, 0)
                    WHEN streak_last_date = CURRENT_DATE - 1 THEN COALESCE(streak_days, 0) + 1
                    ELSE 1
                END,
                streak_last_date = CURRENT_DATE
            WHERE telegram_id = :uid
        """),
        {"min": body.minutes, "uid": caller_id},
    )
    db.commit()

    row = db.execute(
        text("SELECT total_xp, level, streak_days FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()

    old_level = result["new_level"]  # level before this XP award (already updated by add_xp)
    new_level  = int(row.level or 1) if row else result["new_level"]

    return {
        "xp_awarded":         result["xp_added"],
        "total_xp":           int(row.total_xp or 0) if row else result["new_xp"],
        "level":              new_level,
        "level_up":           result["new_level"] > old_level,
        "achievements_earned": [],
    }


@router.get("/stats")
async def get_focus_stats(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    week_ago = datetime.now(UTC).date() - timedelta(days=6)

    agg = db.execute(
        text("""
            SELECT
                COALESCE(SUM(minutes) FILTER (WHERE session_date = CURRENT_DATE), 0) AS today_minutes,
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :week_ago), 0)    AS week_minutes
            FROM focus_sessions
            WHERE user_id = :uid
        """),
        {"uid": caller_id, "week_ago": week_ago},
    ).fetchone()

    profile = db.execute(
        text("""
            SELECT streak_days, streak_last_date, daily_goal_minutes, total_focus_minutes
            FROM profiles WHERE telegram_id = :uid
        """),
        {"uid": caller_id},
    ).fetchone()

    last_row = db.execute(
        text("SELECT MAX(created_at) AS last_at FROM focus_sessions WHERE user_id = :uid"),
        {"uid": caller_id},
    ).fetchone()

    return {
        "today_minutes": int(agg.today_minutes)                      if agg     else 0,
        "week_minutes":  int(agg.week_minutes)                       if agg     else 0,
        "streak_days":   int(profile.streak_days         or 0)       if profile else 0,
        "daily_goal":    int(profile.daily_goal_minutes  or 20)      if profile else 20,
        "last_study_at": last_row.last_at.isoformat() if last_row and last_row.last_at else None,
    }


@router.get("/weekly")
async def get_weekly_focus(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    week_ago = datetime.now(UTC).date() - timedelta(days=6)

    rows = db.execute(
        text("""
            SELECT session_date, SUM(minutes) AS minutes
            FROM focus_sessions
            WHERE user_id = :uid AND session_date >= :week_ago
            GROUP BY session_date
        """),
        {"uid": caller_id, "week_ago": week_ago},
    ).fetchall()

    profile = db.execute(
        text("SELECT daily_goal_minutes FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()
    daily_goal = int(profile.daily_goal_minutes or 20) if profile else 20

    by_date = {r.session_date: int(r.minutes) for r in rows}

    return [
        {
            "date":     (week_ago + timedelta(days=i)).isoformat(),
            "minutes":  by_date.get(week_ago + timedelta(days=i), 0),
            "goal_met": by_date.get(week_ago + timedelta(days=i), 0) >= daily_goal,
        }
        for i in range(7)
    ]
