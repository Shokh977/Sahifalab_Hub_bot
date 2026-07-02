"""
focus.py — Study session completion and stats endpoints.

POST /api/focus/complete       — mark a focus session complete, award XP, check streak challenges
POST /api/focus/heartbeat      — called every 30s while timer is active (updates study_pulse_at)
GET  /api/focus/active-count   — number of users with study_pulse_at within last 2 minutes
GET  /api/focus/stats          — today/week/streak/challenge stats for the caller
GET  /api/focus/challenges     — all streak challenges with per-user progress
GET  /api/focus/weekly         — 7-day breakdown [{ date, minutes, goal_met }]
"""

import asyncio
import json
from datetime import datetime, UTC, timedelta, date as Date
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.services.xp_service import add_xp, focus_minutes_to_xp
from app.api.v1.endpoints.notifications import send_notification

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


def _parse_local_date(local_date: Optional[str]) -> Date:
    """Return the client's local calendar date, or UTC today as fallback."""
    if local_date:
        try:
            return Date.fromisoformat(local_date)
        except ValueError:
            pass
    return datetime.now(UTC).date()


class CompleteSessionRequest(BaseModel):
    minutes: int = Field(..., ge=1, le=1440)  # 24 h max per submit
    local_date: Optional[str] = None   # YYYY-MM-DD from device calendar


