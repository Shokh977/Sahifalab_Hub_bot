"""
streaks.py — Streak detail, freeze purchase, and freeze use endpoints.

GET  /api/streaks/detail          — streak_days, freeze_count, calendar.
                                    Stage-milestone progress lives at
                                    GET /api/focus/stages, not here — do not
                                    re-add a `milestones` field to this
                                    response, it was dead data on the client.
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
from app.services.user_time import user_local_date, local_midnight_utc
from app.services.freeze_service import (
    MAX_CONSECUTIVE_FREEZES,
    check_freeze_eligibility,
    compute_streak_state,
    consecutive_freeze_run_ending_before,
    apply_freeze,
)

router = APIRouter()


def _parse_local_date(local_date: Optional[str], tz: Optional[str] = None) -> date:
    """Return the client's local calendar date. Falls back to the user's
    stored IANA timezone (not bare UTC) when local_date is absent/unparseable —
    the client-supplied path is unchanged and remains authoritative when present."""
    if local_date:
        try:
            return date.fromisoformat(local_date)
        except ValueError:
            pass
    return user_local_date(tz)


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
# MAX_FREEZE_COUNT caps how many freeze charges a user can hold at once
# (step-20 Phase 4B — freeze_count previously had no ceiling, only a
# CHECK(freeze_count >= 0) floor). The old 10-pack (1200 XP) is removed here
# since it could never be purchased against a cap of 5 — do not re-add a
# package larger than MAX_FREEZE_COUNT.
MAX_FREEZE_COUNT = 5

_FREEZE_PACKAGES = {
    1: 200,   # 1 freeze  = 200 XP
    3: 500,   # 3 freezes = 500 XP
    5: 750,   # 5 freezes = 750 XP
}


def _build_calendar(db: Session, user_id: int, today: date, days: int = 7, daily_goal: int = 20) -> list[dict]:
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
    days: int = Query(7, ge=7, le=30),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    profile = db.execute(
        text("""
            SELECT streak_days, streak_last_date,
                   COALESCE(freeze_count, 0)      AS freeze_count,
                   COALESCE(freeze_used_dates, '{}') AS freeze_used_dates,
                   daily_goal_minutes, total_xp, timezone
            FROM profiles WHERE telegram_id = :uid
        """),
        {"uid": caller_id},
    ).fetchone()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    today = _parse_local_date(local_date, profile.timezone)

    streak_days  = int(profile.streak_days or 0)
    freeze_count = int(profile.freeze_count or 0)
    last_date    = profile.streak_last_date
    daily_goal   = int(profile.daily_goal_minutes or 20)
    freeze_dates_all: set = set(profile.freeze_used_dates or [])

    # Determine if streak is active (studied today or yesterday) — kept as its
    # own untouched computation for backward compatibility with any client
    # still reading only this field (see plan doc, section B).
    is_active = last_date is not None and last_date >= today - timedelta(days=1)

    # Freeze is only valid when exactly one day was missed:
    # last study must be exactly 2 days ago, yesterday must not already be frozen,
    # and the user must have freeze charges.
    missed_date = today - timedelta(days=1)
    # can_freeze: user has freezes AND the 1-day window is open
    can_freeze = (
        streak_days > 0
        and not is_active
        and last_date is not None
        and last_date == today - timedelta(days=2)
        and missed_date not in freeze_dates_all
        and freeze_count > 0
    )
    # can_freeze_if_purchased: window is open regardless of current freeze balance
    can_freeze_if_purchased = (
        streak_days > 0
        and not is_active
        and last_date is not None
        and last_date == today - timedelta(days=2)
        and missed_date not in freeze_dates_all
    )

    # ── Explicit state machine (replaces is_active for new clients) ─────────
    # today_goal_met is derived from `calendar` (moved up from the bottom of
    # this function) instead of a separate query — _build_calendar's own
    # study_dates query already covers today (its window always runs through
    # today, i.e. calendar[-1] is always today's entry), so re-querying
    # focus_sessions here would just duplicate work this endpoint already
    # does on every call. See incident review: this endpoint is hit on nearly
    # every dashboard load, so an avoidable extra query here matters at scale.
    calendar = _build_calendar(db, caller_id, today, days=days, daily_goal=daily_goal)
    today_goal_met = calendar[-1]["status"] == "studied"

    streak_state = compute_streak_state(today, last_date, freeze_dates_all, today_goal_met)
    window_closes_at = (
        local_midnight_utc(profile.timezone, today).isoformat()
        if streak_state == "at_risk" else None
    )
    consecutive_freezes_used = consecutive_freeze_run_ending_before(freeze_dates_all, missed_date)

    # Study days this week (Mon–Sun) — studied days + frozen days
    week_start = today - timedelta(days=today.weekday())
    week_row = db.execute(
        text("""
            SELECT COUNT(*) AS cnt FROM (
                SELECT session_date AS d
                FROM focus_sessions
                WHERE user_id = :uid AND session_date >= :ws AND session_date <= :today
                GROUP BY session_date
                HAVING SUM(minutes) >= :goal
                UNION
                SELECT UNNEST(COALESCE(freeze_used_dates, '{}'))
                FROM profiles
                WHERE telegram_id = :uid
            ) sub
            WHERE d >= :ws AND d <= :today
        """),
        {"uid": caller_id, "ws": week_start, "goal": daily_goal, "today": today},
    ).fetchone()
    week_days = int(week_row.cnt or 0) if week_row else 0

    # Longest streak — studied days + frozen days treated as active
    longest_row = db.execute(
        text("""
            WITH active_days AS (
                SELECT session_date AS d
                FROM focus_sessions
                WHERE user_id = :uid
                GROUP BY session_date
                HAVING SUM(minutes) >= :goal
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
        {"uid": caller_id, "goal": daily_goal},
    ).fetchone()
    longest_streak = int(longest_row.longest or 0) if longest_row else 0

    # Stage-milestone progress moved to GET /api/focus/stages (the single
    # canonical stage-progress endpoint — see migration 072 + focus.py). This
    # response no longer duplicates it; the old `milestones` field was
    # fetched by the mobile client but never rendered anywhere (dead data).
    # (`calendar` itself is computed above now, alongside today_goal_met.)

    return {
        "streak_days":             streak_days,
        "is_active":               is_active,
        "can_freeze":              can_freeze,
        "can_freeze_if_purchased": can_freeze_if_purchased,
        "streak_state":             streak_state,
        "window_closes_at":         window_closes_at,
        "max_consecutive_freezes":  MAX_CONSECUTIVE_FREEZES,
        "consecutive_freezes_used": consecutive_freezes_used,
        "longest_streak": longest_streak,
        "week_days":      week_days,
        "freeze_count":   freeze_count,
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

    total_xp     = int(profile.total_xp or 0)
    freeze_count = int(profile.freeze_count or 0)

    if total_xp < xp_cost:
        raise HTTPException(status_code=400, detail=f"Not enough XP. Need {xp_cost}, have {total_xp}")

    if freeze_count + body.count > MAX_FREEZE_COUNT:
        raise HTTPException(
            status_code=400,
            detail=f"Freeze limiti: {MAX_FREEZE_COUNT} tagacha. Sizda hozir {freeze_count} ta bor.",
        )

    # Atomic deduction: WHERE total_xp >= :cost AND freeze_count + :n <= cap
    # prevents both double-spend and cap-overrun under concurrent purchases.
    result = db.execute(
        text("""
            UPDATE profiles
            SET total_xp     = total_xp - :cost,
                freeze_count = COALESCE(freeze_count, 0) + :n
            WHERE telegram_id = :uid
              AND total_xp >= :cost
              AND COALESCE(freeze_count, 0) + :n <= :cap
        """),
        {"cost": xp_cost, "n": body.count, "uid": caller_id, "cap": MAX_FREEZE_COUNT},
    )
    if result.rowcount == 0:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Freeze sotib olinmadi — XP yoki freeze limiti yetarli emas.",
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
    """
    Consume one freeze to bridge exactly one missed day.

    local_date = the user's actual today (device local date).
    The freeze is always applied to yesterday (today - 1), the missed day.
    After this call the user must still study today to advance the streak.
    """
    profile = db.execute(
        text("""
            SELECT streak_days, streak_last_date,
                   COALESCE(freeze_count, 0) AS freeze_count,
                   COALESCE(freeze_used_dates, '{}') AS freeze_used_dates,
                   timezone
            FROM profiles WHERE telegram_id = :uid
        """),
        {"uid": caller_id},
    ).fetchone()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    today = _parse_local_date(local_date, profile.timezone)  # actual today (device local)
    missed_date = today - timedelta(days=1)                  # the day that was missed

    freeze_count = int(profile.freeze_count or 0)
    freeze_used_dates: set = set(profile.freeze_used_dates or [])
    last_date = profile.streak_last_date

    elig = check_freeze_eligibility(today, last_date, freeze_count, freeze_used_dates)
    if not elig.eligible:
        _REASON_MESSAGES = {
            "no_freezes":     "No freezes available",
            "not_missed":     "Streak is still active, no freeze needed",
            "already_frozen": "Freeze already applied to the missed date",
            "gap_too_large":  "More than one day was missed — freeze can only cover a single missed day",
            "consecutive_cap": "Ketma-ket ko'pi bilan 2 kun muzlatish mumkin — bugun o'qib seriyani jonlantiring.",
        }
        raise HTTPException(status_code=400, detail=_REASON_MESSAGES.get(elig.reason, "Freeze not eligible"))

    rowcount = apply_freeze(db, caller_id, missed_date, last_date)
    if rowcount == 0:
        # Raced with a concurrent request/cron tick that already applied it.
        raise HTTPException(status_code=400, detail="Freeze already applied to the missed date")

    return {
        "ok":           True,
        "freeze_count": freeze_count - 1,
        "streak_days":  int(profile.streak_days or 0),
        "frozen_date":  missed_date.isoformat(),
    }
