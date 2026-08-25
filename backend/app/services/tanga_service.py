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
app.services.xp_service.add_xp() (unchanged by this task) — callers that earn
XP call add_xp() and grant_tanga() as two separate, independent calls with
the same amount ("every earn increments both", spec Part 1).

spend_tanga() is the only place TANGA_MIRROR_MODE (app_config key
'tanga_mirror_mode') applies. While the flag is "A", every spend also
decrements total_xp by the same amount in the SAME guarded UPDATE, so the
shipped Play Store client — which still reads total_xp as the number that
goes down when you buy a freeze — behaves exactly as before. Once flipped to
"B", spend_tanga stops touching total_xp; it becomes a pure lifetime score
from that point forward. Historical spends predating this ledger are not
reconstructable — the current total_xp value is the accepted baseline.

Account merges (two profile rows collapsing into one) are handled directly
in app/api/v1/auth.py's merge flow, not through spend_tanga/grant_tanga —
merge moves balance between two specific rows in one transaction and doesn't
fit the single-row WHERE-guard shape these two functions assume.
"""
import logging
from dataclasses import dataclass
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
    # earn — mirrors an XpSource / study_activity source 1:1
    "welcome_bonus", "focus_timer", "flashcards", "quiz_complete",
    "course_complete", "challenge_complete", "streak_stage", "deck_milestone",
    "planner_task",
    # spend
    "freeze_purchase", "ai_explanation", "ai_flashcard_gen", "ai_tutor_session",
    # AI call failed after a deduct-first charge — see ai/limiter.py
    "ai_refund",
    # a live grant_tanga_for_xp() call failed after its focus_sessions row
    # already committed — see app/services/tanga_reconciliation.py
    "study_activity_reconciled",
]


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
) -> None:
    db.execute(
        text("""
            INSERT INTO tanga_transactions
                (user_id, delta, balance_after, reason, reference_type, reference_id, idempotency_key)
            VALUES (:uid, :delta, :bal, :reason, :rtype, :rid, :ikey)
        """),
        {
            "uid": user_id, "delta": delta, "bal": new_balance, "reason": reason,
            "rtype": reference_type,
            "rid": str(reference_id) if reference_id is not None else None,  # reference_id is TEXT — see models.py
            "ikey": idempotency_key,
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
) -> TangaResult:
    """Credit `amount` Tanga to user_id. Fails cleanly (ok=False) only if the
    profile row doesn't exist — otherwise always succeeds (no upper bound)."""
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
        _write_ledger(db, user_id, amount, new_balance, reason, reference_type, reference_id, idempotency_key)
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
