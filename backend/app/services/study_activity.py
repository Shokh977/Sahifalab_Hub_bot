"""
study_activity.py — the single write path for "the user did some studying".

Before this module existed, the streak-update SQL (INSERT INTO focus_sessions +
UPDATE profiles SET total_focus_minutes/streak_days/streak_last_date) was
copy-pasted line-for-line in focus.py's POST /complete and flashcards.py's
POST /decks/{id}/complete. That was a landmine: change one copy, forget the
other, and they'd diverge silently. record_study_activity() is the one place
this logic lives now.

Callers are responsible for computing the XP amount themselves first (the
formula genuinely differs per source — 1.66 XP/min for the focus timer vs.
ceil(cards_reviewed/5) once-per-day for flashcards) and, in the flashcards
case, for their own "already claimed today" gating. This function then does
everything that follows from "a study session of N minutes just happened":

  1. Award the XP the caller computed (source='DEEP_WORK' in the ledger,
     matching existing behavior for both callers — unchanged).
  2. Record the focus_sessions row.
  3. Update streak_days / streak_last_date (the CASE logic, now in one place).
  4. Check & award streak stages (step-20's stage system).
  5. Update progress on any active challenges the caller's `source` counts
     toward (step-21) — never touches streak_days/streak_stages either way.

`source` here is the ACTIVITY kind for challenge-metric matching
('focus_timer' | 'flashcards'), not the xp_logs ledger source string (which
stays 'DEEP_WORK' for both, matching current behavior — this refactor changes
no XP amounts, no XP source strings, no streak math).
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime, UTC, timedelta, date as Date
from typing import Optional, Literal

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.xp_service import add_xp

logger = logging.getLogger(__name__)

ActivitySource = Literal["focus_timer", "flashcards"]


@dataclass
class StudyActivityResult:
    streak_days:           int
    streak_advanced:        bool
    today_minutes:          int
    goal_met:               bool
    xp_awarded:             int
    stages_completed:       list[dict] = field(default_factory=list)
    challenges_completed:   list[dict] = field(default_factory=list)
    challenges_progressed:  list[dict] = field(default_factory=list)


def parse_local_date(local_date: Optional[str]) -> Date:
    """Return the client's local calendar date, or UTC today as fallback."""
    if local_date:
        try:
            return Date.fromisoformat(local_date)
        except ValueError:
            pass
    return datetime.now(UTC).date()


def record_study_activity(
    db: Session,
    user_id: int,
    minutes: int,
    source: ActivitySource,
    xp_awarded: int,
    local_date: Optional[str] = None,
    challenge_value: Optional[int] = None,
) -> StudyActivityResult:
    """
    Single write path for "the user did some studying". Must be called inside
    a request that will commit its own transaction (this function calls
    db.commit() internally at the points the original two call sites did, to
    keep behavior identical).
    """
    today     = parse_local_date(local_date)
    yesterday = today - timedelta(days=1)

    # ── 1. Record the session ────────────────────────────────────────────────
    db.execute(
        text("""
            INSERT INTO focus_sessions (user_id, minutes, xp_awarded, session_date)
            VALUES (:uid, :min, :xp, :today)
        """),
        {"uid": user_id, "min": minutes, "xp": xp_awarded, "today": today},
    )

    # ── 2. Streak update — only advances when today's total meets the daily
    #    goal. The subquery runs after the INSERT above so it includes the
    #    just-added session. Idempotent per day: studying again today after
    #    the goal is already met leaves streak_days unchanged (streak_last_date
    #    == today branch below).
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
        {"min": minutes, "uid": user_id, "today": today, "yesterday": yesterday},
    )
    db.commit()

    # ── 3. Read back today's totals + streak for stage/goal checks ──────────
    stats_row = db.execute(
        text("""
            SELECT
                COALESCE(SUM(minutes) FILTER (WHERE session_date = :today), 0) AS today_minutes,
                COALESCE(streak_days, 0) AS streak_days,
                COALESCE(daily_goal_minutes, 20) AS daily_goal,
                streak_last_date
            FROM focus_sessions fs
            JOIN profiles p ON p.telegram_id = :uid
            WHERE fs.user_id = :uid
            GROUP BY streak_days, daily_goal_minutes, streak_last_date
        """),
        {"uid": user_id, "today": today},
    ).fetchone()

    today_minutes = int(stats_row.today_minutes) if stats_row else minutes
    streak_days   = int(stats_row.streak_days)   if stats_row else 1
    daily_goal    = int(stats_row.daily_goal)     if stats_row else 20
    goal_met      = today_minutes >= daily_goal
    streak_advanced = goal_met and stats_row is not None and stats_row.streak_last_date == today

    # ── 4. Stage milestones (step-20) ────────────────────────────────────────
    from app.services.stage_service import check_and_award_stages
    stages_completed = check_and_award_stages(db, user_id, streak_days)
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.error(
            "Failed to commit streak-stage completion records for user_id=%s streak_days=%s",
            user_id, streak_days, exc_info=True,
        )

    # ── 5. Challenge progress (step-21, extended step-25) — never touches
    #    streak_days/stages. `challenge_value` lets the caller report a unit
    #    other than minutes (e.g. flashcards.py passes cards-reviewed count
    #    for the flashcard_reviews metric); defaults to `minutes` for the
    #    focus timer, which counts toward focus_minutes 1:1.
    challenges_completed:  list[dict] = []
    challenges_progressed: list[dict] = []
    try:
        from app.services.challenge_service import record_challenge_progress, METRIC_FOR_SOURCE
        metric = METRIC_FOR_SOURCE.get(source)
        if metric:
            value = challenge_value if challenge_value is not None else minutes
            challenges_completed, challenges_progressed = record_challenge_progress(
                db, user_id, metric, value, occurred_at=datetime.now(UTC), day=today,
            )
        db.commit()
    except Exception:
        db.rollback()
        logger.error(
            "Failed to update challenge progress for user_id=%s minutes=%s source=%s",
            user_id, minutes, source, exc_info=True,
        )

    return StudyActivityResult(
        streak_days=streak_days,
        streak_advanced=streak_advanced,
        today_minutes=today_minutes,
        goal_met=goal_met,
        xp_awarded=xp_awarded,
        stages_completed=stages_completed,
        challenges_completed=challenges_completed,
        challenges_progressed=challenges_progressed,
    )
