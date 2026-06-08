"""
streaks.py — Streak detail, freeze purchase, and freeze use endpoints.

GET  /api/streaks/detail          — full streak info (streak_days, freeze_count,
                                    calendar, milestones, challenges)
POST /api/streaks/freeze/purchase — spend XP to purchase freeze charges
POST /api/streaks/freeze/use      — manually mark today as freeze-protected
"""

import math
from datetime import datetime, UTC, timedelta, date
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.services.xp_service import add_xp

router = APIRouter()


def _parse_local_date(local_date: Optional[str]) -> date:
    """Return the client's local calendar date, or UTC today as fallback."""
    if local_date:
        try:
            return date.fromisoformat(local_date)
        except ValueError:
            pass
    return datetime.now(UTC).date()


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


# ── Freeze purchase options ───────────────────────────────────────────────────
_FREEZE_PACKAGES = {
    1:  200,   # 1 freeze  = 200 XP
    3:  500,   # 3 freezes = 500 XP
    5:  750,   # 5 freezes = 750 XP
    10: 1200,  # 10 freezes = 1200 XP
}

# ── Milestone definitions ─────────────────────────────────────────────────────
_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365]


def _build_calendar(db: Session, user_id: int, today: date, days: int = 30, daily_goal: int = 20) -> list[dict]:
    """Return the last `days` dates with study status. A day is 'studied' only if its total minutes >= daily_goal."""
    start = today - timedelta(days=days - 1)

    rows = db.execute(
        text("""
            SELECT session_date
            FROM focus_sessions
            WHERE user_id = :uid AND session_date >= :start
            GROUP BY session_date
            HAVING SUM(minutes) >= :goal
        """),
        {"uid": user_id, "start": start, "goal": daily_goal},
    ).fetchall()
    study_dates = {r.session_date for r in rows}

    freeze_row = db.execute(
        text("SELECT freeze_used_dates FROM profiles WHERE telegram_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    freeze_dates: set[date] = set()
    if freeze_row and freeze_row.freeze_used_dates:
        freeze_dates = {d for d in freeze_row.freeze_used_dates if d >= start}

    result = []
    for i in range(days):
        d = start + timedelta(days=i)
        if d > today:
            status = "future"
        elif d in study_dates:
            status = "studied"
        elif d in freeze_dates:
            status = "frozen"
        else:
            status = "missed"
        result.append({"date": d.isoformat(), "status": status})
    return result


@router.get("/detail")
async def get_streak_detail(
    local_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    today = _parse_local_date(local_date)

    profile = db.execute(
        text("""
            SELECT streak_days, streak_last_date,
                   COALESCE(freeze_count, 0)      AS freeze_count,
                   COALESCE(freeze_used_dates, '{}') AS freeze_used_dates,
                   daily_goal_minutes, total_xp
            FROM profiles WHERE telegram_id = :uid
        """),
        {"uid": caller_id},
    ).fetchone()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    streak_days  = int(profile.streak_days or 0)
    freeze_count = int(profile.freeze_count or 0)
    last_date    = profile.streak_last_date
    daily_goal   = int(profile.daily_goal_minutes or 20)

    # Determine if streak is active (goal met today or yesterday)
    is_active = last_date is not None and last_date >= today - timedelta(days=1)

    # Study days this week (Mon–Sun) — only count days where goal was met
    week_start = today - timedelta(days=today.weekday())
    week_row = db.execute(
        text("""
            SELECT COUNT(*) AS cnt
            FROM (
                SELECT session_date
                FROM focus_sessions
                WHERE user_id = :uid AND session_date >= :ws
                GROUP BY session_date
                HAVING SUM(minutes) >= :goal
            ) sub
        """),
        {"uid": caller_id, "ws": week_start, "goal": daily_goal},
    ).fetchone()
    week_days = int(week_row.cnt or 0) if week_row else 0

    # Longest streak — based on goal-met days only
    longest_row = db.execute(
        text("""
            WITH daily AS (
                SELECT session_date
                FROM focus_sessions
                WHERE user_id = :uid
                GROUP BY session_date
                HAVING SUM(minutes) >= :goal
            ),
            gaps AS (
                SELECT session_date,
                       session_date - (ROW_NUMBER() OVER (ORDER BY session_date) * INTERVAL '1 day')::interval AS grp
                FROM daily
            ),
            streaks AS (
                SELECT COUNT(*) AS streak_len FROM gaps GROUP BY grp
            )
            SELECT COALESCE(MAX(streak_len), 0) AS longest FROM streaks
        """),
        {"uid": caller_id, "goal": daily_goal},
    ).fetchone()
    longest_streak = int(longest_row.longest or 0) if longest_row else 0

    # Completed milestone challenges
    done_rows = db.execute(
        text("SELECT challenge_key, completed_at FROM user_challenge_completions WHERE user_id = :uid"),
        {"uid": caller_id},
    ).fetchall()
    done_map = {r.challenge_key: r.completed_at.isoformat() for r in done_rows}

    milestones = []
    for m in _MILESTONES:
        key = f"streak_{m}"
        earned = key in done_map
        milestones.append({
            "days":         m,
            "earned":       earned,
            "completed_at": done_map.get(key),
            "current":      min(streak_days, m),
            "pct":          min(100, round(streak_days / m * 100)),
        })

    calendar = _build_calendar(db, caller_id, today, days=30, daily_goal=daily_goal)

    return {
        "streak_days":    streak_days,
        "is_active":      is_active,
        "longest_streak": longest_streak,
        "week_days":      week_days,
        "freeze_count":   freeze_count,
        "milestones":     milestones,
        "calendar":       calendar,
        "freeze_packages": [
            {"count": k, "xp_cost": v} for k, v in _FREEZE_PACKAGES.items()
        ],
    }


class PurchaseFreezeRequest(BaseModel):
    count: int = Field(..., ge=1)


@router.post("/freeze/purchase")
async def purchase_freeze(
    body: PurchaseFreezeRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    xp_cost = _FREEZE_PACKAGES.get(body.count)
    if xp_cost is None:
        raise HTTPException(status_code=400, detail=f"Invalid freeze count. Choose from: {list(_FREEZE_PACKAGES.keys())}")

    profile = db.execute(
        text("SELECT total_xp, COALESCE(freeze_count, 0) AS freeze_count FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    total_xp = int(profile.total_xp or 0)
    if total_xp < xp_cost:
        raise HTTPException(status_code=400, detail=f"Not enough XP. Need {xp_cost}, have {total_xp}")

    # Deduct XP directly (negative award)
    db.execute(
        text("""
            UPDATE profiles
            SET total_xp     = GREATEST(0, total_xp - :cost),
                freeze_count = COALESCE(freeze_count, 0) + :n
            WHERE telegram_id = :uid
        """),
        {"cost": xp_cost, "n": body.count, "uid": caller_id},
    )
    db.commit()

    new_row = db.execute(
        text("SELECT total_xp, COALESCE(freeze_count, 0) AS freeze_count FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()

    return {
        "ok":           True,
        "xp_spent":     xp_cost,
        "freezes_added": body.count,
        "total_xp":     int(new_row.total_xp or 0),
        "freeze_count": int(new_row.freeze_count or 0),
    }


@router.post("/freeze/use")
async def use_freeze(
    local_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Manually consume one freeze to protect today's streak."""
    today = _parse_local_date(local_date)

    profile = db.execute(
        text("""
            SELECT streak_days, streak_last_date,
                   COALESCE(freeze_count, 0) AS freeze_count,
                   COALESCE(freeze_used_dates, '{}') AS freeze_used_dates
            FROM profiles WHERE telegram_id = :uid
        """),
        {"uid": caller_id},
    ).fetchone()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    freeze_count = int(profile.freeze_count or 0)
    if freeze_count <= 0:
        raise HTTPException(status_code=400, detail="No freezes available")

    freeze_used = list(profile.freeze_used_dates or [])
    if today in freeze_used:
        raise HTTPException(status_code=400, detail="Freeze already used today")

    # Already studied today — no need to freeze
    if profile.streak_last_date == today:
        raise HTTPException(status_code=400, detail="Already studied today, no freeze needed")

    freeze_used.append(today)

    db.execute(
        text("""
            UPDATE profiles SET
                freeze_count      = freeze_count - 1,
                freeze_used_dates = array_append(COALESCE(freeze_used_dates, '{}'), :today),
                streak_last_date  = :today
            WHERE telegram_id = :uid
        """),
        {"today": today, "uid": caller_id},
    )
    db.commit()

    return {
        "ok":           True,
        "freeze_count": freeze_count - 1,
        "streak_days":  int(profile.streak_days or 0),
        "frozen_date":  today.isoformat(),
    }
