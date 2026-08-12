"""
freeze_service.py — shared streak-freeze eligibility + state logic.

Used by both POST /api/streaks/freeze/use (streaks.py, user-initiated) and the
POST /api/cron/streak-freeze-auto-apply cron job (cron.py, server-initiated) so
the two paths can never validate a freeze application differently — see the
step-27 postmortem referenced in streak-freeze-fix-prompt.md (P1): freezes
that only apply when a user is present and taps a button aren't insurance.

check_freeze_eligibility()/compute_streak_state() are pure — no DB access —
so they're unit-testable without a database (see tests/). apply_freeze() is
the one place that actually mutates profiles, via an atomic guarded UPDATE
(same idiom as streaks.py's purchase_freeze and cron.py's challenges_tick) —
no pg_advisory_lock needed, the WHERE clause itself is the concurrency guard:
a concurrent request and an overlapping cron tick racing for the same
user+missed_date will have exactly one of them see rowcount==1.
"""
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

MAX_CONSECUTIVE_FREEZES = 2


@dataclass
class FreezeEligibility:
    eligible: bool
    reason: Optional[str]  # None | "no_freezes" | "not_missed" | "already_frozen" | "gap_too_large" | "consecutive_cap"


def consecutive_freeze_run_ending_before(freeze_used_dates: set, missed_date: date) -> int:
    """How many consecutive days immediately before missed_date are already
    freeze-covered. 0 if missed_date-1 isn't frozen at all."""
    count = 0
    d = missed_date - timedelta(days=1)
    while d in freeze_used_dates:
        count += 1
        d -= timedelta(days=1)
    return count


def check_freeze_eligibility(
    today: date,
    last_date: Optional[date],
    freeze_count: int,
    freeze_used_dates: set,
    require_balance: bool = True,
) -> FreezeEligibility:
    """Decide whether a freeze can be applied to bridge yesterday's gap.
    Mirrors the validation streaks.py's use_freeze() used to do inline
    (not_missed / already_frozen / gap_too_large), plus the new consecutive
    cap (D) and an optional balance check (require_balance=False lets the
    at-risk cron job ask "would this be eligible if they had a freeze?").
    """
    missed_date = today - timedelta(days=1)

    if last_date is not None and last_date >= missed_date:
        return FreezeEligibility(False, "not_missed")

    if missed_date in freeze_used_dates:
        return FreezeEligibility(False, "already_frozen")

    if last_date is None or last_date < missed_date - timedelta(days=1):
        return FreezeEligibility(False, "gap_too_large")

    if consecutive_freeze_run_ending_before(freeze_used_dates, missed_date) >= MAX_CONSECUTIVE_FREEZES:
        return FreezeEligibility(False, "consecutive_cap")

    if require_balance and freeze_count <= 0:
        return FreezeEligibility(False, "no_freezes")

    return FreezeEligibility(True, None)


def compute_streak_state(
    today: date,
    last_date: Optional[date],
    freeze_used_dates: set,
    today_goal_met: bool,
) -> str:
    """active | at_risk | frozen_today | lost — see plan doc B for the table
    this implements. Deliberately independent of streaks.py's `is_active`
    boolean (kept byte-for-byte unchanged for backward compatibility) —
    only last_date is None diverges between the two, and it never matters in
    practice since every UI gates on streak_days > 0 first."""
    if last_date is None:
        return "active"
    gap = (today - last_date).days
    if gap <= 0:
        return "active"
    if gap == 1:
        if last_date in freeze_used_dates and not today_goal_met:
            return "frozen_today"
        return "active"
    if gap == 2:
        return "at_risk"
    return "lost"


def apply_freeze(db: Session, user_id: int, missed_date: date, expected_last_date: Optional[date]) -> int:
    """Atomic guarded UPDATE. Returns rowcount — 0 means someone else (a
    concurrent request or an overlapping cron tick) already handled this
    user+date; the caller must treat that as a no-op, not an error."""
    result = db.execute(
        text("""
            UPDATE profiles SET
                freeze_count      = freeze_count - 1,
                freeze_used_dates = array_append(freeze_used_dates, :missed),
                streak_last_date  = :missed
            WHERE telegram_id = :uid
              AND freeze_count > 0
              AND NOT (:missed = ANY(freeze_used_dates))
              AND streak_last_date IS NOT DISTINCT FROM :expected_last
        """),
        {"missed": missed_date, "uid": user_id, "expected_last": expected_last_date},
    )
    db.commit()
    return result.rowcount
