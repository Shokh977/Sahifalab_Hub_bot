"""
app/services/ai/usage.py — writes ai_usage_log (089_ai_infrastructure).
Every provider call OR cache hit gets exactly one row here (spec Part 4:
"Log every call: user, feature, model, prompt version, input tokens, output
tokens, computed cost, latency, cache hit/miss, outcome"). This is the
source of truth for unit economics and the eventual subscription pricing —
never skip it, even on a failed call.
"""
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def log_usage(
    db: Session,
    user_id: int | None,
    feature: str,
    model: str,
    prompt_version: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cost_usd: float = 0.0,
    latency_ms: int = 0,
    cache_hit: bool = False,
    outcome: str = "success",
    error_detail: str | None = None,
) -> None:
    try:
        db.execute(
            text("""
                INSERT INTO ai_usage_log
                    (user_id, feature, model, prompt_version, input_tokens, output_tokens,
                     cost_usd, latency_ms, cache_hit, outcome, error_detail)
                VALUES
                    (:uid, :feature, :model, :pv, :itok, :otok, :cost, :lat, :hit, :outcome, :err)
            """),
            {
                "uid": user_id, "feature": feature, "model": model, "pv": prompt_version,
                "itok": input_tokens, "otok": output_tokens, "cost": cost_usd, "lat": latency_ms,
                "hit": cache_hit, "outcome": outcome, "err": error_detail,
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.error(
            "Failed to write ai_usage_log row for user_id=%s feature=%s — usage/cost data lost for this call",
            user_id, feature, exc_info=True,
        )
