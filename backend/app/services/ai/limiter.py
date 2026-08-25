"""
app/services/ai/limiter.py — dual-gate access control (spec Part 5).

Tanga alone doesn't protect the API budget (long-active users can hold
large balances). Three layers, all server-side, all driven by the
'ai_dual_gate' app_config row so they're changeable without a deploy:
  1. free_daily_allowance — N free AI actions/day, no Tanga cost. Lets a
     brand-new user (zero Tanga) experience the feature.
  2. tanga cost — beyond the free allowance, each action costs Tanga.
  3. hard_daily_cap — per-user daily ceiling regardless of balance. This,
     not the price, is the actual cost control.
Plus a global_daily_ceiling_tanga circuit breaker across all users.

check_and_charge() is deduct-first: it reserves the daily-usage slot and (if
past the free allowance) spends Tanga BEFORE the caller makes the AI call —
this is what prevents concurrent-request abuse (spec Part 5). If the AI call
then fails, the caller MUST call refund() with the same feature/action_id so
the user is never charged for a failed call.

Known limitation: free_daily_allowance itself (unlike hard_daily_cap) is
enforced via a read-then-guarded-write, not a single atomic condition, so a
rare race between two simultaneous requests from the same user could let in
one extra free action before hard_daily_cap or the Tanga charge kicks in.
Acceptable because the spec is explicit that hard_daily_cap, not the free
allowance, is the actual cost boundary — see the module docstring above.
"""
import logging
from dataclasses import dataclass
from datetime import date, datetime, UTC
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.config_service import get_config
from app.services.tanga_service import spend_tanga, grant_tanga, TangaResult

logger = logging.getLogger(__name__)

_DEFAULT_GATE = {
    "free_daily_allowance": 3,
    "hard_daily_cap": 20,
    "global_daily_ceiling_tanga": 200000,
    "prices": {},
}

_AI_SPEND_REASONS = ("ai_explanation", "ai_flashcard_gen", "ai_tutor_session")

_FEATURE_TO_REASON = {
    "flashcard_gen":  "ai_flashcard_gen",
    "explanation":    "ai_explanation",
    "tutor_session":  "ai_tutor_session",
}


@dataclass
class GateResult:
    allowed: bool
    charged_tanga: bool
    tanga_spent: int
    idempotency_key: str
    reason: Optional[str] = None  # set when allowed=False: 'daily_cap_reached' | 'insufficient_balance' | 'global_ceiling_reached'
    free_remaining: int = 0


def validate_price_config(prices: dict) -> list[str]:
    """
    Boot-time guard (called from app.main's startup_event, not at request
    time) against the exact bug class that has now bitten this config
    twice silently: a `prices` dict whose keys don't match the `feature`
    strings actually passed to check_and_charge() resolves every lookup to
    the 0 default — every priced AI action becomes free, with no error,
    nothing in the logs, nothing failing any test that doesn't specifically
    assert the price is nonzero.

    Checks BOTH directions against _FEATURE_TO_REASON (the single source of
    truth for what a "real action" is):
      - a `prices` key with no matching feature (e.g. the old
        'ai_flashcard_gen' vs the correct 'flashcard_gen' — a reason string
        leaking into a feature-keyed dict)
      - a known chargeable feature with NO price key at all (silently
        free by omission, indistinguishable from "explicitly priced at 0"
        once read through .get(feature, 0) — so presence, not just value,
        must be checked)

    Returns a list of human-readable problems; empty means the config is
    valid. Does not raise itself — the caller decides how hard to fail.
    """
    known = set(_FEATURE_TO_REASON.keys())
    configured = set(prices.keys())
    unknown = configured - known
    missing = known - configured

    errors = []
    if unknown:
        errors.append(
            f"ai_dual_gate.prices has key(s) with no matching feature: {sorted(unknown)} "
            f"(known features: {sorted(known)})"
        )
    if missing:
        errors.append(
            f"ai_dual_gate.prices is missing key(s) for known chargeable features: {sorted(missing)} "
            "— these would silently resolve to price 0 via .get(feature, 0)"
        )
    return errors


def _gate_config(db: Session) -> dict:
    cfg = get_config(db, "ai_dual_gate", default=_DEFAULT_GATE)
    merged = {**_DEFAULT_GATE, **(cfg or {})}
    merged["prices"] = {**_DEFAULT_GATE["prices"], **(cfg or {}).get("prices", {})}
    return merged


def _today() -> date:
    return datetime.now(UTC).date()


