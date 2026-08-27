"""
tanga_service.py — spend_tanga() / grant_tanga(): the single choke point for
every profiles.tanga_balance mutation (088_tanga_currency).

Both functions:
  - Mutate tanga_balance with a single atomic UPDATE guarded by the balance
    condition in the WHERE clause — the same lock-free idiom the pre-existing
    freeze/purchase UPDATE in streaks.py already used (see PREREQUISITES/
    "generalise it, don't rewrite it"). No read-then-write races.
  - Write the tanga_transactions ledger row in the SAME transaction as the
    balance UPDATE (same db.execute/db.commit pair) — balance and ledger can
    never diverge.
  - Are idempotent on `idempotency_key`: a repeated call with the same key
    returns the original result without re-applying the delta. Required for
    client retries over an unreliable mobile network.

grant_tanga() never touches total_xp. total_xp is owned exclusively by
app.services.xp_service.add_xp() (unchanged by this task).

── tanga-economy-rework (092) ────────────────────────────────────────────────
Tanga is no longer a 1:1 XP mirror — it is granted ONLY by the specific
events in the spec's Part 1 ("scarce, achievement-based currency"):
  - Daily-capped, recurring: daily_goal_met / threshold_60min /
    threshold_120min (see study_activity.py) + daily_quiz (see
    daily_quiz_service.py) — all keyed to the SAME per-user daily_cap via
    remaining_daily_cap()/daily_capped_grant() below, bucketed by
    tanga_transactions.earn_date (the user's LOCAL day, not created_at/UTC).
  - Flat, one-off, exempt from the cap: streak-stage milestones
    (stage_service.py, once per user ever via user_stage_completions),
    challenge_complete (challenge_service.py), opening_balance (migration 092
    + auth.py's welcome path for new signups).
grant_tanga_for_xp() (the old 1:1-mirror wrapper) is no longer called by any
production code path as of 092 — every former call site either stopped
granting Tanga entirely (course_complete/quiz_complete/deck_milestone/
planner_task/the generic xp.py endpoint — none of these are in the new
earning table) or was rewired to a flat/capped amount instead. Left defined
(not deleted) because it still has direct unit-test coverage of the
transaction-boundary guarantee ("a gamification side-effect must never roll
back the study record") that is otherwise only proven indirectly now.

spend_tanga() is the only place TANGA_MIRROR_MODE (app_config key
'tanga_mirror_mode') applies, and migration 092 flips it to "B" permanently
— superseded by the version gate in app/services/client_version.py, which
now decides old-vs-new client behaviour explicitly per request (streaks.py's
purchase_freeze()) instead of this blanket flag. Kept only so a spend_tanga()
call from before 092 in a hot process doesn't behave differently mid-deploy.

Account merges (two profile rows collapsing into one) are handled directly
in app/api/v1/auth.py's merge flow, not through spend_tanga/grant_tanga —
merge moves balance between two specific rows in one transaction and doesn't
fit the single-row WHERE-guard shape these two functions assume.
"""
import logging
from dataclasses import dataclass
from datetime import date as Date
from typing import Literal, Optional, Union

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.services.config_service import get_config

logger = logging.getLogger(__name__)

ReferenceId = Union[int, str, None]

# Every reason a tanga_transactions row can carry. Adding one is a code
# review, not a migration — see 088_tanga_currency.sql for why `reason` is
# plain TEXT rather than a DB CHECK-constrained enum.
TangaReason = Literal[
    # earn — daily-capped, recurring (tanga-economy-rework Part 1)
    "daily_goal_met", "threshold_60min", "threshold_120min",
    # earn — flat, one-off, exempt from the daily cap
    "welcome_bonus", "opening_balance", "streak_stage", "challenge_complete",
    "competition_win",
    # earn — legacy XP-mirror reasons. No longer GRANTED by any code path
    # after 092 (see module docstring) — kept in this Literal only because
    # historical tanga_transactions rows already carry them and nothing
    # should have to special-case reading those back.
    "focus_timer", "flashcards", "quiz_complete", "course_complete",
    "deck_milestone", "planner_task",
    # spend
    "freeze_purchase", "ai_explanation", "ai_flashcard_gen", "ai_tutor_session",
    # AI call failed after a deduct-first charge — see ai/limiter.py
    "ai_refund",
    # a live grant_tanga_for_xp() call failed after its focus_sessions row
    # already committed — see app/services/tanga_reconciliation.py. Dormant
    # after 092 (nothing calls grant_tanga_for_xp() with reason="focus_timer"/
    # "flashcards" anymore) but left wired in case any pre-092 session is
    # still unreconciled at deploy time.
    "study_activity_reconciled",
    # "5 Savol" daily quiz (090_daily_quiz) — Tanga only, NEVER XP (spec:
    # XP represents minutes studied; a 60-second quiz must not compete with
    # actual studying for level/leaderboard integrity). Distinct from
    # "quiz_complete" above, which is the pre-existing lesson-quiz reason.
    "daily_quiz", "daily_quiz_void_refund",
]

