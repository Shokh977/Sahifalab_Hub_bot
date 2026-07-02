"""
admin_decks.py — Admin moderation for the public flashcard deck library (step-14, Part 7).

Mounted at /api/admin/decks. Admin-only (verify_admin, reused from admin.py).

GET   /reports                — decks with pending reports, sorted by report count
GET   /pending-review          — decks auto-flagged by the content-safety check on publish
GET   /{deck_id}                — full deck detail: all cards + all reports
POST  /{deck_id}/approve        — dismiss reports, restore to library
POST  /{deck_id}/remove         — hide permanently, set removed_reason
POST  /{deck_id}/ban-creator    — set can_publish=false on the deck's owner
POST  /official                 — create an admin-owned official deck
PATCH /{deck_id}/verify         — mark a deck's content as accuracy-checked
PATCH /{deck_id}/badge          — set badge_type (official requires is_verified=true first)
PATCH /{deck_id}/featured       — toggle the featured row
"""

from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.v1.endpoints.admin import verify_admin
from app.models.admin_models import AdminUser, DeckAuditLog

router = APIRouter()

_CATEGORIES = {"english", "ielts", "business", "arabic", "programming", "medical", "other"}
_BADGE_TYPES = {"none", "official", "verified_creator"}


def _log(db: Session, action: str, deck_id: Optional[int], admin: AdminUser, details: dict) -> None:
    db.add(DeckAuditLog(
        deck_id=deck_id,
        action=action,
        admin_telegram_id=admin.telegram_id,
        details=details,
    ))


def _deck_summary(r) -> dict:
    return {
        "id":                int(r.id),
        "title":             r.title,
        "category":          r.category,
        "badge_type":        r.badge_type or "none",
        "is_verified":       bool(r.is_verified),
        "is_featured":       bool(r.is_featured),
        "is_public":         bool(r.is_public),
        "moderation_status": r.moderation_status,
        "creator": {
            "id":   int(r.creator_id) if r.creator_id is not None else None,
            "name": r.creator_name or "",
        } if r.creator_id is not None else None,
    }


# ── Reports queue ──────────────────────────────────────────────────────────────

