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
import logging
from datetime import datetime, UTC, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.services.xp_service import add_xp
from app.services.study_activity import record_study_activity, StudyActivityResult
from app.services.day_bucket import try_parse_client_date
from app.api.v1.endpoints.notifications import send_notification
from app.api.v1.auth import _normalize_platform

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


class CompleteSessionRequest(BaseModel):
    minutes: int = Field(..., ge=1, le=1440)  # 24 h max per submit
    local_date: Optional[str] = None   # YYYY-MM-DD from device calendar


@router.post("/complete")
async def complete_focus_session(
    body: CompleteSessionRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
    x_client_platform: Optional[str] = Header(None, alias="X-Client-Platform"),
):
    pre = db.execute(
        text("SELECT level FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()
    old_level = int(pre.level or 1) if pre else 1

    surface = _normalize_platform(x_client_platform)

    # ── Server-side wall-clock cap + tapered timer-XP ────────────────────────
    # The client's `minutes` is a bare self-counted integer — nothing ties it
    # to a specific real-world interval, so a user running the timer on the
    # mobile app, sahifalab.uz, and the Telegram mini app at once used to get
    # credited 3x for one real hour studied. credit_focus_time() (migration
    # 082) clamps credited seconds to the real elapsed time since this user's
    # last credited completion, under a row lock, so the SUM across every
    # surface can never exceed real elapsed time.
    #
    # XP for those credited seconds is then tapered (migration 083, step-27):
    # full rate for the first 3h/day, half for 3-6h, a quarter beyond that —
    # never zero. The taper only affects XP; credited_seconds below (what
    # streak/stats/daily-goal count) is exactly the wall-clock-capped value,
    # unreduced by the taper.
    #
    # The DAY the taper/Tanga-cap counters roll over on used to be whatever
    # date string the client sent, trusted verbatim — migration 093 closed
    # that (a forged local_date could reopen an already-capped day for free,
    # see the incident writeup there). credit_focus_time() now resolves its
    # own bucket via resolve_day_bucket() and returns it as `resolved_date`;
    # body.local_date is still sent by the client (parsed here only so it can
    # be bound as a typed, possibly-NULL DATE param) and still used for the
    # transitional unconfirmed-timezone fallback INSIDE that function, but is
    # never itself the authority — see day_bucket.py.
    client_date = try_parse_client_date(body.local_date)
    try:
        credit_row = db.execute(
            text("""
                SELECT credited_seconds, xp_awarded, daily_total_seconds, anomaly_flag, resolved_date
                FROM   credit_focus_time(:uid, :claimed_seconds, :client_date, :surface)
            """),
            {
                "uid": caller_id,
                "claimed_seconds": body.minutes * 60,
                "client_date": client_date,
                "surface": surface,
            },
        ).fetchone()
        db.commit()
    except Exception:
        db.rollback()
        logger.error(
            "Focus wall-clock credit computation failed for user_id=%s claimed_minutes=%s "
            "client_date=%s surface=%s",
            caller_id, body.minutes, client_date, surface, exc_info=True,
        )
        raise HTTPException(status_code=500, detail="Session credit failed")

    credited_minutes = int(credit_row.credited_seconds) // 60
    xp_amount        = int(credit_row.xp_awarded)
    resolved_date    = credit_row.resolved_date

    if credit_row.anomaly_flag:
        try:
            db.execute(
                text("""
                    INSERT INTO focus_anomaly_flags (user_id, flagged_date, daily_seconds)
                    VALUES (:uid, :d, :secs)
                    ON CONFLICT (user_id, flagged_date) DO UPDATE
                        SET daily_seconds = EXCLUDED.daily_seconds, updated_at = NOW()
                """),
                {"uid": caller_id, "d": resolved_date, "secs": int(credit_row.daily_total_seconds)},
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.error(
                "Failed to record focus anomaly flag for user_id=%s resolved_date=%s daily_seconds=%s",
                caller_id, resolved_date, credit_row.daily_total_seconds, exc_info=True,
            )

    result = {"xp_added": 0, "new_xp": None, "new_level": old_level}
    if xp_amount > 0:
        try:
            result = add_xp(db, user_id=caller_id, source="DEEP_WORK", amount=xp_amount)
        except Exception:
            logger.error(
                "Focus-session XP award failed for user_id=%s amount=%s source=DEEP_WORK "
                "claimed_minutes=%s credited_minutes=%s",
                caller_id, xp_amount, body.minutes, credited_minutes, exc_info=True,
            )
            raise HTTPException(status_code=500, detail="XP award failed")

    # Single write path for "the user did some studying" — see
    # app/services/study_activity.py. source='focus_timer' is what makes this
    # session eligible to count toward a focus_minutes cohort challenge
    # (step-21); flashcards.py passes 'flashcards' instead, which never does.
    # Only the wall-clock-capped minutes are recorded — never the raw client
    # claim — so streak/total_focus_minutes can't be inflated either.
    if credited_minutes > 0:
        activity = record_study_activity(
            db, user_id=caller_id, minutes=credited_minutes,
            source="focus_timer", xp_awarded=result["xp_added"],
            today=resolved_date,
        )
    else:
        activity = StudyActivityResult(
            streak_days=0, streak_advanced=False, today_minutes=0,
            goal_met=False, xp_awarded=0,
        )

    # tanga-economy-rework (092): Tanga is no longer minted 1:1 with focus-
    # timer XP — record_study_activity() above already ran the new
    # daily-capped goal/60min/120min earn checks (see
    # tanga_service.check_and_award_daily_earn_events()) in its own
    # transaction, after the study record committed. No separate grant here.

    # Append focus session to activity_log (best-effort, non-critical — logged
    # rather than silently swallowed per the step-26 no-silent-failures rule)
    try:
        db.execute(
            text("""
                INSERT INTO activity_log (user_id, activity_type, metadata)
                VALUES (:uid, 'focus_session', CAST(:meta AS jsonb))
            """),
            {
                "uid":  caller_id,
                "meta": json.dumps({
                    "claimed_minutes":  body.minutes,
                    "credited_minutes": credited_minutes,
                    "xp":               result["xp_added"],
                    "surface":          surface,
                }),
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.error(
            "Failed to append activity_log row for focus_session user_id=%s", caller_id, exc_info=True,
        )

    row = db.execute(
        text("SELECT total_xp, level, streak_days, COALESCE(tanga_balance, 0) AS tanga_balance FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()

    new_level = int(row.level or 1) if row else result["new_level"]

    # Fire push notifications (non-blocking, best-effort)
    if new_level > old_level:
        asyncio.create_task(send_notification(
            caller_id, "level_up", category="SYSTEM",
            meta={"level": new_level},
        ))
    for stage in activity.stages_completed:
        asyncio.create_task(send_notification(
            caller_id, "achievement", category="SYSTEM",
            meta={
                "stage_key":    stage.get("key", ""),
                "stage_number": stage.get("stage_number"),
                "bonus_xp":     stage.get("bonus_xp", 0),
                "bonus_tanga":  stage.get("bonus_tanga", 0),
            },
        ))
    for ch in activity.challenges_completed:
        asyncio.create_task(send_notification(
            caller_id, "challenge_completed", category="SYSTEM",
            meta={"slug": ch.get("slug", ""), "reward_xp": ch.get("reward_xp", 0)},
        ))

    return {
        "xp_awarded":            result["xp_added"],
        "total_xp":              int(row.total_xp or 0) if row else result["new_xp"],
        "level":                 new_level,
        "level_up":              new_level > old_level,
        "achievements_earned":   [],
        "stages_completed":      activity.stages_completed,
        "challenges_completed":  activity.challenges_completed,
        "challenges_progressed": activity.challenges_progressed,
        "claimed_minutes":       body.minutes,
        "credited_minutes":      credited_minutes,
        "freeze_count":              activity.freeze_count,
        "milestone_freeze_granted":  activity.milestone_freeze_granted,
        # Additive (088_tanga_currency):
        "tanga_balance": int(row.tanga_balance) if row else 0,
        # tanga-economy-rework (092): daily-capped earn events actually
        # granted by THIS call (goal_met/60min/120min) — celebrate=False
        # events (daily_goal_met) are included too so the client's own
        # dedicated GoalCompleteModal can show the right Tanga amount
        # without a second, redundant generic reward-modal popup for it.
        "tanga_events": activity.tanga_events,
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
        logger.error("Focus heartbeat write failed for user_id=%s", caller_id, exc_info=True)
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


@router.get("/stages")
async def get_stages(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """
    All 10 tree stages with per-user earned status and current streak progress.
    This is the single canonical stage-progress endpoint — the equivalent
    `milestones` array previously returned by GET /api/streaks/detail was
    removed (migration 072 + streaks.py) so there is exactly one source of
    per-user stage progress in the API surface.
    """
    profile = db.execute(
        text("SELECT streak_days FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).fetchone()
    current_streak = int(profile.streak_days or 0) if profile else 0

    # Load completed stages for this user
    done_rows = db.execute(
        text("SELECT stage_key, completed_at, xp_awarded FROM user_stage_completions WHERE user_id = :uid"),
        {"uid": caller_id},
    ).fetchall()
    done_map = {r.stage_key: {"completed_at": r.completed_at.isoformat(), "xp_awarded": r.xp_awarded} for r in done_rows}

    # Load definitions — the ONLY place the 10 stage day-thresholds live.
    # bonus_tanga (092): most stages now pay Tanga, not XP — see
    # stage_service.py's module docstring for which is which per stage.
    stage_rows = db.execute(
        text("""
            SELECT key, stage_number, title, description, required_days, bonus_xp, bonus_tanga, icon
            FROM   streak_stages
            WHERE  is_active = TRUE
            ORDER BY sort_order
        """),
    ).fetchall()

    result = []
    for st in stage_rows:
        earned = st.key in done_map
        result.append({
            "key":           st.key,
            "stage_number":  st.stage_number,
            "title":         st.title,
            "description":   st.description,
            "required_days": st.required_days,
            "bonus_xp":      st.bonus_xp,
            "bonus_tanga":   st.bonus_tanga,
            "icon":          st.icon,
            "earned":        earned,
            "completed_at":  done_map[st.key]["completed_at"] if earned else None,
            "current_days":  min(current_streak, st.required_days),
            "progress_pct":  min(100, round(current_streak / st.required_days * 100)) if st.required_days > 0 else 100,
        })
    return result


@router.get("/challenges", deprecated=True)
async def get_challenges_legacy(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Deprecated alias for GET /api/focus/stages — kept only so an old mobile
    build already on the App/Play Store during rollout doesn't 404. Remove
    once the app store minimum version is bumped past this release."""
    return await get_stages(db=db, caller_id=caller_id)


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