# Reasons subject to the shared daily_cap (tanga-economy-rework Part 1) —
# the ONLY thing that decides which grants count against the cap; nothing
# else reads tanga_transactions.earn_date being non-NULL to mean this.
DAILY_CAPPED_REASONS: frozenset[str] = frozenset({
    "daily_goal_met", "threshold_60min", "threshold_120min", "daily_quiz",
})


@dataclass
class TangaResult:
    ok: bool
    balance: int
    delta: int
    idempotent_replay: bool = False
    error: Optional[str] = None  # "insufficient_balance" | "profile_not_found"


def _existing_transaction(db: Session, idempotency_key: str) -> Optional[TangaResult]:
    row = db.execute(
        text("SELECT delta, balance_after FROM tanga_transactions WHERE idempotency_key = :k"),
        {"k": idempotency_key},
    ).fetchone()
    if row is None:
        return None
    return TangaResult(ok=True, balance=int(row.balance_after), delta=int(row.delta), idempotent_replay=True)


def _write_ledger(
    db: Session,
    user_id: int,
    delta: int,
    new_balance: int,
    reason: str,
    reference_type: Optional[str],
    reference_id: ReferenceId,
    idempotency_key: Optional[str],
    celebrate: bool = False,
    earn_date: Optional[Date] = None,
) -> None:
    db.execute(
        text("""
            INSERT INTO tanga_transactions
                (user_id, delta, balance_after, reason, reference_type, reference_id, idempotency_key, celebrate, earn_date)
            VALUES (:uid, :delta, :bal, :reason, :rtype, :rid, :ikey, :celebrate, :earn_date)
        """),
        {
            "uid": user_id, "delta": delta, "bal": new_balance, "reason": reason,
            "rtype": reference_type,
            "rid": str(reference_id) if reference_id is not None else None,  # reference_id is TEXT — see models.py
            "ikey": idempotency_key, "celebrate": celebrate, "earn_date": earn_date,
        },
    )


def grant_tanga_for_xp(
    db: Session,
    user_id: int,
    xp_result: dict,
    reason: TangaReason,
    reference_id: ReferenceId = None,
    reference_type: str = "xp_award",
    idempotency_key: Optional[str] = None,
) -> Optional["TangaResult"]:
    """
    Convenience wrapper for the common "every XP-earning event grants equal
    Tanga" rule (spec Part 1). Grants exactly xp_result["xp_added"] — the
    amount add_xp() ACTUALLY awarded, not the amount requested, since QUIZ's
    daily cap and COURSE's one-time dedup can make those differ (xp_added==0
    in that case, and this is a no-op).

    Swallows and logs its own failures rather than raising: every add_xp()
    call site in this codebase already treats XP-adjacent side effects
    (badges, notifications, stage checks) as best-effort/non-fatal to the
    primary response, and a Tanga grant failure here follows the same rule —
    it must never turn a successful XP award into a failed request.
    """
    xp_added = int(xp_result.get("xp_added", 0) or 0)
    if xp_added <= 0:
        return None
    try:
        return grant_tanga(
            db, user_id=user_id, amount=xp_added, reason=reason,
            reference_type=reference_type, reference_id=reference_id,
            idempotency_key=idempotency_key,
        )
    except Exception:
        logger.error(
            "Tanga grant failed for user_id=%s amount=%s reason=%s reference_id=%s",
            user_id, xp_added, reason, reference_id, exc_info=True,
        )
        return None


