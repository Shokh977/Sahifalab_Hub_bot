"""
tanga_reconciliation.py — retries Tanga grants for study sessions whose
live grant_tanga_for_xp() call failed (spec: "a gamification side-effect
must never roll back the fact that a user studied", and separately:
"log loudly and let a reconciliation job retry it").

focus.py and flashcards.py already grant Tanga AFTER record_study_activity()
commits, using idempotency_key=f"study_activity:{session_id}" — so this job
just needs to find focus_sessions rows with no matching tanga_transactions
row and retry the same grant with the SAME idempotency key. Because
grant_tanga() is idempotent on that key, this can run as often as needed
without ever double-granting, even if it races with a live request that's
mid-flight — grant_tanga's own idempotency check is the real safety net,
not this job's SELECT.

grace_minutes exists purely to avoid wasted work re-querying sessions whose
live grant is still in flight (the request handler is still running); it is
NOT a correctness requirement.
"""
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.tanga_service import grant_tanga

logger = logging.getLogger(__name__)


def find_unreconciled_sessions(db: Session, grace_minutes: int = 5, limit: int = 500) -> list:
    """
    focus_sessions predates Tanga by a long history — years of rows that were
    never meant to have a matching tanga_transactions entry, because the
    ledger didn't exist yet when they were created. Those rows are already
    accounted for exactly once, via migration 088's one-time
    `tanga_balance = total_xp` backfill snapshot.

    Only a session created AFTER that backfill moment could have had a live
    grant_tanga_for_xp() call attempted (and possibly failed) — so the
    cutoff below anchors to app_config.tanga_mirror_mode's row, written by
    088 at the exact moment the backfill ran. Without this cutoff, this job
    treats a user's ENTIRE historical study record as "missing a grant" and
    credits it a second time on top of the backfill — a real incident this
    fixes (found via a live tanga_balance >> total_xp report).
    """
    rows = db.execute(
        text("""
            SELECT fs.id, fs.user_id, fs.xp_awarded
            FROM focus_sessions fs
            WHERE fs.xp_awarded > 0
              AND fs.created_at < NOW() - make_interval(mins => :grace)
              AND fs.created_at > (SELECT updated_at FROM app_config WHERE key = 'tanga_mirror_mode')
              AND NOT EXISTS (
                  SELECT 1 FROM tanga_transactions tt
                  WHERE tt.idempotency_key = 'study_activity:' || fs.id
              )
            ORDER BY fs.id
            LIMIT :limit
        """),
        {"grace": grace_minutes, "limit": limit},
    ).fetchall()
    return rows


def reconcile_missing_study_grants(db: Session, grace_minutes: int = 5, limit: int = 500) -> dict:
    """Called by the cron scheduler (see cron.py's /tanga-reconciliation).
    Returns a summary dict: {checked, granted, failed}."""
    candidates = find_unreconciled_sessions(db, grace_minutes=grace_minutes, limit=limit)

    granted = 0
    failed = 0
    for row in candidates:
        try:
            result = grant_tanga(
                db, user_id=int(row.user_id), amount=int(row.xp_awarded),
                reason="study_activity_reconciled",
                reference_type="focus_session", reference_id=int(row.id),
                idempotency_key=f"study_activity:{row.id}",
            )
            if result.ok:
                granted += 1
            else:
                failed += 1
                logger.error(
                    "Tanga reconciliation grant rejected for focus_session id=%s user_id=%s: %s",
                    row.id, row.user_id, result.error,
                )
        except Exception:
            failed += 1
            db.rollback()
            logger.error(
                "Tanga reconciliation grant raised for focus_session id=%s user_id=%s",
                row.id, row.user_id, exc_info=True,
            )

    if candidates:
        logger.info(
            "Tanga reconciliation: checked=%d granted=%d failed=%d",
            len(candidates), granted, failed,
        )

    return {"checked": len(candidates), "granted": granted, "failed": failed}
