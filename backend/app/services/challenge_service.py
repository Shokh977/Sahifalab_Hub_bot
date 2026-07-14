"""
challenge_service.py — cohort challenge progress + completion (step-21, extended step-25).

Called from app/services/study_activity.py:record_study_activity() (focus
timer + flashcards) and directly from lessons.py / quizzes.py (lesson,
course, test completion) after every qualifying event. This module NEVER
writes to profiles.streak_days or any streak_stages table — challenge
completion is a separate economy from the tree/streak by design (see
step-21's product rule #2). If you're adding a code path here that touches
streak_days or streak_stages, stop — that's exactly the blur this module
exists to prevent.

step-25 adds challenge_type ('cumulative' | 'consistency' | 'sprint' |
'team'). progress_value keeps accumulating for ALL types (it's the number
that sprint ranks by and team totals sum) but only 'cumulative' completes
immediately on reaching target_value — 'consistency' is evaluated by a
daily cron (see evaluate_consistency_day below), and 'sprint'/'team' are
resolved once, at challenge end (see cron.py:challenges_tick).
"""
import logging
from datetime import datetime, UTC, timedelta, date as Date
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.xp_service import add_xp

logger = logging.getLogger(__name__)

# Which activity source (from study_activity.py) counts toward which challenge
# metric — the ONE place this mapping lives (study_activity.py used to keep
# its own duplicate copy; consolidated here since this module owns challenge
# logic). Only 'focus_timer' counts toward 'focus_minutes' — flashcard study
# maintains the streak but is honestly excluded from a challenge that's named
# and marketed as a focus-timer marathon. 'flashcards' counts toward
# 'flashcard_reviews' instead, measured in cards reviewed, not minutes.
METRIC_FOR_SOURCE: dict[str, str] = {
    "focus_timer": "focus_minutes",
    "flashcards":  "flashcard_reviews",
}

# Metrics with a live, wired progress path (step-25). Metrics not in this set
# are defined for the admin UI ("Tez kunda") but never actually increment —
# never enable them for challenge creation.
IMPLEMENTED_METRICS = {
    "focus_minutes", "flashcard_reviews", "lessons_completed",
    "courses_completed", "tests_passed",
}


def _award_completion(db: Session, user_id: int, challenge_id, reward_xp: int, badge_key: Optional[str]) -> None:
    """Shared XP + badge grant, used by every type's completion path. Never touches streak_days/stages."""
    if reward_xp and reward_xp > 0:
        try:
            add_xp(db, user_id=user_id, source="CHALLENGE", amount=reward_xp)
        except Exception:
            logger.error(
                "Challenge completion XP award failed for user_id=%s challenge_id=%s amount=%s",
                user_id, challenge_id, reward_xp, exc_info=True,
            )
    if badge_key:
        try:
            db.execute(
                text("""
                    INSERT INTO user_badges (user_id, badge_key, granted_at)
                    VALUES (:uid, :key, NOW())
                    ON CONFLICT (user_id, badge_key) DO NOTHING
                """),
                {"uid": user_id, "key": badge_key},
            )
        except Exception:
            logger.error("Challenge badge grant failed for user_id=%s badge_key=%s", user_id, badge_key, exc_info=True)
    try:
        db.execute(
            text("UPDATE challenges SET completion_count = completion_count + 1 WHERE id = :cid"),
            {"cid": challenge_id},
        )
    except Exception:
        logger.error("Failed to increment completion_count for challenge_id=%s", challenge_id, exc_info=True)