def grant_tanga(
    db: Session,
    user_id: int,
    amount: int,
    reason: TangaReason,
    reference_type: Optional[str] = None,
    reference_id: ReferenceId = None,
    idempotency_key: Optional[str] = None,
    celebrate: bool = True,
    earn_date: Optional[Date] = None,
) -> TangaResult:
    """Credit `amount` Tanga to user_id. Fails cleanly (ok=False) only if the
    profile row doesn't exist — otherwise always succeeds (no upper bound).

    celebrate=True by default (every earn should surface a reward modal —
    spec Part 5); refund-style grants (ai_refund, daily_quiz_void_refund) pass
    celebrate=False explicitly since reversing a charge isn't a reward.
    earn_date is set only by daily_capped_grant() below — every other caller
    leaves it NULL, which is correct: only the 4 daily-capped reasons are
    ever subject to the cap."""
    if amount <= 0:
        raise ValueError(f"grant_tanga amount must be positive, got {amount!r}")

    if idempotency_key:
        existing = _existing_transaction(db, idempotency_key)
        if existing is not None:
            return existing

    try:
        row = db.execute(
            text("""
                UPDATE profiles
                SET tanga_balance = tanga_balance + :amount
                WHERE telegram_id = :uid
                RETURNING tanga_balance
            """),
            {"amount": amount, "uid": user_id},
        ).fetchone()
        if row is None:
            db.rollback()
            return TangaResult(ok=False, balance=0, delta=0, error="profile_not_found")

        new_balance = int(row.tanga_balance)
        _write_ledger(
            db, user_id, amount, new_balance, reason, reference_type, reference_id, idempotency_key,
            celebrate=celebrate, earn_date=earn_date,
        )
        db.commit()
        return TangaResult(ok=True, balance=new_balance, delta=amount)

    except IntegrityError:
        # Raced with another request carrying the same idempotency_key — the
        # UNIQUE constraint caught it. Roll back this attempt's (uncommitted)
        # balance UPDATE and return the winner's already-committed result.
        db.rollback()
        if idempotency_key:
            existing = _existing_transaction(db, idempotency_key)
            if existing is not None:
                return existing
        raise


def remaining_daily_cap(db: Session, user_id: int, today: Date) -> int:
    """How much of today's shared daily_cap (tanga-economy-rework Part 1) this
    user has left, across ALL of DAILY_CAPPED_REASONS combined — not per
    reason. Bucketed by earn_date (the user's LOCAL day), never created_at,
    so this is correct across a UTC-day boundary regardless of timezone."""
    cap = int((get_config(db, "tanga_earning", default={}) or {}).get("daily_cap", 35))
    earned = db.execute(
        text("""
            SELECT COALESCE(SUM(delta), 0) AS s FROM tanga_transactions
            WHERE user_id = :uid AND earn_date = :today AND reason = ANY(:reasons)
        """),
        {"uid": user_id, "today": today, "reasons": list(DAILY_CAPPED_REASONS)},
    ).fetchone()
    return max(0, cap - int(earned.s if earned else 0))


def daily_capped_grant(
    db: Session,
    user_id: int,
    amount: int,
    reason: TangaReason,
    today: Date,
    reference_type: Optional[str] = None,
    reference_id: ReferenceId = None,
    idempotency_key: Optional[str] = None,
    celebrate: bool = True,
) -> Optional[TangaResult]:
    """grant_tanga(), but only if `amount` fits inside what's left of today's
    shared daily_cap — enforced HERE, server-side, at grant time (spec Part
    1/3), not just incidentally true because the current event amounts happen
    to sum under the cap. Returns None (no-op, no ledger row) if the cap is
    already exhausted; the caller's event is simply not paid out today rather
    than partially credited. `reason` MUST be one of DAILY_CAPPED_REASONS —
    this is not meant for the flat/exempt milestone grants."""
    if reason not in DAILY_CAPPED_REASONS:
        raise ValueError(f"daily_capped_grant reason must be one of {sorted(DAILY_CAPPED_REASONS)}, got {reason!r}")
    if idempotency_key:
        existing = _existing_transaction(db, idempotency_key)
        if existing is not None:
            return existing
    if remaining_daily_cap(db, user_id, today) < amount:
        logger.info(
            "Tanga daily cap reached — skipping grant user_id=%s reason=%s amount=%s today=%s",
            user_id, reason, amount, today,
        )
        return None
    return grant_tanga(
        db, user_id=user_id, amount=amount, reason=reason,
        reference_type=reference_type, reference_id=reference_id,
        idempotency_key=idempotency_key, celebrate=celebrate, earn_date=today,
    )


