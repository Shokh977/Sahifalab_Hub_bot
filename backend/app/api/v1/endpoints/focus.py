"""
focus.py — Study session completion and stats endpoints.

POST /api/focus/complete       — mark a focus session complete, award XP, check streak challenges
POST /api/focus/heartbeat      — called every 30s while timer is active (updates study_pulse_at)
GET  /api/focus/active-count   — number of users with study_pulse_at within last 2 minutes
GET  /api/focus/stats          — today/week/streak/challenge stats for the caller
GET  /api/focus/challenges     — all streak challenges with per-user progress
GET  /api/focus/weekly         — 7-day breakdown [{ date, minutes, goal_met }]
"""

import json
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


# ── Streak challenge definitions (mirrors DB seed) ────────────────────────────
_CHALLENGE_MILESTONES = [7, 14, 30, 100]


def _check_and_award_challenges(db: Session, caller_id: int, streak_days: int) -> list[dict]:
    """
    Check whether any streak challenge has been newly earned.
    Awards bonus XP once per challenge per user.
    Returns list of newly-completed challenges.
    """
    newly_done: list[dict] = []
    for milestone in _CHALLENGE_MILESTONES:
        if streak_days < milestone:
            continue
        key = f"streak_{milestone}"
        # Check if already awarded
        existing = db.execute(
            text("SELECT id FROM user_challenge_completions WHERE user_id = :uid AND challenge_key = :key"),
            {"uid": caller_id, "key": key},
        ).fetchone()
        if existing:
            continue
        # Fetch challenge definition for bonus XP
        ch = db.execute(
            text("SELECT bonus_xp, title FROM streak_challenges WHERE key = :key AND is_active = TRUE"),
            {"key": key},
        ).fetchone()
        if not ch:
            continue
        # Award bonus XP
        bonus = int(ch.bonus_xp or 0)
        try:
            xp_result = add_xp(db, user_id=caller_id, source="DEEP_WORK", amount=bonus)
        except Exception:
            xp_result = {"xp_added": 0}
        # Record completion
        try:
            db.execute(
                text("""
                    INSERT INTO user_challenge_completions (user_id, challenge_key, xp_awarded)
                    VALUES (:uid, :key, :xp)
                    ON CONFLICT DO NOTHING
                """),
                {"uid": caller_id, "key": key, "xp": xp_result.get("xp_added", 0)},
            )
        except Exception:
            pass
        newly_done.append({"key": key, "title": ch.title, "bonus_xp": bonus})
    return newly_done


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
                streak_last_date = CURRENT_DATE,
                study_pulse_at   = NULL
            WHERE telegram_id = :uid
        """),
        {"min": body.minutes, "uid": caller_id},
    )
    db.commit()

    # Read back current streak for challenge checking
    streak_row = db.execute(
        text("SELECT streak_days FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()
    current_streak = int(streak_row.streak_days or 0) if streak_row else 0

    # Check and award streak challenges
    newly_completed = _check_and_award_challenges(db, caller_id, current_streak)
    try:
        db.commit()
    except Exception:
        db.rollback()

    # Append focus session to activity_log (best-effort)
    try:
        db.execute(
            text("""
                INSERT INTO activity_log (user_id, activity_type, metadata)
                VALUES (:uid, 'focus_session', :meta::jsonb)
            """),
            {
                "uid":  caller_id,
                "meta": json.dumps({"minutes": body.minutes, "xp": result["xp_added"]}),
            },
        )
        db.commit()
    except Exception:
        db.rollback()

    row = db.execute(
        text("SELECT total_xp, level, streak_days FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()

    old_level = result["new_level"]
    new_level  = int(row.level or 1) if row else result["new_level"]

    return {
        "xp_awarded":          result["xp_added"],
        "total_xp":            int(row.total_xp or 0) if row else result["new_xp"],
        "level":               new_level,
        "level_up":            result["new_level"] > old_level,
        "achievements_earned": [],
        "challenges_completed": newly_completed,
    }


@router.post("/heartbeat")
async def study_heartbeat(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Called every 30s while the timer is running. Updates study_pulse_at."""
    try:
        db.execute(
            text("UPDATE profiles SET study_pulse_at = NOW() WHERE telegram_id = :uid"),
            {"uid": caller_id},
        )
        db.commit()
    except Exception:
        db.rollback()
    return {"ok": True}


