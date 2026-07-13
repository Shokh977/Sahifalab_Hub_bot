"""
stage_service.py — streak-stage milestone checking (step-20).

Moved here (from app/api/v1/endpoints/focus.py) during step-21's Phase 0
refactor so app/services/study_activity.py can call it without creating a
circular import (study_activity.py is a lower-layer service that both
focus.py and flashcards.py depend on; it cannot import from an endpoints
module that itself depends on study_activity.py).
"""
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.xp_service import add_xp

logger = logging.getLogger(__name__)


def check_and_award_stages(db: Session, caller_id: int, streak_days: int) -> list[dict]:
    """
    Check every active streak_stages row the user has now reached and award
    any that aren't already recorded in user_stage_completions. Awards bonus
    XP once per stage per user (STREAK_STAGE source, distinct from ordinary
    DEEP_WORK XP so the ledger is auditable). Returns the list of
    newly-completed stages (only ones where XP was actually granted — a
    failed award is never recorded as completed, so it can be retried on the
    next check instead of being silently and permanently marked "earned"
    with 0 XP).

    The milestone-day list lives ONLY in the streak_stages table (migration
    072_streak_stages_consolidation.sql) — do not reintroduce a hardcoded
    list here.
    """
    newly_done: list[dict] = []

    stages = db.execute(
        text("""
            SELECT key, stage_number, title, bonus_xp, required_days
            FROM   streak_stages
            WHERE  is_active = TRUE AND required_days <= :streak_days
            ORDER BY required_days ASC
        """),
        {"streak_days": streak_days},
    ).fetchall()

    for stage in stages:
        key = stage.key
        existing = db.execute(
            text("SELECT id FROM user_stage_completions WHERE user_id = :uid AND stage_key = :key"),
            {"uid": caller_id, "key": key},
        ).fetchone()
        if existing:
            continue

        bonus = int(stage.bonus_xp or 0)
        try:
            xp_result = add_xp(db, user_id=caller_id, source="STREAK_STAGE", amount=bonus, reference_id=stage.stage_number)
        except Exception:
            logger.error(
                "Streak-stage XP award failed for user_id=%s stage_key=%s amount=%s source=STREAK_STAGE",
                caller_id, key, bonus, exc_info=True,
            )
            continue  # do not record completion — retry on the next check

        try:
            db.execute(
                text("""
                    INSERT INTO user_stage_completions (user_id, stage_key, xp_awarded)
                    VALUES (:uid, :key, :xp)
                    ON CONFLICT DO NOTHING
                """),
                {"uid": caller_id, "key": key, "xp": xp_result.get("xp_added", 0)},
            )
        except Exception:
            logger.error(
                "Failed to record stage completion for user_id=%s stage_key=%s (XP was already granted)",
                caller_id, key, exc_info=True,
            )
            # XP was already granted above — do not skip appending to
            # newly_done, the user did earn it even if this row failed.

        # Grant the matching achievement badge (stage_1..stage_10) at the
        # same moment — one event: XP + badge + tree evolution together.
        # Badge key is always "stage_{stage_number}", NOT streak_stages.key —
        # stages 3/4/5 keep their legacy DB keys (streak_7/streak_14/
        # streak_30) for FK safety (see migration 072), but achievements.py's
        # badge catalogue uses stage_3/stage_4/stage_5 uniformly for all 10.
        # Best-effort: a failure here must never undo the XP/completion above.
        badge_key = f"stage_{stage.stage_number}"
        try:
            db.execute(
                text("""
                    INSERT INTO user_badges (user_id, badge_key, granted_at)
                    VALUES (:uid, :key, NOW())
                    ON CONFLICT (user_id, badge_key) DO NOTHING
                """),
                {"uid": caller_id, "key": badge_key},
            )
        except Exception:
            logger.error(
                "Failed to grant stage badge for user_id=%s badge_key=%s",
                caller_id, badge_key, exc_info=True,
            )

        newly_done.append({
            "key": key,
            "stage_number": stage.stage_number,
            "title": stage.title,
            "required_days": stage.required_days,
            "bonus_xp": bonus,
        })
    return newly_done