@router.post("/complete")
async def complete_focus_session(
    body: CompleteSessionRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    pre = db.execute(
        text("SELECT level FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()
    old_level = int(pre.level or 1) if pre else 1

    xp_amount = focus_minutes_to_xp(body.minutes)
    try:
        result = add_xp(db, user_id=caller_id, source="DEEP_WORK", amount=xp_amount)
    except Exception:
        raise HTTPException(status_code=500, detail="XP award failed")

    today = _parse_local_date(body.local_date)
    yesterday = today - timedelta(days=1)

    db.execute(
        text("""
            INSERT INTO focus_sessions (user_id, minutes, xp_awarded, session_date)
            VALUES (:uid, :min, :xp, :dt)
        """),
        {"uid": caller_id, "min": body.minutes, "xp": result["xp_added"], "dt": today},
    )

    # Streak logic: only advance streak when today's total minutes meets the daily goal.
    # The subquery runs after the INSERT above so it includes the just-added session.
    db.execute(
        text("""
            UPDATE profiles SET
                total_focus_minutes = COALESCE(total_focus_minutes, 0) + :min,
                streak_days = CASE
                    WHEN (
                        SELECT COALESCE(SUM(minutes), 0)
                        FROM focus_sessions
                        WHERE user_id = :uid AND session_date = :today
                    ) >= COALESCE(daily_goal_minutes, 20)
                    THEN
                        CASE
                            WHEN streak_last_date = :today     THEN COALESCE(streak_days, 0)
                            WHEN streak_last_date = :yesterday THEN COALESCE(streak_days, 0) + 1
                            ELSE 1
                        END
                    ELSE COALESCE(streak_days, 0)
                END,
                streak_last_date = CASE
                    WHEN (
                        SELECT COALESCE(SUM(minutes), 0)
                        FROM focus_sessions
                        WHERE user_id = :uid AND session_date = :today
                    ) >= COALESCE(daily_goal_minutes, 20)
                    THEN :today
                    ELSE streak_last_date
                END,
                study_pulse_at = NULL
            WHERE telegram_id = :uid
        """),
        {"min": body.minutes, "uid": caller_id, "today": today, "yesterday": yesterday},
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

    new_level = int(row.level or 1) if row else result["new_level"]

    # Fire push notifications (non-blocking, best-effort)
    if new_level > old_level:
        asyncio.create_task(send_notification(
            caller_id, "level_up", category="SYSTEM",
            meta={"level": new_level},
        ))
    for ch in newly_completed:
        asyncio.create_task(send_notification(
            caller_id, "achievement", category="SYSTEM",
            meta={"challenge_key": ch.get("key", ""), "bonus_xp": ch.get("bonus_xp", 0)},
        ))

    return {
        "xp_awarded":          result["xp_added"],
        "total_xp":            int(row.total_xp or 0) if row else result["new_xp"],
        "level":               new_level,
        "level_up":            new_level > old_level,
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
    local_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    today    = _parse_local_date(local_date)
    week_ago = today - timedelta(days=6)

    agg = db.execute(
        text("""
            SELECT
                COALESCE(SUM(minutes) FILTER (WHERE session_date = :today), 0)     AS today_minutes,
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :week_ago), 0) AS week_minutes,
                COALESCE(COUNT(*)     FILTER (WHERE session_date = :today), 0)     AS today_sessions
            FROM focus_sessions
            WHERE user_id = :uid
        """),
        {"uid": caller_id, "week_ago": week_ago, "today": today},
    ).fetchone()

    profile = db.execute(
        text("""
            SELECT streak_days, streak_last_date, daily_goal_minutes, total_focus_minutes,
                   COALESCE(freeze_count, 0) AS freeze_count
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
            WITH active_days AS (
                SELECT session_date AS d
                FROM focus_sessions
                WHERE user_id = :uid
                GROUP BY session_date
                HAVING SUM(minutes) >= (
                    SELECT COALESCE(daily_goal_minutes, 20) FROM profiles WHERE telegram_id = :uid
                )
                UNION
                SELECT UNNEST(COALESCE(freeze_used_dates, '{}'))
                FROM profiles
                WHERE telegram_id = :uid
            ),
            gaps AS (
                SELECT d AS session_date,
                       d - (ROW_NUMBER() OVER (ORDER BY d) * INTERVAL '1 day') AS grp
                FROM active_days
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
        "freeze_count":        int(profile.freeze_count or 0)             if profile else 0,
    }


@router.get("/weekly")
async def get_weekly_focus(
    local_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    week_ago = _parse_local_date(local_date) - timedelta(days=6)

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


@router.get("/weekly-report")
async def get_weekly_report(
    local_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Rich weekly report data for the in-app report card screen."""
    today     = _parse_local_date(local_date)
    week_ago  = today - timedelta(days=6)
    prev_start = today - timedelta(days=13)

    # ── This week's daily breakdown ───────────────────────────────────────────
    day_rows = db.execute(
        text("""
            SELECT session_date, SUM(minutes) AS minutes
            FROM focus_sessions
            WHERE user_id = :uid AND session_date >= :week_ago
            GROUP BY session_date
        """),
        {"uid": caller_id, "week_ago": week_ago},
    ).fetchall()
    by_date = {r.session_date: int(r.minutes) for r in day_rows}

    # ── Aggregate: this week vs previous week ─────────────────────────────────
    agg = db.execute(
        text("""
            SELECT
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :week_ago), 0)   AS this_week,
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :prev_start
                                              AND   session_date <  :week_ago), 0)   AS prev_week,
                COALESCE(COUNT(DISTINCT session_date) FILTER (WHERE session_date >= :week_ago), 0) AS days_active
            FROM focus_sessions
            WHERE user_id = :uid AND session_date >= :prev_start
        """),
        {"uid": caller_id, "week_ago": week_ago, "prev_start": prev_start},
    ).fetchone()

    this_week_min = int(agg.this_week)   if agg else 0
    prev_week_min = int(agg.prev_week)   if agg else 0
    days_active   = int(agg.days_active) if agg else 0

    # ── XP earned this week ───────────────────────────────────────────────────
    xp_row = db.execute(
        text("""
            SELECT COALESCE(SUM(amount), 0) AS xp
            FROM xp_logs
            WHERE user_id = :uid AND created_at >= :week_start
        """),
        {"uid": caller_id, "week_start": datetime.combine(week_ago, datetime.min.time()).replace(tzinfo=UTC)},
    ).fetchone()
    week_xp = int(xp_row.xp) if xp_row else 0

    # ── Profile: streak + daily goal ─────────────────────────────────────────
    profile = db.execute(
        text("SELECT streak_days, daily_goal_minutes, first_name FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()
    streak     = int(profile.streak_days or 0)        if profile else 0
    daily_goal = int(profile.daily_goal_minutes or 20) if profile else 20
    first_name = profile.first_name or ""              if profile else ""

    # ── Best day ──────────────────────────────────────────────────────────────
    best_date    = max(by_date, key=by_date.get) if by_date else None
    best_minutes = by_date[best_date] if best_date else 0

    # ── Percent change ────────────────────────────────────────────────────────
    if prev_week_min > 0:
        pct_change = round((this_week_min - prev_week_min) / prev_week_min * 100)
    elif this_week_min > 0:
        pct_change = 100
    else:
        pct_change = 0

    # ── Day-by-day list (last 7 days, oldest first) ───────────────────────────
    days = [
        {
            "date":     (week_ago + timedelta(days=i)).isoformat(),
            "minutes":  by_date.get(week_ago + timedelta(days=i), 0),
            "goal_met": by_date.get(week_ago + timedelta(days=i), 0) >= daily_goal,
        }
        for i in range(7)
    ]

    return {
        "first_name":    first_name,
        "week_start":    week_ago.isoformat(),
        "week_end":      today.isoformat(),
        "total_minutes": this_week_min,
        "prev_minutes":  prev_week_min,
        "pct_change":    pct_change,
        "week_xp":       week_xp,
        "streak_days":   streak,
        "days_active":   days_active,
        "daily_goal":    daily_goal,
        "best_day":      best_date.isoformat() if best_date else None,
        "best_minutes":  best_minutes,
        "days":          days,
    }