@router.get("/active-count")
async def get_active_study_count(db: Session = Depends(get_db)):
    """Count of users whose study_pulse_at is within the last 2 minutes."""
    try:
        row = db.execute(
            text("""
                SELECT COUNT(*) AS cnt FROM profiles
                WHERE study_pulse_at >= NOW() - INTERVAL '2 minutes'
            """),
        ).fetchone()
        return {"count": int(row.cnt or 0) if row else 0}
    except Exception:
        return {"count": 0}


@router.get("/challenges")
async def get_challenges(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """All streak challenges with per-user earned status and current streak progress."""
    profile = db.execute(
        text("SELECT streak_days FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()
    current_streak = int(profile.streak_days or 0) if profile else 0

    # Load completed challenges for this user
    done_rows = db.execute(
        text("SELECT challenge_key, completed_at, xp_awarded FROM user_challenge_completions WHERE user_id = :uid"),
        {"uid": caller_id},
    ).fetchall()
    done_map = {r.challenge_key: {"completed_at": r.completed_at.isoformat(), "xp_awarded": r.xp_awarded} for r in done_rows}

    # Load definitions
    ch_rows = db.execute(
        text("SELECT key, title, description, required_days, bonus_xp, icon FROM streak_challenges WHERE is_active = TRUE ORDER BY sort_order"),
    ).fetchall()

    result = []
    for ch in ch_rows:
        earned = ch.key in done_map
        result.append({
            "key":           ch.key,
            "title":         ch.title,
            "description":   ch.description,
            "required_days": ch.required_days,
            "bonus_xp":      ch.bonus_xp,
            "icon":          ch.icon,
            "earned":        earned,
            "completed_at":  done_map[ch.key]["completed_at"] if earned else None,
            "current_days":  min(current_streak, ch.required_days),
            "progress_pct":  min(100, round(current_streak / ch.required_days * 100)),
        })
    return result


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
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :week_ago), 0)    AS week_minutes,
                COALESCE(COUNT(*)     FILTER (WHERE session_date = CURRENT_DATE), 0) AS today_sessions
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

    sessions_row = db.execute(
        text("SELECT COUNT(*) AS cnt FROM focus_sessions WHERE user_id = :uid"),
        {"uid": caller_id},
    ).fetchone()

    longest_row = db.execute(
        text("""
            WITH daily AS (
                SELECT DISTINCT session_date FROM focus_sessions WHERE user_id = :uid
            ),
            gaps AS (
                SELECT session_date,
                       session_date - (ROW_NUMBER() OVER (ORDER BY session_date) * INTERVAL '1 day') AS grp
                FROM daily
            ),
            streaks AS (
                SELECT COUNT(*) AS streak_len FROM gaps GROUP BY grp
            )
            SELECT COALESCE(MAX(streak_len), 0) AS longest FROM streaks
        """),
        {"uid": caller_id},
    ).fetchone()

    return {
        "today_minutes":       int(agg.today_minutes)                     if agg     else 0,
        "today_sessions":      int(agg.today_sessions)                    if agg     else 0,
        "week_minutes":        int(agg.week_minutes)                      if agg     else 0,
        "streak_days":         int(profile.streak_days        or 0)       if profile else 0,
        "daily_goal":          int(profile.daily_goal_minutes or 20)      if profile else 20,
        "last_study_at":       last_row.last_at.isoformat() if last_row and last_row.last_at else None,
        "total_focus_minutes": int(profile.total_focus_minutes or 0)      if profile else 0,
        "sessions_count":      int(sessions_row.cnt or 0)                 if sessions_row else 0,
        "longest_streak":      int(longest_row.longest or 0)              if longest_row else 0,
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