def record_challenge_progress(
    db: Session, user_id: int, metric: str, value: int, occurred_at: datetime,
    day: Optional[Date] = None,
) -> tuple[list[dict], list[dict]]:
    """
    Add `value` to progress_value for every ACTIVE challenge the user has
    joined whose metric matches, respecting the per-participant window
    [max(challenge.starts_at, participant.joined_at), challenge.ends_at] — no
    retroactive credit ever. Also upserts challenge_daily_progress for `day`
    (defaults to occurred_at's date) — this is what the consistency cron
    evaluates, and gives every type a free per-day chart.

    Only 'cumulative' completes here (immediately, on reaching target_value).
    'consistency' is evaluated by the daily cron; 'sprint'/'team' are
    resolved once at challenge end (cron.py:challenges_tick). Both of those
    still need progress_value updated in real time — sprint ranks by it,
    team sums it — so this function runs for every type, every time.

    Returns (challenges_completed, challenges_progressed) — both lists of
    dicts for the caller to drive celebrations / notifications.
    """
    completed:  list[dict] = []
    progressed: list[dict] = []

    if value <= 0:
        return completed, progressed
    if day is None:
        day = occurred_at.date()

    rows = db.execute(
        text("""
            SELECT cp.id AS participant_id, cp.challenge_id, cp.joined_at, cp.progress_value,
                   c.slug, c.title, c.target_value, c.reward_xp, c.badge_key, c.challenge_type,
                   c.starts_at, c.ends_at, c.metric
            FROM challenge_participants cp
            JOIN challenges c ON c.id = cp.challenge_id
            WHERE cp.user_id = :uid
              AND cp.completed_at IS NULL
              AND cp.failed_at IS NULL
              AND c.status = 'active'
              AND c.metric = :metric
        """),
        {"uid": user_id, "metric": metric},
    ).fetchall()

    for r in rows:
        window_start = max(r.starts_at, r.joined_at)
        # No retroactive credit: this activity only counts if "now" falls
        # inside the participant's own window.
        if not (window_start <= occurred_at <= r.ends_at):
            continue

        new_progress = r.progress_value + value
        updated = db.execute(
            text("""
                UPDATE challenge_participants
                SET progress_value = :new_progress
                WHERE id = :pid AND completed_at IS NULL
                RETURNING progress_value
            """),
            {"new_progress": new_progress, "pid": r.participant_id},
        ).fetchone()
        if not updated:
            continue  # concurrent completion already happened

        # Per-day bucket — the consistency cron's only data source, and a
        # free per-day chart for every type.
        db.execute(
            text("""
                INSERT INTO challenge_daily_progress (challenge_id, user_id, day, value)
                VALUES (:cid, :uid, :day, :val)
                ON CONFLICT (challenge_id, user_id, day)
                DO UPDATE SET value = challenge_daily_progress.value + :val
            """),
            {"cid": r.challenge_id, "uid": user_id, "day": day, "val": value},
        )

        progressed.append({
            "challenge_id":   str(r.challenge_id),
            "slug":           r.slug,
            "title":          r.title,
            "progress_value": new_progress,
            "target_value":   r.target_value,
        })

        # Only 'cumulative' completes immediately here — consistency/sprint/
        # team are resolved elsewhere (see module docstring).
        if r.challenge_type != "cumulative":
            continue
        if r.target_value is None or new_progress < r.target_value:
            continue

        # ── Completion — award immediately, exactly once ────────────────────
        newly_completed_row = db.execute(
            text("""
                UPDATE challenge_participants
                SET completed_at = NOW(), xp_awarded = :xp
                WHERE id = :pid AND completed_at IS NULL
                RETURNING id
            """),
            {"xp": r.reward_xp, "pid": r.participant_id},
        ).fetchone()
        if not newly_completed_row:
            continue  # another concurrent request already completed it

        _award_completion(db, user_id, r.challenge_id, r.reward_xp, r.badge_key)

        completed.append({
            "challenge_id": str(r.challenge_id),
            "slug":         r.slug,
            "title":        r.title,
            "reward_xp":    r.reward_xp,
            "badge_key":    r.badge_key,
        })

    return completed, progressed


# ── Consistency evaluation (daily cron) ────────────────────────────────────────

def evaluate_consistency_day(db: Session, target_day: Date) -> dict:
    """
    Evaluate every 'consistency' challenge participant for `target_day`
    (normally "yesterday" — see cron.py). Not filtered to status='active'
    only: a challenge that flips to 'ended' before the next morning's cron
    run still needs its final day evaluated, so this looks at any
    consistency challenge whose window includes target_day.

    Never eliminates anyone harshly: allowed_misses is a grace dial (a
    failed run costs no XP, no streak, nothing — just no reward), and a
    completed run awards immediately here.
    """
    results = {"evaluated": 0, "advanced": 0, "failed": 0, "completed": 0}

    rows = db.execute(
        text("""
            SELECT cp.id AS participant_id, cp.challenge_id, cp.user_id, cp.joined_at,
                   cp.current_run, cp.misses_used, cp.qualifying_days,
                   c.title, c.slug, c.daily_minimum, c.required_days, c.allowed_misses,
                   c.reward_xp, c.badge_key, c.starts_at, c.ends_at,
                   COALESCE(dp.value, 0) AS day_value
            FROM challenge_participants cp
            JOIN challenges c ON c.id = cp.challenge_id
            LEFT JOIN challenge_daily_progress dp
                   ON dp.challenge_id = cp.challenge_id AND dp.user_id = cp.user_id AND dp.day = :day
            WHERE c.challenge_type = 'consistency'
              AND cp.completed_at IS NULL
              AND cp.failed_at IS NULL
              AND c.starts_at::date <= :day AND c.ends_at::date >= :day
              AND cp.joined_at::date <= :day
        """),
        {"day": target_day},
    ).fetchall()

    for r in rows:
        results["evaluated"] += 1
        qualified = r.day_value >= (r.daily_minimum or 0)

        if qualified:
            new_run = r.current_run + 1
            db.execute(
                text("""
                    UPDATE challenge_participants
                    SET current_run = :run, qualifying_days = qualifying_days + 1
                    WHERE id = :pid
                """),
                {"run": new_run, "pid": r.participant_id},
            )
            results["advanced"] += 1

            if new_run >= (r.required_days or 0):
                completed_row = db.execute(
                    text("""
                        UPDATE challenge_participants
                        SET completed_at = NOW(), xp_awarded = :xp
                        WHERE id = :pid AND completed_at IS NULL
                        RETURNING id
                    """),
                    {"xp": r.reward_xp, "pid": r.participant_id},
                ).fetchone()
                if completed_row:
                    _award_completion(db, r.user_id, r.challenge_id, r.reward_xp, r.badge_key)
                    results["completed"] += 1
        else:
            new_misses = r.misses_used + 1
            allowed = r.allowed_misses or 0
            if new_misses > allowed:
                # Run over — no XP loss, no streak loss, no shame. Just no reward.
                db.execute(
                    text("""
                        UPDATE challenge_participants
                        SET misses_used = :misses, current_run = 0, failed_at = NOW()
                        WHERE id = :pid
                    """),
                    {"misses": new_misses, "pid": r.participant_id},
                )
                results["failed"] += 1
                try:
                    from app.api.v1.endpoints.notifications import send_notification
                    import asyncio
                    asyncio.create_task(send_notification(
                        r.user_id, "consistency_failed", category="SYSTEM",
                        meta={"challenge_id": str(r.challenge_id), "title": r.title},
                    ))
                except Exception:
                    logger.error("Failed to notify consistency failure for user_id=%s", r.user_id, exc_info=True)
            else:
                # Grace day used, within the allowance — this IS the point of
                # allowed_misses: the day is forgiven and current_run is left
                # untouched (neither advanced nor reset). Resetting it here
                # would make the "kindness dial" pointless — a user would
                # still need required_days of unbroken perfection after any
                # single miss, which is exactly the harsh behavior
                # allowed_misses exists to prevent.
                db.execute(
                    text("UPDATE challenge_participants SET misses_used = :misses WHERE id = :pid"),
                    {"misses": new_misses, "pid": r.participant_id},
                )

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Failed to commit consistency evaluation for day=%s", target_day, exc_info=True)

    return results