def check_and_charge(db: Session, user_id: int, feature: str, action_id: str) -> GateResult:
    """action_id: a caller-supplied string unique to this one AI action
    attempt (e.g. a client-generated request id) — folded into the
    idempotency_key so a retried request never double-charges or
    double-counts the daily cap."""
    gate = _gate_config(db)
    free_allowance = int(gate["free_daily_allowance"])
    hard_cap = int(gate["hard_daily_cap"])
    global_ceiling = int(gate["global_daily_ceiling_tanga"])
    price = int(gate["prices"].get(feature, 0))

    idempotency_key = f"ai:{feature}:{user_id}:{action_id}"
    today = _today()

    # Global daily spend ceiling (spec Part 5) — reason IN (...) rather than
    # a LIKE '%' pattern: this codebase has a documented incident where a
    # bare '%' embedded directly in raw SQL text() broke under the pg8000
    # driver (see study_activity.py's MOD() comment) — a LIKE pattern is the
    # same footgun, so it's avoided entirely here, not just bound safely.
    global_row = db.execute(
        text("""
            SELECT COALESCE(SUM(-delta), 0) AS spent
            FROM tanga_transactions
            WHERE reason = ANY(:reasons) AND delta < 0 AND created_at >= :day_start
        """),
        {"reasons": list(_AI_SPEND_REASONS), "day_start": today},
    ).fetchone()
    if global_row and int(global_row.spent) >= global_ceiling:
        return GateResult(allowed=False, charged_tanga=False, tanga_spent=0,
                           idempotency_key=idempotency_key, reason="global_ceiling_reached")

    db.execute(
        text("""
            INSERT INTO ai_daily_usage (user_id, usage_date, free_used, paid_used)
            VALUES (:uid, :day, 0, 0)
            ON CONFLICT (user_id, usage_date) DO NOTHING
        """),
        {"uid": user_id, "day": today},
    )
    db.commit()

    usage_row = db.execute(
        text("SELECT free_used, paid_used FROM ai_daily_usage WHERE user_id = :uid AND usage_date = :day"),
        {"uid": user_id, "day": today},
    ).fetchone()
    used_today = (int(usage_row.free_used) + int(usage_row.paid_used)) if usage_row else 0
    if used_today >= hard_cap:
        return GateResult(allowed=False, charged_tanga=False, tanga_spent=0,
                           idempotency_key=idempotency_key, reason="daily_cap_reached")

    use_free = (int(usage_row.free_used) if usage_row else 0) < free_allowance

    if use_free:
        result = db.execute(
            text("""
                UPDATE ai_daily_usage SET free_used = free_used + 1
                WHERE user_id = :uid AND usage_date = :day AND free_used + paid_used < :cap
                RETURNING free_used
            """),
            {"uid": user_id, "day": today, "cap": hard_cap},
        ).fetchone()
        if result is None:
            db.rollback()
            return GateResult(allowed=False, charged_tanga=False, tanga_spent=0,
                               idempotency_key=idempotency_key, reason="daily_cap_reached")
        db.commit()
        return GateResult(allowed=True, charged_tanga=False, tanga_spent=0,
                           idempotency_key=idempotency_key,
                           free_remaining=max(0, free_allowance - int(result.free_used)))

    # Past the free allowance — deduct Tanga FIRST (spec Part 5: "Deduct
    # atomically first — prevents concurrent-request abuse"), then increment
    # paid_used in a second guarded UPDATE.
    spend_result: TangaResult
    if price <= 0:
        spend_result = TangaResult(ok=True, balance=0, delta=0)
    else:
        spend_result = spend_tanga(
            db, user_id=user_id, amount=price, reason=_FEATURE_TO_REASON.get(feature, "ai_explanation"),
            reference_type="ai_action", reference_id=action_id,
            idempotency_key=idempotency_key,
        )
        if not spend_result.ok:
            return GateResult(allowed=False, charged_tanga=False, tanga_spent=0,
                               idempotency_key=idempotency_key, reason="insufficient_balance")

    result = db.execute(
        text("""
            UPDATE ai_daily_usage SET paid_used = paid_used + 1
            WHERE user_id = :uid AND usage_date = :day AND free_used + paid_used < :cap
            RETURNING paid_used
        """),
        {"uid": user_id, "day": today, "cap": hard_cap},
    ).fetchone()
    if result is None:
        # Raced past the cap between the Tanga spend above and this UPDATE —
        # refund immediately rather than let a charged-but-capped call stand.
        db.rollback()
        if price > 0:
            grant_tanga(
                db, user_id=user_id, amount=price, reason="ai_refund",
                reference_type="ai_action", reference_id=action_id,
                idempotency_key=f"{idempotency_key}:cap_refund",
            )
        return GateResult(allowed=False, charged_tanga=False, tanga_spent=0,
                           idempotency_key=idempotency_key, reason="daily_cap_reached")
    db.commit()

    return GateResult(allowed=True, charged_tanga=price > 0, tanga_spent=price,
                       idempotency_key=idempotency_key, free_remaining=0)


def refund(db: Session, user_id: int, feature: str, action_id: str, tanga_spent: int) -> None:
    """Call when an AI call that was already charged by check_and_charge()
    fails or times out (spec Part 5: 'a user must never be charged for a
    failed call'). No-op if the action was free (tanga_spent==0)."""
    if tanga_spent <= 0:
        return
    grant_tanga(
        db, user_id=user_id, amount=tanga_spent, reason="ai_refund",
        reference_type="ai_action", reference_id=action_id,
        idempotency_key=f"ai:{feature}:{user_id}:{action_id}:refund",
    )
