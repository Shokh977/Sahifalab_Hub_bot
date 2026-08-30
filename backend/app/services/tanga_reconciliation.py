"""
tanga_reconciliation.py — DISABLED. This job's entire premise predates the
tanga-economy-rework (migration 092) and is now actively wrong.

Original design: focus.py/flashcards.py used to grant Tanga 1:1 with XP via
a live grant_tanga_for_xp() call right after record_study_activity()
committed, using idempotency_key=f"study_activity:{session_id}". This job
retried that SAME grant for any focus_sessions row missing a matching
tanga_transactions row, on the theory that the live call might have failed.

Migration 092 removed that live grant entirely — focus/flashcard study
Tanga now comes ONLY from check_and_award_daily_earn_events() (daily-capped,
event-based: daily_goal_met/threshold_60min/threshold_120min), called
synchronously inside record_study_activity() itself, not a separate
fire-and-forget call this job needs to backstop.

Nobody updated this job when 092 shipped. Its cutoff filter
(`fs.created_at > (SELECT updated_at FROM app_config WHERE key =
'tanga_mirror_mode')`) anchors to that config row's updated_at — which 092's
own migration SQL bumped to "now" at the moment it ran (flipping
tanga_mirror_mode to 'B'). Combined with the fact that NOTHING writes
idempotency_key='study_activity:{id}' anymore, every focus_sessions row
created after the 092 deploy has matched this job's "missing grant" query
and been paid a FULL, UNCAPPED, 1:1 xp_awarded-as-Tanga grant under the
'study_activity_reconciled' reason — which isn't in DAILY_CAPPED_REASONS —
every 15 minutes, for every user with a recent focus session. Found live
via a farming report: "Tanga for every minute of study." This is the exact
scarce/capped/achievement-based design the 092 rework existed to establish,
undone by a stale background job nobody looked at again.

There is currently no live "Tanga grant that can silently fail and needs a
retry" scenario for study sessions to reconcile against — record_study_activity()
calls check_and_award_daily_earn_events() synchronously, in the same request.
If a genuine need for a reconciliation job re-emerges (e.g. a new async grant
path), it needs a NEW job built against the CURRENT idempotency scheme
(daily_earn:{user_id}:{day}:{reason}) and DAILY_CAPPED_REASONS-aware cap
logic — not a resurrection of this one. Kept as a no-op (rather than deleted
outright) so the still-wired cron/scheduler call sites keep returning a
well-formed response instead of a 404/500 during rollout.
"""
import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def find_unreconciled_sessions(db: Session, grace_minutes: int = 5, limit: int = 500) -> list:
    """Disabled — see module docstring. Always returns no candidates."""
    return []


def reconcile_missing_study_grants(db: Session, grace_minutes: int = 5, limit: int = 500) -> dict:
    """Disabled — see module docstring. Always a no-op; never grants Tanga."""
    return {"checked": 0, "granted": 0, "failed": 0, "disabled": True}