# ── Sprint / team end-of-challenge resolution (called when a challenge ends) ──

def resolve_sprint_challenge(db: Session, challenge_id, winner_count: int, reward_xp: int, badge_key: Optional[str]) -> int:
    """Rank all participants by progress_value DESC (tiebreak: earlier joined_at). Top `winner_count` win."""
    rows = db.execute(
        text("""
            SELECT id AS participant_id, user_id,
                   RANK() OVER (ORDER BY progress_value DESC, joined_at ASC) AS rank
            FROM challenge_participants
            WHERE challenge_id = :cid
        """),
        {"cid": challenge_id},
    ).fetchall()

    winners = 0
    for r in rows:
        is_winner = winner_count is not None and r.rank <= winner_count
        db.execute(
            text("UPDATE challenge_participants SET final_rank = :rank, is_winner = :win WHERE id = :pid"),
            {"rank": r.rank, "win": is_winner, "pid": r.participant_id},
        )
        if is_winner:
            winners += 1
            db.execute(
                text("UPDATE challenge_participants SET completed_at = NOW(), xp_awarded = :xp WHERE id = :pid"),
                {"xp": reward_xp, "pid": r.participant_id},
            )
            _award_completion(db, r.user_id, challenge_id, reward_xp, badge_key)
    return winners


def resolve_team_challenge(db: Session, challenge_id, reward_xp: int, badge_key: Optional[str]) -> Optional[str]:
    """
    Whichever team's TOTAL progress_value is higher wins — every member of
    that team is rewarded. An exact tie declares no winner (no team is
    penalized; nobody is rewarded either — a fair, unambiguous default the
    spec doesn't otherwise cover).
    """
    totals = db.execute(
        text("""
            SELECT team, COALESCE(SUM(progress_value), 0) AS total
            FROM challenge_participants
            WHERE challenge_id = :cid AND team IS NOT NULL
            GROUP BY team
        """),
        {"cid": challenge_id},
    ).fetchall()
    total_map = {t.team: t.total for t in totals}
    team_a_total = total_map.get("A", 0)
    team_b_total = total_map.get("B", 0)

    if team_a_total == team_b_total:
        winning_team = None
    else:
        winning_team = "A" if team_a_total > team_b_total else "B"

    if winning_team:
        members = db.execute(
            text("SELECT id AS participant_id, user_id FROM challenge_participants WHERE challenge_id = :cid AND team = :team"),
            {"cid": challenge_id, "team": winning_team},
        ).fetchall()
        for m in members:
            db.execute(
                text("""
                    UPDATE challenge_participants
                    SET is_winner = TRUE, completed_at = NOW(), xp_awarded = :xp
                    WHERE id = :pid
                """),
                {"xp": reward_xp, "pid": m.participant_id},
            )
            _award_completion(db, m.user_id, challenge_id, reward_xp, badge_key)

    return winning_team