@router.get("/reports")
async def list_reported_decks(
    page:  int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    offset = (page - 1) * limit
    rows = db.execute(
        text("""
            SELECT d.id, d.title, d.category, d.badge_type, d.is_verified, d.is_featured,
                   d.is_public, d.moderation_status,
                   p.telegram_id AS creator_id, p.first_name AS creator_name,
                   COUNT(rep.id) AS report_count
            FROM flashcard_decks d
            JOIN deck_reports rep ON rep.deck_id = d.id AND rep.status = 'pending'
            LEFT JOIN profiles p ON p.telegram_id = d.user_id
            WHERE d.moderation_status = 'pending_review' AND d.is_public = TRUE
            GROUP BY d.id, p.telegram_id, p.first_name
            ORDER BY COUNT(rep.id) DESC, MAX(rep.created_at) DESC
            LIMIT :limit OFFSET :offset
        """),
        {"limit": limit, "offset": offset},
    ).fetchall()

    if not rows:
        return {"decks": [], "total": 0, "page": page, "limit": limit}

    deck_ids = [int(r.id) for r in rows]
    id_list  = ",".join(str(i) for i in deck_ids)

    # Fetch all reasons for the page's decks in one query
    reason_rows = db.execute(
        text(f"""
            SELECT deck_id, reason, COUNT(*) AS cnt FROM deck_reports
            WHERE deck_id IN ({id_list}) AND status = 'pending'
            GROUP BY deck_id, reason ORDER BY cnt DESC
        """),
    ).fetchall()

    from collections import defaultdict
    reasons_by_deck: dict = defaultdict(list)
    for rr in reason_rows:
        reasons_by_deck[int(rr.deck_id)].append({"reason": rr.reason, "count": int(rr.cnt)})

    items = []
    for r in rows:
        item = _deck_summary(r)
        item["report_count"] = int(r.report_count)
        item["reasons"] = reasons_by_deck[int(r.id)]
        items.append(item)

    total = db.execute(
        text("""
            SELECT COUNT(DISTINCT d.id) FROM flashcard_decks d
            JOIN deck_reports rep ON rep.deck_id = d.id AND rep.status = 'pending'
            WHERE d.moderation_status = 'pending_review' AND d.is_public = TRUE
        """),
    ).scalar()

    return {"decks": items, "total": int(total or 0), "page": page, "limit": limit}


# ── Pending review (content-safety auto-flags) ──────────────────────────────────

@router.get("/pending-review")
async def list_pending_review_decks(
    page:  int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    offset = (page - 1) * limit
    rows = db.execute(
        text("""
            SELECT d.id, d.title, d.category, d.badge_type, d.is_verified, d.is_featured,
                   d.is_public, d.moderation_status, d.updated_at,
                   p.telegram_id AS creator_id, p.first_name AS creator_name
            FROM flashcard_decks d
            LEFT JOIN profiles p ON p.telegram_id = d.user_id
            WHERE d.moderation_status = 'pending_review' AND d.is_public = FALSE
            ORDER BY d.updated_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"limit": limit, "offset": offset},
    ).fetchall()

    items = []
    for r in rows:
        item = _deck_summary(r)
        item["flagged_at"] = r.updated_at.isoformat() if r.updated_at else None
        items.append(item)

    total = db.execute(
        text("SELECT COUNT(*) FROM flashcard_decks WHERE moderation_status = 'pending_review' AND is_public = FALSE"),
    ).scalar()

    return {"decks": items, "total": int(total or 0), "page": page, "limit": limit}


# ── Approved decks (browse/search for the featured-toggle UI) ──────────────────

@router.get("/approved")
async def list_approved_decks(
    search: Optional[str] = Query(None),
    page:   int = Query(1, ge=1),
    limit:  int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    offset  = (page - 1) * limit
    filters = ["d.moderation_status = 'approved'", "d.is_public = TRUE"]
    params: dict = {"limit": limit, "offset": offset}
    if search:
        filters.append("d.title ILIKE :search")
        params["search"] = f"%{search}%"
    where = " AND ".join(filters)

    rows = db.execute(
        text(f"""
            SELECT d.id, d.title, d.category, d.badge_type, d.is_verified, d.is_featured,
                   d.is_public, d.moderation_status,
                   p.telegram_id AS creator_id, p.first_name AS creator_name
            FROM flashcard_decks d
            LEFT JOIN profiles p ON p.telegram_id = d.user_id
            WHERE {where}
            ORDER BY d.is_featured DESC, d.clone_count DESC
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).fetchall()

    total = db.execute(
        text(f"SELECT COUNT(*) FROM flashcard_decks d WHERE {where}"),
        {k: v for k, v in params.items() if k not in ("limit", "offset")},
    ).scalar()

    return {"decks": [_deck_summary(r) for r in rows], "total": int(total or 0), "page": page, "limit": limit}


# ── Deck detail (full content + reports) ────────────────────────────────────────

@router.get("/{deck_id}")
async def get_deck_for_review(
    deck_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    row = db.execute(
        text("""
            SELECT d.*, p.telegram_id AS creator_id, p.first_name AS creator_name, p.can_publish AS creator_can_publish
            FROM flashcard_decks d
            LEFT JOIN profiles p ON p.telegram_id = d.user_id
            WHERE d.id = :id
        """),
        {"id": deck_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Deck not found")

    cards = db.execute(
        text("SELECT id, front_text, back_text, position FROM flashcards WHERE deck_id = :id ORDER BY position, created_at"),
        {"id": deck_id},
    ).fetchall()

    reports = db.execute(
        text("""
            SELECT rep.id, rep.reason, rep.details, rep.status, rep.created_at,
                   p.telegram_id AS reporter_id, p.first_name AS reporter_name
            FROM deck_reports rep
            LEFT JOIN profiles p ON p.telegram_id = rep.reported_by
            WHERE rep.deck_id = :id
            ORDER BY rep.created_at DESC
        """),
        {"id": deck_id},
    ).fetchall()

    return {
        "id":                 int(row.id),
        "title":              row.title,
        "description":        row.description,
        "category":           row.category,
        "badge_type":         row.badge_type or "none",
        "is_verified":        bool(row.is_verified),
        "is_featured":        bool(row.is_featured),
        "is_public":          bool(row.is_public),
        "is_anonymous":       bool(row.is_anonymous),
        "moderation_status":  row.moderation_status,
        "removed_reason":     row.removed_reason,
        "clone_count":        int(row.clone_count or 0),
        "rating_avg":         round(float(row.rating_avg or 0), 2),
        "rating_count":       int(row.rating_count or 0),
        "creator": {
            "id":          int(row.creator_id) if row.creator_id is not None else None,
            "name":        row.creator_name or "",
            "can_publish": bool(row.creator_can_publish) if row.creator_can_publish is not None else True,
        } if row.creator_id is not None else None,
        "cards": [{"id": int(c.id), "front_text": c.front_text, "back_text": c.back_text} for c in cards],
        "reports": [
            {
                "id":       int(r.id),
                "reason":   r.reason,
                "details":  r.details,
                "status":   r.status,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "reporter": {"id": int(r.reporter_id), "name": r.reporter_name or ""} if r.reporter_id is not None else None,
            }
            for r in reports
        ],
    }


# ── Moderation actions ──────────────────────────────────────────────────────────

@router.post("/{deck_id}/approve")
async def approve_deck(
    deck_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    deck = db.execute(text("SELECT id, title FROM flashcard_decks WHERE id = :id"), {"id": deck_id}).fetchone()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    db.execute(
        text("UPDATE flashcard_decks SET moderation_status = 'approved', updated_at = :now WHERE id = :id"),
        {"id": deck_id, "now": datetime.now(UTC)},
    )
    db.execute(
        text("UPDATE deck_reports SET status = 'dismissed', reviewed_by = :admin, reviewed_at = :now WHERE deck_id = :id AND status = 'pending'"),
        {"id": deck_id, "admin": admin.telegram_id, "now": datetime.now(UTC)},
    )
    _log(db, "deck_approved", deck_id, admin, {"title": deck.title})
    db.commit()
    return {"ok": True}


class RemoveRequest(BaseModel):
    reason: str = Field(..., min_length=1, max_length=500)

@router.post("/{deck_id}/remove")
async def remove_deck(
    deck_id: int,
    body: RemoveRequest,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    deck = db.execute(text("SELECT id, title FROM flashcard_decks WHERE id = :id"), {"id": deck_id}).fetchone()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    db.execute(
        text("""
            UPDATE flashcard_decks SET
                moderation_status = 'removed', removed_reason = :reason, updated_at = :now
            WHERE id = :id
        """),
        {"id": deck_id, "reason": body.reason, "now": datetime.now(UTC)},
    )
    db.execute(
        text("UPDATE deck_reports SET status = 'actioned', reviewed_by = :admin, reviewed_at = :now WHERE deck_id = :id AND status = 'pending'"),
        {"id": deck_id, "admin": admin.telegram_id, "now": datetime.now(UTC)},
    )
    _log(db, "deck_removed", deck_id, admin, {"title": deck.title, "reason": body.reason})
    db.commit()
    return {"ok": True}


@router.post("/{deck_id}/ban-creator")
async def ban_deck_creator(
    deck_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    deck = db.execute(text("SELECT id, title, user_id FROM flashcard_decks WHERE id = :id"), {"id": deck_id}).fetchone()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    db.execute(
        text("UPDATE profiles SET can_publish = FALSE WHERE telegram_id = :uid"),
        {"uid": int(deck.user_id)},
    )
    _log(db, "creator_banned", deck_id, admin, {"title": deck.title, "user_id": int(deck.user_id)})
    db.commit()
    return {"ok": True}


# ── Official decks ───────────────────────────────────────────────────────────────

class CardInput(BaseModel):
    front_text: str = Field(..., min_length=1)
    back_text:  str = Field(..., min_length=1)

class OfficialDeckCreate(BaseModel):
    title:       str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = None
    category:    str
    cards:       list[CardInput] = Field(..., min_length=1)

@router.post("/official", status_code=201)
async def create_official_deck(
    body: OfficialDeckCreate,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    if body.category not in _CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")

    owner = db.execute(text("SELECT 1 FROM profiles WHERE telegram_id = :uid"), {"uid": admin.telegram_id}).fetchone()
    if not owner:
        raise HTTPException(
            status_code=400,
            detail="Admin account has no app profile yet — log into the consumer app once with this Telegram account before creating official decks.",
        )

    now = datetime.now(UTC)
    deck = db.execute(
        text("""
            INSERT INTO flashcard_decks
                (user_id, title, description, card_count, is_public, published_at,
                 category, moderation_status, created_at, updated_at)
            VALUES (:uid, :title, :desc, :card_count, TRUE, :now, :category, 'approved', :now, :now)
            RETURNING *
        """),
        {
            "uid": admin.telegram_id, "title": body.title, "desc": body.description,
            "card_count": len(body.cards), "category": body.category, "now": now,
        },
    ).fetchone()

    for i, c in enumerate(body.cards):
        db.execute(
            text("""
                INSERT INTO flashcards (deck_id, front_text, back_text, position, created_at)
                VALUES (:did, :front, :back, :pos, :now)
            """),
            {"did": int(deck.id), "front": c.front_text, "back": c.back_text, "pos": i, "now": now},
        )

    _log(db, "official_deck_created", int(deck.id), admin, {"title": body.title, "card_count": len(body.cards)})
    db.commit()
    return {"id": int(deck.id), "title": deck.title, "card_count": len(body.cards)}


class VerifyRequest(BaseModel):
    is_verified: bool

@router.patch("/{deck_id}/verify")
async def set_deck_verified(
    deck_id: int,
    body: VerifyRequest,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    deck = db.execute(text("SELECT id, title, badge_type FROM flashcard_decks WHERE id = :id"), {"id": deck_id}).fetchone()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    # Un-verifying a deck currently badged 'official' would leave a trust claim
    # with no accuracy check behind it — the badge's entire value is that an
    # admin actually checked the cards, so drop it back to 'none' in that case.
    new_badge = "none" if (not body.is_verified and deck.badge_type == "official") else deck.badge_type
    db.execute(
        text("UPDATE flashcard_decks SET is_verified = :v, badge_type = :badge, updated_at = :now WHERE id = :id"),
        {"id": deck_id, "v": body.is_verified, "badge": new_badge, "now": datetime.now(UTC)},
    )
    _log(db, "deck_verified", deck_id, admin, {"title": deck.title, "is_verified": body.is_verified})
    db.commit()
    return {"ok": True}


class BadgeRequest(BaseModel):
    badge_type: str

@router.patch("/{deck_id}/badge")
async def set_deck_badge(
    deck_id: int,
    body: BadgeRequest,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    if body.badge_type not in _BADGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid badge_type")

    deck = db.execute(text("SELECT id, title, is_verified FROM flashcard_decks WHERE id = :id"), {"id": deck_id}).fetchone()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    if body.badge_type == "official" and not deck.is_verified:
        raise HTTPException(
            status_code=400,
            detail="Cannot set the official badge before the deck is verified — call /verify first.",
        )

    db.execute(
        text("UPDATE flashcard_decks SET badge_type = :badge, updated_at = :now WHERE id = :id"),
        {"id": deck_id, "badge": body.badge_type, "now": datetime.now(UTC)},
    )
    _log(db, "deck_badge_set", deck_id, admin, {"title": deck.title, "badge_type": body.badge_type})
    db.commit()
    return {"ok": True}


class FeaturedRequest(BaseModel):
    is_featured: bool

@router.patch("/{deck_id}/featured")
async def set_deck_featured(
    deck_id: int,
    body: FeaturedRequest,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    deck = db.execute(
        text("SELECT id, title, moderation_status FROM flashcard_decks WHERE id = :id"),
        {"id": deck_id},
    ).fetchone()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")
    if body.is_featured and deck.moderation_status != "approved":
        raise HTTPException(status_code=400, detail="Only approved decks can be featured")

    db.execute(
        text("UPDATE flashcard_decks SET is_featured = :f, updated_at = :now WHERE id = :id"),
        {"id": deck_id, "f": body.is_featured, "now": datetime.now(UTC)},
    )
    _log(db, "deck_featured_toggled", deck_id, admin, {"title": deck.title, "is_featured": body.is_featured})
    db.commit()
    return {"ok": True}
