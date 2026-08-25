"""
admin_ai_usage.py — Admin-readable AI usage summary (088/089 Tanga/AI,
spec Phase 1: "so the numbers can be tuned from evidence after launch").

Mounted at /api/admin/ai-usage. Admin-only (verify_admin, reused from
admin.py — same pattern as admin_reports.py).

GET / — per-feature: call count, free vs paid split, Tanga spent, API cost
         (USD), cache hit rate. Default window: last 7 days.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.v1.endpoints.admin import verify_admin
from app.models.admin_models import AdminUser

router = APIRouter()


@router.get("")
async def ai_usage_summary(
    days: int = Query(7, ge=1, le=90),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """
    Per-feature usage since NOW() - :days. `calls` counts every ai_usage_log
    row (cache hits included — cache_hit breaks that down further);
    `tanga_spent` is pulled from the ledger (tanga_transactions), not
    estimated from prices, so it reflects what actually happened including
    any mid-window price changes.
    """
    rows = db.execute(text("""
        SELECT
            feature,
            COUNT(*)                                   AS calls,
            COUNT(*) FILTER (WHERE cache_hit)           AS cache_hits,
            COUNT(*) FILTER (WHERE outcome = 'success')  AS successes,
            COUNT(*) FILTER (WHERE outcome != 'success') AS failures,
            COALESCE(SUM(cost_usd), 0)                  AS total_cost_usd,
            COALESCE(AVG(latency_ms), 0)                AS avg_latency_ms
        FROM ai_usage_log
        WHERE created_at >= NOW() - (:days || ' days')::interval
        GROUP BY feature
        ORDER BY calls DESC
    """), {"days": days}).fetchall()

    # tanga_transactions.reason uses the "ai_"-prefixed strings
    # (ai_flashcard_gen/ai_explanation/ai_tutor_session) — see
    # app/services/tanga_service.py's TangaReason for the full mapping.
    # reason = ANY(:reasons) with an explicit list, not LIKE 'ai\_%' — this
    # codebase has a documented incident from a bare '%' embedded directly
    # in raw SQL text() breaking under the pg8000 driver (study_activity.py's
    # MOD() fix); a LIKE pattern is the same footgun, avoided entirely here,
    # same as app/services/ai/limiter.py's global-ceiling query.
    tanga_rows = db.execute(text("""
        SELECT
            reason,
            COUNT(*)         AS paid_actions,
            COALESCE(SUM(-delta), 0) AS tanga_spent
        FROM tanga_transactions
        WHERE reason = ANY(:reasons)
          AND delta < 0
          AND created_at >= NOW() - (:days || ' days')::interval
        GROUP BY reason
    """), {"reasons": ["ai_flashcard_gen", "ai_explanation", "ai_tutor_session"], "days": days}).fetchall()
    tanga_by_reason = {r.reason: {"paid_actions": int(r.paid_actions), "tanga_spent": int(r.tanga_spent)} for r in tanga_rows}

    refund_rows = db.execute(text("""
        SELECT COALESCE(SUM(delta), 0) AS refunded
        FROM tanga_transactions
        WHERE reason = 'ai_refund' AND created_at >= NOW() - (:days || ' days')::interval
    """), {"days": days}).fetchone()

    feature_to_reason = {
        "flashcard_gen": "ai_flashcard_gen",
        "explanation": "ai_explanation",
        "tutor_session": "ai_tutor_session",
        "weekly_review": None,  # always free — no reason string, never in tanga_transactions
    }

    summary = []
    for r in rows:
        reason = feature_to_reason.get(r.feature, f"ai_{r.feature}")
        tanga_info = tanga_by_reason.get(reason, {"paid_actions": 0, "tanga_spent": 0})
        calls = int(r.calls)
        cache_hits = int(r.cache_hits)
        summary.append({
            "feature": r.feature,
            "calls": calls,
            "cache_hits": cache_hits,
            "cache_hit_rate": round(cache_hits / calls, 3) if calls else 0.0,
            "successes": int(r.successes),
            "failures": int(r.failures),
            "free_actions": max(0, calls - tanga_info["paid_actions"]),
            "paid_actions": tanga_info["paid_actions"],
            "tanga_spent": tanga_info["tanga_spent"],
            "api_cost_usd": round(float(r.total_cost_usd), 4),
            "avg_latency_ms": round(float(r.avg_latency_ms), 1),
        })

    return {
        "window_days": days,
        "features": summary,
        "total_tanga_refunded": int(refund_rows.refunded) if refund_rows else 0,
        "total_api_cost_usd": round(sum(f["api_cost_usd"] for f in summary), 4),
    }