def check_and_award_daily_earn_events(
    db: Session, user_id: int, today: Date, today_minutes: int, goal_met: bool,
) -> list[dict]:
    """Daily-capped, recurring Tanga (tanga-economy-rework Part 1): daily goal
    met, 60-minute threshold, 120-minute threshold. Called from
    study_activity.record_study_activity(), in the caller's transaction —
    each grant is its own atomic UPDATE+INSERT via daily_capped_grant, so a
    failure here can never block or roll back the study record already
    written above it in the same function.

    Idempotent per (user, day, event) via idempotency_key — NOT by detecting
    "just crossed the threshold". record_study_activity() can run many times
    a day as small sessions accumulate, so today_minutes >= threshold is
    simply re-checked on every call; grant_tanga's own idempotency check
    makes every call after the first a no-op. A user who studies 130 minutes
    in one sitting therefore gets goal_met + threshold_60min +
    threshold_120min all in the same call, exactly as three shorter sessions
    crossing those lines one at a time would.
    """
    cfg = get_config(db, "tanga_earning", default={}) or {}
    awarded: list[dict] = []

    # celebrate=False on daily_goal_met: this exact moment already has its
    # own dedicated celebration client-side (GoalCompleteModal, shown by
    # study.tsx off the SAME goal_met transition) — queuing it in the
    # generic reward-modal system too would pop a second, redundant modal.
    # threshold_60min/threshold_120min/daily_quiz/etc. have no such
    # pre-existing UI, so they keep celebrate's default of True.
    candidates: list[tuple[str, int, bool]] = []
    if goal_met:
        candidates.append(("daily_goal_met", int(cfg.get("daily_goal_met", 10)), False))
    if today_minutes >= 60:
        candidates.append(("threshold_60min", int(cfg.get("threshold_60min", 5)), True))
    if today_minutes >= 120:
        candidates.append(("threshold_120min", int(cfg.get("threshold_120min", 5)), True))

    for reason, amount, celebrate in candidates:
        if amount <= 0:
            continue
        result = daily_capped_grant(
            db, user_id=user_id, amount=amount, reason=reason, today=today,
            reference_type="daily_earn", celebrate=celebrate,
            idempotency_key=f"daily_earn:{user_id}:{today}:{reason}",
        )
        if result is not None and result.ok and not result.idempotent_replay:
            awarded.append({"reason": reason, "amount": amount, "balance": result.balance})
    return awarded


def spend_tanga(
    db: Session,
    user_id: int,
    amount: int,
    reason: TangaReason,
    reference_type: Optional[str] = None,
    reference_id: ReferenceId = None,
    idempotency_key: Optional[str] = None,
    extra_set_sql: Optional[str] = None,
    extra_guard_sql: Optional[str] = None,
    extra_params: Optional[dict] = None,
) -> TangaResult:
    """
    Debit `amount` Tanga from user_id. The balance-sufficiency check lives in
    the UPDATE's WHERE clause, not a prior SELECT — two concurrent spends can
    never both succeed against a balance that only covers one of them.
    rowcount==0 (row is None) means the guard failed; the caller must treat
    that as a clean failure, never a partial state.

    extra_set_sql / extra_guard_sql / extra_params let a caller fold ONE more
    atomic condition into the SAME UPDATE statement — e.g. freeze/purchase
    needs "freeze_count + n <= cap" checked in lockstep with the balance, not
    as a separate statement (which would reopen the race this function
    exists to close). These are always literal SQL fragments written by our
    own code, never derived from user input.
    """
    if amount <= 0:
        raise ValueError(f"spend_tanga amount must be positive, got {amount!r}")

    if idempotency_key:
        existing = _existing_transaction(db, idempotency_key)
        if existing is not None:
            return existing

    mirror_phase = get_config(db, "tanga_mirror_mode", default="A")
    mirror_a = mirror_phase == "A"

    set_clauses = ["tanga_balance = tanga_balance - :amount"]
    guard_clauses = ["tanga_balance >= :amount"]
    if mirror_a:
        set_clauses.append("total_xp = total_xp - :amount")
        guard_clauses.append("total_xp >= :amount")
    if extra_set_sql:
        set_clauses.append(extra_set_sql)
    if extra_guard_sql:
        guard_clauses.append(extra_guard_sql)

    sql = f"""
        UPDATE profiles
        SET {', '.join(set_clauses)}
        WHERE telegram_id = :uid
          AND {' AND '.join(guard_clauses)}
        RETURNING tanga_balance
    """
    params = {"amount": amount, "uid": user_id, **(extra_params or {})}

    try:
        row = db.execute(text(sql), params).fetchone()
        if row is None:
            db.rollback()
            return TangaResult(ok=False, balance=0, delta=0, error="insufficient_balance")

        new_balance = int(row.tanga_balance)
        _write_ledger(db, user_id, -amount, new_balance, reason, reference_type, reference_id, idempotency_key)
        db.commit()
        return TangaResult(ok=True, balance=new_balance, delta=-amount)

    except IntegrityError:
        db.rollback()
        if idempotency_key:
            existing = _existing_transaction(db, idempotency_key)
            if existing is not None:
                return existing
        raise
