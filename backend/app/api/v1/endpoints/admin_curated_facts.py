"""
admin_curated_facts.py — web admin CRUD for the curated fact bank
(5-savol-quality-fixes brief, Part 4). Mounted at /api/admin/curated-facts.
Admin-only (verify_admin, reused from admin.py — same pattern as
admin_daily_quiz.py).

Originally implemented as Telegram bot commands (/addfact, /verifyfact,
/listfacts, /removefact) in the content-bot repo, mirroring that repo's
existing quote-bank pattern. Moved here on request: content-bot is a
separate, unrelated product (a news/content channel bot) that happens to
share this database — an admin managing 5 Savol content shouldn't need to
go to the news bot to do it. daily_quiz_service.py's generation pipeline
is unaffected either way; it only ever talks to the `curated_facts` table
by name, never cares which service wrote to it.

GET    /                    — list facts, filter by category/verified
POST   /                    — add a new fact (verified=false; only
                               /{id}/verify may ever flip that to true)
POST   /{fact_id}/verify    — verify a pending fact
DELETE /{fact_id}           — soft delete (active=false) — no precedent in
                               the quote bank (no /removequote exists);
                               added specifically for this brief

Same guarantee as the quote bank and as daily_quiz's own AI pipeline:
nothing here lets the AI mark its own output verified — only an admin,
through this endpoint, can.
"""
import logging
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.v1.endpoints.admin import verify_admin
from app.models.admin_models import AdminUser
from app.services import category_config

logger = logging.getLogger(__name__)
router = APIRouter()


def _curated_category_keys(db: Session) -> set[str]:
    return {c["key"] for c in category_config.get_categories(db) if c.get("curated")}


def _fact_dict(row) -> dict:
    return {
        "id": row.id, "fact_text": row.fact_text, "category": row.category, "source": row.source,
        "verified": row.verified, "active": row.active, "added_by": row.added_by,
        "verified_by": row.verified_by,
        "verified_at": row.verified_at.isoformat() if row.verified_at else None,
        "times_used": row.times_used,
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("")
async def list_facts(
    category: Optional[str] = Query(None),
    verified: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    conditions = ["active = true"]
    params: dict = {}
    if category:
        conditions.append("category = :category")
        params["category"] = category
    if verified is not None:
        conditions.append("verified = :verified")
        params["verified"] = verified

    rows = db.execute(
        text(f"""
            SELECT id, fact_text, category, source, verified, active, added_by,
                   verified_by, verified_at, times_used, last_used_at, created_at
            FROM curated_facts
            WHERE {' AND '.join(conditions)}
            ORDER BY id DESC
        """),
        params,
    ).fetchall()
    return {"facts": [_fact_dict(r) for r in rows]}


class FactCreate(BaseModel):
    fact_text: str = Field(..., min_length=1)
    category:  str = Field(..., min_length=1)
    source:    str = Field(..., min_length=1)


@router.post("")
async def create_fact(
    body: FactCreate,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    valid_categories = _curated_category_keys(db)
    if body.category not in valid_categories:
        raise HTTPException(422, f"category must be one of {sorted(valid_categories)}")

    row = db.execute(
        text("""
            INSERT INTO curated_facts (fact_text, category, source, added_by, verified)
            VALUES (:fact_text, :category, :source, :added_by, false)
            RETURNING id
        """),
        {
            "fact_text": body.fact_text, "category": body.category, "source": body.source,
            "added_by": admin.telegram_id,
        },
    ).fetchone()
    db.commit()
    return {"ok": True, "id": int(row.id)}


@router.post("/{fact_id}/verify")
async def verify_fact(
    fact_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    row = db.execute(
        text("""
            UPDATE curated_facts
            SET verified = true, verified_by = :uid, verified_at = :now
            WHERE id = :id AND verified = false AND active = true
            RETURNING id
        """),
        {"uid": admin.telegram_id, "now": datetime.now(UTC), "id": fact_id},
    ).fetchone()
    db.commit()
    if row is None:
        raise HTTPException(404, "Fact not found, already verified, or removed")
    return {"ok": True}


@router.delete("/{fact_id}")
async def remove_fact(
    fact_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Soft delete — keeps verified_by/verified_at history rather than a
    hard DELETE, consistent with this table's other audit columns."""
    row = db.execute(
        text("UPDATE curated_facts SET active = false WHERE id = :id AND active = true RETURNING id"),
        {"id": fact_id},
    ).fetchone()
    db.commit()
    if row is None:
        raise HTTPException(404, "Fact not found or already removed")
    return {"ok": True}
