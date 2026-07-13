"""
challenge_service.py — cohort challenge progress + completion (step-21).

Called from app/services/study_activity.py:record_study_activity() after
every study session. This module NEVER writes to profiles.streak_days or any
streak_stages table — challenge completion is a separate economy from the
tree/streak by design (see step-21's product rule #2). If you're adding a
code path here that touches streak_days or streak_stages, stop — that's
exactly the blur this module exists to prevent.
"""
import logging
from datetime import datetime, UTC

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.xp_service import add_xp

logger = logging.getLogger(__name__)

# Which activity sources count toward which challenge metric. Only
# 'focus_timer' counts toward 'focus_minutes' challenges (step-21 product
# rule: flashcard study maintains the streak but is honestly excluded from a
# challenge that's named and marketed as a focus-timer marathon).
_METRIC_SOURCES: dict[str, set[str]] = {
    "focus_minutes": {"focus_timer"},
}


def update_challenge_progress(db: Session, user_id: int, minutes: int, source: str) -> tuple[list[dict], list[dict]]:
    """
    Add `minutes` to progress_value for every ACTIVE challenge the user has
    joined whose metric this `source` counts toward, respecting the
    per-participant window [max(challenge.starts_at, participant.joined_at),
    challenge.ends_at] — no retroactive credit ever. Awards completion
    (XP + badge) immediately and exactly once when target_value is newly
    reached.

    Returns (challenges_completed, challenges_progressed) — both lists of
    dicts for the caller to drive celebrations / notifications.
    """
    completed:   list[dict] = []
    progressed:  list[dict] = []

    matching_metrics = [m for m, sources in _METRIC_SOURCES.items() if source in sources]
    if not matching_metrics:
        return completed, progressed

    now = datetime.now(UTC)

    rows = db.execute(
        text("""
            SELECT cp.id AS participant_id, cp.challenge_id, cp.joined_at, cp.progress_value,
                   c.slug, c.title, c.target_value, c.reward_xp, c.badge_key,
                   c.starts_at, c.ends_at, c.metric
            FROM challenge_participants cp
            JOIN challenges c ON c.id = cp.challenge_id
            WHERE cp.user_id = :uid
              AND cp.completed_at IS NULL
              AND c.status = 'active'
              AND c.metric = ANY(:metrics)
        """),
        {"uid": user_id, "metrics": matching_metrics},
    ).fetchall()

    for r in rows:
        window_start = max(r.starts_at, r.joined_at)
        # No retroactive credit: this activity only counts if "now" falls
        # inside the participant's own window. A session logged before the
        # challenge started, or before the user joined, earns nothing here —
        # by definition it already happened, so `now` can only be after both.
        if not (window_start <= now <= r.ends_at):
            continue

        new_progress = r.progress_value + minutes
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

        progressed.append({
            "challenge_id":   str(r.challenge_id),
            "slug":           r.slug,
            "title":          r.title,
            "progress_value": new_progress,
            "target_value":   r.target_value,
        })

        if new_progress < r.target_value:
            continue

        # ── Completion — award immediately, exactly once ────────────────────
        # completed_at IS NULL guard (race-safe: only one concurrent request
        # can win this UPDATE) + the UNIQUE(challenge_id, user_id) constraint
        # on the table are the dedup guard. Never touches streak_days/stages.
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

        if r.reward_xp > 0:
            try:
                add_xp(db, user_id=user_id, source="CHALLENGE", amount=r.reward_xp)
            except Exception:
                logger.error(
                    "Challenge completion XP award failed for user_id=%s challenge_id=%s amount=%s source=CHALLENGE",
                    user_id, r.challenge_id, r.reward_xp, exc_info=True,
                )

        if r.badge_key:
            try:
                db.execute(
                    text("""
                        INSERT INTO user_badges (user_id, badge_key, granted_at)
                        VALUES (:uid, :key, NOW())
                        ON CONFLICT (user_id, badge_key) DO NOTHING
                    """),
                    {"uid": user_id, "key": r.badge_key},
                )
            except Exception:
                logger.error(
                    "Challenge badge grant failed for user_id=%s badge_key=%s",
                    user_id, r.badge_key, exc_info=True,
                )

        try:
            db.execute(
                text("UPDATE challenges SET completion_count = completion_count + 1 WHERE id = :cid"),
                {"cid": r.challenge_id},
            )
        except Exception:
            logger.error(
                "Failed to increment completion_count for challenge_id=%s",
                r.challenge_id, exc_info=True,
            )

        completed.append({
            "challenge_id": str(r.challenge_id),
            "slug":         r.slug,
            "title":        r.title,
            "reward_xp":    r.reward_xp,
            "badge_key":    r.badge_key,
        })

    return completed, progressed
