"""
rewards.py — tanga-economy-rework Part 5: reward modal queue.

"Every Tanga reward must surface in a modal. Nothing is awarded silently."
The client never computes a reward — it only ever displays what this module
returns. Reuses the existing tanga_transactions ledger (celebrate/
notified_at columns, migration 092) rather than a new table.

GET  /api/rewards/pending     — unnotified celebrate=TRUE ledger rows for
                                 the caller, oldest first (so a modal listing
                                 multiple rewards reads in the order they
                                 actually happened).
POST /api/rewards/acknowledge — marks a set of reward ids notified.
                                 Idempotent: re-submitting the same ids (a
                                 retry after a dropped response, or a crash
                                 mid-display) is a no-op the second time.
"""
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token

router = APIRouter()

# Defensive cap — a user should never realistically have more than a
# handful of unacknowledged rewards queued at once; this just bounds a
# pathological case (e.g. a client that stopped acknowledging for months)
# from returning an unbounded row set.
MAX_PENDING = 20


async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    if not authorization:
        raise HTTPException(401, "Avtorizatsiya talab qilinadi")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(401, "Noto'g'ri avtorizatsiya")
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(401, "Token muddati tugagan")
    return tid


@router.get("/pending")
async def get_pending_rewards(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    rows = db.execute(
        text("""
            SELECT id, delta, balance_after, reason, reference_type, reference_id, created_at
            FROM tanga_transactions
            WHERE user_id = :uid AND celebrate = TRUE AND notified_at IS NULL
            ORDER BY created_at ASC
            LIMIT :limit
        """),
        {"uid": caller_id, "limit": MAX_PENDING},
    ).fetchall()

    return {
        "rewards": [
            {
                "id": r.id,
                "amount": int(r.delta),
                "balance_after": int(r.balance_after),
                "reason": r.reason,
                "reference_type": r.reference_type,
                "reference_id": r.reference_id,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ],
    }


class AcknowledgeRequest(BaseModel):
    ids: list[int] = Field(..., min_length=1, max_length=MAX_PENDING)


@router.post("/acknowledge")
async def acknowledge_rewards(
    body: AcknowledgeRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    db.execute(
        text("""
            UPDATE tanga_transactions
            SET notified_at = NOW()
            WHERE user_id = :uid AND id = ANY(:ids) AND notified_at IS NULL
        """),
        {"uid": caller_id, "ids": body.ids},
    )
    db.commit()
    return {"ok": True}
