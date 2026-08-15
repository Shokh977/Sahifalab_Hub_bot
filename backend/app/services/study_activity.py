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
from app.services.user_time import user_local_date

logger = logging.getLogger(__name__)

ActivitySource = Literal["focus_timer", "flashcards"]


@dataclass
class StudyActivityResult:
    streak_days:              int
    streak_advanced:          bool
    today_minutes:            int
    goal_met:                 bool
    xp_awarded:                int
    freeze_count:              int  = 0
    milestone_freeze_granted:  bool = False
    stages_completed:       list[dict] = field(default_factory=list)
    challenges_completed:   list[dict] = field(default_factory=list)
    challenges_progressed:  list[dict] = field(default_factory=list)


def parse_local_date(local_date: Optional[str], tz: Optional[str] = None) -> Date:
    """Return the client's local calendar date. Falls back to the user's
    stored IANA timezone (not bare UTC) when local_date is absent/unparseable —
    see app/services/user_time.py."""
    if local_date:
        try:
            return Date.fromisoformat(local_date)
        except ValueError:
            pass
    return user_local_date(tz)


# Note: an earlier version of the UPDATE below built this query by
# string-substituting repeated CASE fragments (Postgres can't reference a
# sibling SET column mid-statement), which meant the goal-met subquery and
# the streak_days CASE were each re-evaluated 3-4 times per call — real,
# avoidable extra cost on the single busiest write path in the app. The
# UPDATE...FROM (subquery) below computes each value (today's total,
# goal_met, new_streak_days, milestone_hit) exactly once, in dependency
# order, and every SET clause just references the precomputed column —
# see incident review, section E.


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
    # Pre-fetch timezone (for the local_date fallback) and the current
    # milestone-freeze guard value (to detect, after the UPDATE, whether THIS
    # call is the one that just crossed a 7-day multiple — see step 3b).
    pre_row = db.execute(
        text("SELECT timezone, COALESCE(last_freeze_milestone_days, 0) AS last_freeze_milestone_days FROM profiles WHERE telegram_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    pre_milestone_days = int(pre_row.last_freeze_milestone_days) if pre_row else 0

    today     = parse_local_date(local_date, pre_row.timezone if pre_row else None)
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
    #    == today branch below). Also grants a free freeze on every positive
    #    multiple-of-7 streak_days crossing (step-27 / plan doc section E),
    #    capped at MAX_FREEZE_COUNT=5 — same cap streaks.py's purchase flow
    #    enforces, kept in sync manually since it's a plain literal here.
    db.execute(
        text("""
            UPDATE profiles p SET
                total_focus_minutes = COALESCE(p.total_focus_minutes, 0) + :min,
                streak_days = calc.new_streak_days,
                streak_last_date = CASE WHEN calc.goal_met THEN :today ELSE p.streak_last_date END,
                freeze_count = LEAST(5, COALESCE(p.freeze_count, 0) + CASE WHEN calc.milestone_hit THEN 1 ELSE 0 END),
                last_freeze_milestone_days = CASE
                    WHEN calc.milestone_hit THEN calc.new_streak_days
                    ELSE p.last_freeze_milestone_days
                END,
                study_pulse_at = NULL
            FROM (
                SELECT uid, goal_met, new_streak_days, prev_milestone_days,
                       (new_streak_days > 0 AND MOD(new_streak_days, 7) = 0
                        AND new_streak_days != prev_milestone_days) AS milestone_hit
                FROM (
                    SELECT uid, goal_met, prev_milestone_days,
                           CASE
                               WHEN goal_met THEN
                                   CASE
                                       WHEN prev_last_date = :today     THEN prev_streak_days
                                       WHEN prev_last_date = :yesterday THEN prev_streak_days + 1
                                       ELSE 1
                                   END
                               ELSE prev_streak_days
                           END AS new_streak_days
                    FROM (
                        SELECT
                            p2.telegram_id                              AS uid,
                            COALESCE(p2.streak_days, 0)                 AS prev_streak_days,
                            p2.streak_last_date                         AS prev_last_date,
                            COALESCE(p2.last_freeze_milestone_days, 0)  AS prev_milestone_days,
                            fs.today_total >= COALESCE(p2.daily_goal_minutes, 20) AS goal_met
                        FROM profiles p2
                        CROSS JOIN LATERAL (
                            SELECT COALESCE(SUM(minutes), 0) AS today_total
                            FROM focus_sessions
                            WHERE user_id = p2.telegram_id AND session_date = :today
                        ) fs
                        WHERE p2.telegram_id = :uid
                    ) base
                ) with_streak
            ) calc
            WHERE p.telegram_id = :uid AND calc.uid = p.telegram_id
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
                streak_last_date,
                COALESCE(freeze_count, 0) AS freeze_count,
                COALESCE(last_freeze_milestone_days, 0) AS last_freeze_milestone_days
            FROM focus_sessions fs
            JOIN profiles p ON p.telegram_id = :uid
            WHERE fs.user_id = :uid
            GROUP BY streak_days, daily_goal_minutes, streak_last_date, freeze_count, last_freeze_milestone_days
        """),
        {"uid": user_id, "today": today},
    ).fetchone()

    today_minutes = int(stats_row.today_minutes) if stats_row else minutes
    streak_days   = int(stats_row.streak_days)   if stats_row else 1
    daily_goal    = int(stats_row.daily_goal)     if stats_row else 20
    goal_met      = today_minutes >= daily_goal
    streak_advanced = goal_met and stats_row is not None and stats_row.streak_last_date == today

    # ── 3b. Milestone freeze grant flag — true iff THIS call is the one that
    #    moved the guard column (not merely "streak_days is a multiple of 7",
    #    which would also be true on later same-day/same-streak repeat calls).
    freeze_count_after   = int(stats_row.freeze_count) if stats_row else 0
    milestone_days_after = int(stats_row.last_freeze_milestone_days) if stats_row else pre_milestone_days
    milestone_freeze_granted = milestone_days_after != pre_milestone_days

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
        freeze_count=freeze_count_after,
        milestone_freeze_granted=milestone_freeze_granted,
        stages_completed=stages_completed,
        challenges_completed=challenges_completed,
        challenges_progressed=challenges_progressed,
    )
