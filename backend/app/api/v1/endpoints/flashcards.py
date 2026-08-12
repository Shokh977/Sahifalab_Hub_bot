"""
flashcards.py — Flashcard deck/card CRUD and SM-2 spaced repetition study sessions.

GET    /flashcards/decks               — list user's decks
POST   /flashcards/decks               — create deck
PATCH  /flashcards/decks/:id           — update deck (title, color, icon)
DELETE /flashcards/decks/:id           — delete deck + all cards
GET    /flashcards/decks/:id           — deck detail with stats
GET    /flashcards/decks/:id/cards     — list all cards in deck
POST   /flashcards/decks/:id/cards     — add card to deck
PATCH  /flashcards/cards/:id           — update card (front/back text)
DELETE /flashcards/cards/:id           — delete card
GET    /flashcards/decks/:id/study     — ordered study session (failed→due→new)
POST   /flashcards/cards/:id/review    — submit rating, apply SM-2, award XP
POST   /flashcards/decks/:id/complete  — session done: session XP + daily goal
GET    /flashcards/stats               — overall stats (due count, mastered, etc.)

Public deck library (step-14-public-flashcard-decks):
PATCH  /flashcards/decks/:id/publish     — publish own deck to the public library
PATCH  /flashcards/decks/:id/unpublish   — make a public deck private again
GET    /flashcards/public                — browse public decks (category/sort/search)
GET    /flashcards/public/featured       — admin-curated featured decks
GET    /flashcards/public/:id            — public deck preview (5 sample cards)
POST   /flashcards/public/:id/clone      — clone a public deck into a private copy
POST   /flashcards/public/:id/rate       — rate a deck (cloners only)
GET    /flashcards/public/:id/ratings    — paginated ratings/reviews
POST   /flashcards/public/:id/report     — report a deck for moderation
GET    /flashcards/share/:id             — PUBLIC, no auth — web landing page data
"""

import asyncio
import logging
import math
import httpx
from datetime import datetime, UTC, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db, SessionLocal
from app.services.auth_service import decode_token
from app.services.xp_service import add_xp
from app.services.study_activity import record_study_activity
from app.services.badge_service import get_top_badges_map
from app.api.v1.endpoints.notifications import send_notification

router = APIRouter()
logger = logging.getLogger(__name__)

MAX_NEW_PER_SESSION = 10

XP_MASTERY_DECK = 50  # 100% deck mastery (all cards ever mastered)


# ── Auth helper ───────────────────────────────────────────────────────────────

async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return telegram_id


# ── SM-2 algorithm ────────────────────────────────────────────────────────────

def _apply_sm2(card: dict, rating: int, now: datetime) -> dict:
    """
    Apply simplified SM-2 algorithm. Returns updated card fields.
    card dict keys: ease_factor, interval_days, repetitions, status
    """
    ef  = float(card["ease_factor"])
    iv  = int(card["interval_days"])
    rep = int(card["repetitions"])

    if rating == 1:  # Forgot
        rep = 0
        iv  = 0
        ef  = max(1.3, ef - 0.2)
        status = "learning"
        next_review = now  # show again this session

    elif rating == 2:  # Hard
        rep += 1
        iv   = max(1, int(iv * 1.2)) if rep > 1 else 1
        ef   = max(1.3, ef - 0.15)
        status = "reviewing"
        next_review = now + timedelta(days=iv)

    elif rating == 3:  # Good
        rep += 1
        if   rep == 1: iv = 1
        elif rep == 2: iv = 3
        else:          iv = int(iv * ef)
        ef   = max(1.3, ef + 0.05)
        status = "reviewing"
        next_review = now + timedelta(days=iv)

    else:  # rating == 4, Easy
        rep += 1
        if rep == 1: iv = 4
        else:        iv = int(iv * ef * 1.3)
        ef   = max(1.3, ef + 0.15)
        status = "reviewing"
        next_review = now + timedelta(days=iv)

    if iv >= 21:
        status = "mastered"

    return {
        "ease_factor":   round(ef, 4),
        "interval_days": iv,
        "repetitions":   rep,
        "status":        status,
        "next_review":   next_review,
        "last_reviewed": now,
    }


# Initial (ease_factor, interval_days) seed for a freshly-cloned deck, based on the
# cloner's self-reported onboarding experience level. Beginners start on an easier
# curve (more repetitions before intervals grow); advanced users skip ahead slightly.
_EXPERIENCE_SM2_SEED = {
    "beginner":     (2.3, 0),
    "intermediate": (2.5, 0),
    "advanced":     (2.7, 1),
}


def _sm2_seed_for_experience(db: Session, user_id: int) -> tuple:
    row = db.execute(
        text("SELECT user_settings FROM profiles WHERE telegram_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    level = (row.user_settings or {}).get("experience_level") if row and row.user_settings else None
    return _EXPERIENCE_SM2_SEED.get(level, (2.5, 0))


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class DeckCreate(BaseModel):
    title:       str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    color:       str = Field(default="#F5A623", max_length=7)
    icon:        Optional[str] = None
    course_id:   Optional[int] = None

class DeckUpdate(BaseModel):
    title:       Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    color:       Optional[str] = Field(None, max_length=7)
    icon:        Optional[str] = None

class CardCreate(BaseModel):
    front_text: str = Field(..., min_length=1)
    back_text:  str = Field(..., min_length=1)
    position:   int = 0

class CardUpdate(BaseModel):
    front_text: Optional[str] = Field(None, min_length=1)
    back_text:  Optional[str] = Field(None, min_length=1)

class ReviewRequest(BaseModel):
    rating:        int = Field(..., ge=1, le=4)
    time_spent_ms: Optional[int] = None

class CompleteSessionRequest(BaseModel):
    total_time_ms:  int = Field(..., ge=0)
    cards_reviewed: int = Field(..., ge=0)
    local_date:     Optional[str] = None


# ── Public deck library schemas ────────────────────────────────────────────────

_CATEGORIES = {"english", "ielts", "business", "arabic", "programming", "medical", "other"}
_REPORT_REASONS = {"spam", "errors", "inappropriate", "offensive", "copyright", "other"}

class PublishRequest(BaseModel):
    is_anonymous: bool = False
    category:     str  = Field(..., min_length=1, max_length=50)

class RateRequest(BaseModel):
    rating:  int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=1000)

class ReportRequest(BaseModel):
    reason:  str = Field(..., max_length=30)
    details: Optional[str] = Field(None, max_length=1000)


# ── Helper: verify deck ownership ─────────────────────────────────────────────

def _get_deck_or_404(db: Session, deck_id: int, user_id: int):
    row = db.execute(
        text("SELECT * FROM flashcard_decks WHERE id = :id AND user_id = :uid"),
        {"id": deck_id, "uid": user_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Deck not found")
    return row


def _get_card_or_404(db: Session, card_id: int, user_id: int):
    row = db.execute(
        text("""
            SELECT fc.*, fd.user_id, fd.color, fd.card_count, fd.mastered_count
            FROM flashcards fc
            JOIN flashcard_decks fd ON fd.id = fc.deck_id
            WHERE fc.id = :id AND fd.user_id = :uid
        """),
        {"id": card_id, "uid": user_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Card not found")
    return row


# ── Content safety (Part 6) ─────────────────────────────────────────────────────
# Word-list based screen, run synchronously on publish. No external moderation
# API is wired up (none of the integrations available here have credentials
# configured) — this is a conservative substring screen in EN/RU/UZ, kept
# deliberately broad rather than precise so it over-flags into manual review
# instead of under-flagging into the public library.

_BANNED_SUBSTRINGS = {
    # English — profanity, sexual content, violence, hate speech
    "fuck", "shit", "bitch", "asshole", "cunt", "whore", "slut",
    "porn", "porno", "xxx", "nude", "naked photo", "sex video",
    "rape", "kill yourself", "suicide", "self harm",
    "nigger", "faggot", "retard",
    # Russian
    "блядь", "сука", "хуй", "пизда", "ебать", "мудак", "шлюха",
    "порно", "изнасилование", "самоубийство",
    # Uzbek
    "jalab", "qotoq", "kepak", "ahmoqsan", "o'zingni o'ldir",
}

# Zero-tolerance child-safety screen: a minor-indicating term co-occurring with a
# sexual-content term in the same submission is rejected outright and escalated
# to admin with high priority, regardless of the general screen above.
_MINOR_INDICATOR_TERMS = {
    "child", "kid", "minor", "underage", "schoolgirl", "schoolboy",
    "bola", "qiz bola", "o'g'il bola", "o'quvchi",
    "ребенок", "ребёнок", "девочка", "мальчик", "школьница",
}
_SEXUAL_CONTENT_TERMS = {
    "sex", "porn", "nude", "naked", "xxx",
    "seks", "yalang'och",
    "секс", "порно", "голый", "голая",
}

def _content_safety_check(texts: list[str]) -> tuple[bool, str]:
    """
    Returns (flagged, severity). severity is 'child_safety' (zero-tolerance,
    high-priority admin escalation) or 'general' (standard banned-term match).
    """
    blob = " ".join(t or "" for t in texts).lower()

    has_minor_term   = any(term in blob for term in _MINOR_INDICATOR_TERMS)
    has_sexual_term  = any(term in blob for term in _SEXUAL_CONTENT_TERMS)
    if has_minor_term and has_sexual_term:
        return True, "child_safety"

    if any(term in blob for term in _BANNED_SUBSTRINGS):
        return True, "general"

    return False, ""


_MODERATION_ALERT_TEXT = {
    "deck_content_flagged":       "🚩 <b>To'plam tekshiruvga yuborildi</b>",
    "deck_child_safety_flagged":  "🔴 <b>YUQORI USTUVORLIK — bolalar xavfsizligi tekshiruvi</b>",
    "deck_auto_hidden_reports":   "⚠️ <b>To'plam shikoyatlar tufayli yashirildi</b>",
}

async def _notify_admins(notif_type: str, meta: dict) -> None:
    """
    Alerts every configured admin via both the in-app notification feed and a
    direct Telegram message (same channel as wallet payout requests — the one
    admins are already expected to check promptly). Fire-and-forget; never raises.
    """
    try:
        from app.core.config import settings
        admin_ids: list[int] = settings.ADMIN_TELEGRAM_IDS or []
        bot_token: str = settings.TELEGRAM_BOT_TOKEN
    except Exception:
        admin_ids, bot_token = [], ""

    for admin_id in admin_ids:
        try:
            await send_notification(admin_id, notif_type, category="SYSTEM", meta=meta)
        except Exception:
            pass

    if not bot_token or not admin_ids:
        return

    header = _MODERATION_ALERT_TEXT.get(notif_type, "🚩 <b>Moderatsiya ogohlantirishi</b>")
    lines = [header, ""]
    if meta.get("deck_id") is not None:  lines.append(f"To'plam ID: <code>{meta['deck_id']}</code>")
    if meta.get("title"):                lines.append(f"Sarlavha: {meta['title']}")
    if meta.get("user_id") is not None:  lines.append(f"Foydalanuvchi ID: <code>{meta['user_id']}</code>")
    if meta.get("report_count") is not None: lines.append(f"Shikoyatlar soni: {meta['report_count']}")
    lines.append("\n📋 Admin panelda ko'rib chiqing.")
    message = "\n".join(lines)

    for chat_id in admin_ids:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
                )
        except Exception as e:
            logger.error(f"Failed to notify admin {chat_id} of {notif_type}: {e}")


# ── Gamification tie-in (Part 8) ────────────────────────────────────────────────
# One-time XP bonus + notification to the creator when their published deck
# crosses a clone-count milestone. Never awarded for cloning someone else's deck.

CLONE_MILESTONE_XP = {10: 50, 50: 200, 100: 500}

async def _check_clone_milestones(db: Session, deck_id: int) -> None:
    row = db.execute(
        text("SELECT user_id, title, clone_count, clone_milestones_awarded FROM flashcard_decks WHERE id = :id"),
        {"id": deck_id},
    ).fetchone()
    if not row:
        return

    clone_count = int(row.clone_count or 0)
    awarded = set(row.clone_milestones_awarded or [])
    milestone = next((m for m in sorted(CLONE_MILESTONE_XP) if clone_count >= m and m not in awarded), None)
    if milestone is None:
        return

    bonus = CLONE_MILESTONE_XP[milestone]
    try:
        add_xp(db, user_id=int(row.user_id), source="DECK_MILESTONE", amount=bonus, reference_id=deck_id)
        db.execute(
            text("UPDATE flashcard_decks SET clone_milestones_awarded = array_append(clone_milestones_awarded, :m) WHERE id = :id"),
            {"m": milestone, "id": deck_id},
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.error(
            "Clone-milestone XP award failed for deck_id=%s user_id=%s milestone=%s amount=%s source=DECK_MILESTONE",
            deck_id, row.user_id, milestone, bonus, exc_info=True,
        )
        return

    try:
        await send_notification(int(row.user_id), "deck_clone_milestone", category="SYSTEM", meta={
            "deck_id": deck_id, "deck_title": row.title, "clone_count": milestone, "bonus_xp": bonus,
        })
    except Exception:
        pass


def _publish_error(code: str, details: str) -> HTTPException:
    return HTTPException(status_code=400, detail={
        "success": False,
        "error": {"code": code, "details": details},
    })


# ── Rate limiting (Part 6) ────────────────────────────────────────────────────
# Reuses the existing per-action tables (their created_at / published_at
# timestamps) instead of a dedicated counters table — publish/clone/report
# each already write one row per action.

RATE_LIMITS = {
    "publish": (10, "Kuniga eng ko'pi bilan 10 ta to'plam ulashish mumkin. Ertaga qayta urinib ko'ring."),
    "clone":   (50, "Kuniga eng ko'pi bilan 50 ta to'plamdan nusxa olish mumkin. Ertaga qayta urinib ko'ring."),
    "report":  (20, "Kuniga eng ko'pi bilan 20 ta shikoyat yuborish mumkin. Ertaga qayta urinib ko'ring."),
}

def _check_rate_limit(db: Session, action: str, user_id: int) -> None:
    limit, message = RATE_LIMITS[action]
    queries = {
        "publish": "SELECT COUNT(*) FROM flashcard_decks WHERE user_id = :uid AND DATE(published_at) = CURRENT_DATE",
        "clone":   "SELECT COUNT(*) FROM deck_clones WHERE cloned_by = :uid AND DATE(created_at) = CURRENT_DATE",
        "report":  "SELECT COUNT(*) FROM deck_reports WHERE reported_by = :uid AND DATE(created_at) = CURRENT_DATE",
    }
    count = db.execute(text(queries[action]), {"uid": user_id}).scalar()
    if int(count or 0) >= limit:
        raise HTTPException(status_code=429, detail={
            "success": False,
            "error": {"code": "RATE_LIMITED", "details": message},
        })


# ── Deck endpoints ────────────────────────────────────────────────────────────

@router.get("/decks")
async def list_decks(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    now = datetime.now(UTC)
    rows = db.execute(
        text("""
            SELECT d.*, COUNT(fc.id) FILTER (
                WHERE fc.status != 'mastered'
                  AND (fc.next_review IS NULL OR fc.next_review <= :now)
            ) AS due_count
            FROM flashcard_decks d
            LEFT JOIN flashcards fc ON fc.deck_id = d.id
            WHERE d.user_id = :uid
            GROUP BY d.id
            ORDER BY d.created_at DESC
        """),
        {"uid": caller_id, "now": now},
    ).fetchall()

    return [_deck_row(r) for r in rows]


@router.post("/decks", status_code=201)
async def create_deck(
    body: DeckCreate,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    now = datetime.now(UTC)
    row = db.execute(
        text("""
            INSERT INTO flashcard_decks (user_id, title, description, color, icon, course_id, created_at, updated_at)
            VALUES (:uid, :title, :desc, :color, :icon, :course_id, :now, :now)
            RETURNING *
        """),
        {
            "uid": caller_id, "title": body.title, "desc": body.description,
            "color": body.color, "icon": body.icon, "course_id": body.course_id, "now": now,
        },
    ).fetchone()
    db.commit()
    return _deck_row_simple(row)


@router.get("/decks/{deck_id}")
async def get_deck(
    deck_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    _get_deck_or_404(db, deck_id, caller_id)
    now = datetime.now(UTC)
    row = db.execute(
        text("""
            SELECT d.*, COUNT(fc.id) FILTER (
                WHERE fc.status != 'mastered'
                  AND (fc.next_review IS NULL OR fc.next_review <= :now)
            ) AS due_count
            FROM flashcard_decks d
            LEFT JOIN flashcards fc ON fc.deck_id = d.id
            WHERE d.id = :id AND d.user_id = :uid
            GROUP BY d.id
        """),
        {"id": deck_id, "uid": caller_id, "now": now},
    ).fetchone()
    return _deck_row(row)


@router.patch("/decks/{deck_id}")
async def update_deck(
    deck_id: int,
    body: DeckUpdate,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    _get_deck_or_404(db, deck_id, caller_id)
    sets, params = [], {"id": deck_id, "uid": caller_id, "now": datetime.now(UTC)}
    if body.title       is not None: sets.append("title = :title");       params["title"]       = body.title
    if body.description is not None: sets.append("description = :desc");  params["desc"]        = body.description
    if body.color       is not None: sets.append("color = :color");       params["color"]       = body.color
    if body.icon        is not None: sets.append("icon = :icon");         params["icon"]        = body.icon
    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to update")
    sets.append("updated_at = :now")
    row = db.execute(
        text(f"UPDATE flashcard_decks SET {', '.join(sets)} WHERE id = :id AND user_id = :uid RETURNING *"),
        params,
    ).fetchone()
    db.commit()
    return _deck_row_simple(row)


@router.delete("/decks/{deck_id}", status_code=204)
async def delete_deck(
    deck_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    _get_deck_or_404(db, deck_id, caller_id)
    db.execute(text("DELETE FROM flashcard_decks WHERE id = :id AND user_id = :uid"), {"id": deck_id, "uid": caller_id})
    db.commit()


# ── Card endpoints ────────────────────────────────────────────────────────────

@router.get("/decks/{deck_id}/cards")
async def list_cards(
    deck_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    _get_deck_or_404(db, deck_id, caller_id)
    rows = db.execute(
        text("SELECT * FROM flashcards WHERE deck_id = :did ORDER BY position, created_at"),
        {"did": deck_id},
    ).fetchall()
    return [_card_row(r) for r in rows]


@router.post("/decks/{deck_id}/cards", status_code=201)
async def add_card(
    deck_id: int,
    body: CardCreate,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    _get_deck_or_404(db, deck_id, caller_id)
    now = datetime.now(UTC)
    row = db.execute(
        text("""
            INSERT INTO flashcards (deck_id, front_text, back_text, position, created_at)
            VALUES (:did, :front, :back, :pos, :now)
            RETURNING *
        """),
        {"did": deck_id, "front": body.front_text, "back": body.back_text, "pos": body.position, "now": now},
    ).fetchone()
    db.execute(
        text("UPDATE flashcard_decks SET card_count = card_count + 1, updated_at = :now WHERE id = :id"),
        {"now": now, "id": deck_id},
    )
    db.commit()
    return _card_row(row)


@router.patch("/cards/{card_id}")
async def update_card(
    card_id: int,
    body: CardUpdate,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    _get_card_or_404(db, card_id, caller_id)
    sets, params = [], {"id": card_id}
    if body.front_text is not None: sets.append("front_text = :front"); params["front"] = body.front_text
    if body.back_text  is not None: sets.append("back_text = :back");   params["back"]  = body.back_text
    if not sets:
        raise HTTPException(status_code=400, detail="Nothing to update")
    row = db.execute(
        text(f"UPDATE flashcards SET {', '.join(sets)} WHERE id = :id RETURNING *"),
        params,
    ).fetchone()
    db.commit()
    return _card_row(row)


@router.delete("/cards/{card_id}", status_code=204)
async def delete_card(
    card_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    card = _get_card_or_404(db, card_id, caller_id)
    deck_id = int(card.deck_id)
    was_mastered = card.status == "mastered"
    db.execute(text("DELETE FROM flashcards WHERE id = :id"), {"id": card_id})
    db.execute(
        text("""
            UPDATE flashcard_decks SET
                card_count     = GREATEST(0, card_count - 1),
                mastered_count = GREATEST(0, mastered_count - :m),
                updated_at     = NOW()
            WHERE id = :did
        """),
        {"m": 1 if was_mastered else 0, "did": deck_id},
    )
    db.commit()


# ── Study session ─────────────────────────────────────────────────────────────

@router.get("/decks/{deck_id}/study")
async def get_study_session(
    deck_id: int,
    practice: bool = Query(False, description="Return all cards regardless of due date"),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    _get_deck_or_404(db, deck_id, caller_id)
    now = datetime.now(UTC)

    if practice:
        # Practice mode: all cards in deck ordered by status (new → learning → reviewing → mastered)
        rows = db.execute(
            text("""
                SELECT * FROM flashcards
                WHERE deck_id = :did
                ORDER BY
                    CASE status
                        WHEN 'new'       THEN 1
                        WHEN 'learning'  THEN 2
                        WHEN 'reviewing' THEN 3
                        ELSE 4
                    END,
                    COALESCE(next_review, created_at) ASC
            """),
            {"did": deck_id},
        ).fetchall()
        all_cards = [_card_row(r) for r in rows]
        return {"cards": all_cards, "total": len(all_cards), "due_count": 0, "new_count": 0}

    # Normal mode: failed/due cards first, then new cards (max 10)
    due = db.execute(
        text("""
            SELECT * FROM flashcards
            WHERE deck_id = :did AND status != 'new'
              AND (next_review IS NULL OR next_review <= :now)
              AND status != 'mastered'
            ORDER BY next_review ASC NULLS FIRST
        """),
        {"did": deck_id, "now": now},
    ).fetchall()

    new_cards = db.execute(
        text("""
            SELECT * FROM flashcards
            WHERE deck_id = :did AND status = 'new'
            ORDER BY position, created_at
            LIMIT :limit
        """),
        {"did": deck_id, "limit": MAX_NEW_PER_SESSION},
    ).fetchall()

    all_cards = [_card_row(r) for r in due] + [_card_row(r) for r in new_cards]

    total_due = db.execute(
        text("""
            SELECT COUNT(*) FROM flashcards
            WHERE deck_id = :did AND status != 'new' AND status != 'mastered'
              AND (next_review IS NULL OR next_review <= :now)
        """),
        {"did": deck_id, "now": now},
    ).scalar() or 0

    return {
        "cards":     all_cards,
        "total":     len(all_cards),
        "due_count": int(total_due),
        "new_count": len(new_cards),
    }


# ── Review (SM-2 + XP) ────────────────────────────────────────────────────────

@router.post("/cards/{card_id}/review")
async def review_card(
    card_id: int,
    body: ReviewRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    card = _get_card_or_404(db, card_id, caller_id)
    deck_id = int(card.deck_id)
    now = datetime.now(UTC)

    old_status = card.status
    sm2 = _apply_sm2(
        {
            "ease_factor":   float(card.ease_factor or 2.5),
            "interval_days": int(card.interval_days or 0),
            "repetitions":   int(card.repetitions or 0),
            "status":        card.status or "new",
        },
        body.rating,
        now,
    )

    db.execute(
        text("""
            UPDATE flashcards SET
                ease_factor   = :ef,
                interval_days = :iv,
                repetitions   = :rep,
                status        = :st,
                next_review   = :nr,
                last_reviewed = :lr
            WHERE id = :id
        """),
        {
            "ef": sm2["ease_factor"], "iv": sm2["interval_days"],
            "rep": sm2["repetitions"], "st": sm2["status"],
            "nr": sm2["next_review"], "lr": sm2["last_reviewed"], "id": card_id,
        },
    )

    # Check if card already reviewed today (before logging, for XP dedup)
    already_today = db.execute(
        text("""
            SELECT 1 FROM flashcard_reviews
            WHERE user_id = :uid AND card_id = :cid
              AND DATE(reviewed_at) = CURRENT_DATE
              AND rating != 99
            LIMIT 1
        """),
        {"uid": caller_id, "cid": card_id},
    ).fetchone()
    first_review_today = not bool(already_today)

    # Log review
    db.execute(
        text("""
            INSERT INTO flashcard_reviews (user_id, card_id, deck_id, rating, reviewed_at, time_spent_ms)
            VALUES (:uid, :cid, :did, :rating, :now, :ms)
        """),
        {
            "uid": caller_id, "cid": card_id, "did": deck_id,
            "rating": body.rating, "now": now, "ms": body.time_spent_ms,
        },
    )

    # Update mastered_count if card just became mastered
    newly_mastered = (old_status != "mastered" and sm2["status"] == "mastered")
    if newly_mastered:
        db.execute(
            text("UPDATE flashcard_decks SET mastered_count = mastered_count + 1, updated_at = :now WHERE id = :did"),
            {"now": now, "did": deck_id},
        )

    db.commit()

    # Check deck mastery (100% of cards mastered)
    deck_bonus_xp = 0
    deck_row = db.execute(
        text("SELECT card_count, mastered_count FROM flashcard_decks WHERE id = :did"),
        {"did": deck_id},
    ).fetchone()
    if deck_row and deck_row.card_count > 0 and deck_row.mastered_count >= deck_row.card_count:
        # Check if already awarded this deck mastery XP today
        already = db.execute(
            text("""
                SELECT 1 FROM flashcard_reviews
                WHERE user_id = :uid AND deck_id = :did AND rating = 99
                LIMIT 1
            """),
            {"uid": caller_id, "did": deck_id},
        ).fetchone()
        if not already:
            try:
                add_xp(db, user_id=caller_id, source="DEEP_WORK", amount=XP_MASTERY_DECK)
                deck_bonus_xp = XP_MASTERY_DECK
                # Mark with a sentinel review row (rating=99)
                db.execute(
                    text("""
                        INSERT INTO flashcard_reviews (user_id, card_id, deck_id, rating, reviewed_at)
                        VALUES (:uid, :cid, :did, 99, :now)
                    """),
                    {"uid": caller_id, "cid": card_id, "did": deck_id, "now": now},
                )
                db.commit()
            except Exception:
                db.rollback()
                logger.error(
                    "Deck-mastery XP award failed for user_id=%s deck_id=%s amount=%s source=DEEP_WORK",
                    caller_id, deck_id, XP_MASTERY_DECK, exc_info=True,
                )

    return {
        "ok":            True,
        "new_status":    sm2["status"],
        "next_review":   sm2["next_review"].isoformat() if sm2["next_review"] else None,
        "interval_days": sm2["interval_days"],
        "xp_awarded":    0,
        "deck_bonus_xp": deck_bonus_xp,
        "newly_mastered": newly_mastered,
    }


# ── Session complete (focus goal integration) ─────────────────────────────────

@router.post("/decks/{deck_id}/complete")
async def complete_session(
    deck_id: int,
    body: CompleteSessionRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    _get_deck_or_404(db, deck_id, caller_id)

    # Ignore bot/scripted calls with no measurable study time
    if body.total_time_ms < 1000:
        return {"ok": True, "xp_awarded": 0, "streak_days": 0, "goal_met": False, "today_minutes": 0, "daily_goal": 20}

    now = datetime.now(UTC)

    # XP = ceil(cards_reviewed_this_session / 5)
    # Using actual cards reviewed, not total deck size, to prevent XP farming
    # when the session shows only a subset (e.g. 10 of 500 cards).
    reviewed = max(0, int(body.cards_reviewed))
    session_xp = math.ceil(reviewed / 5) if reviewed > 0 else 0

    # Award XP once per day across ALL decks — only the first completed deck earns XP
    already_session_xp = db.execute(
        text("""
            SELECT 1 FROM flashcard_reviews
            WHERE user_id = :uid AND rating = 98
              AND DATE(reviewed_at) = CURRENT_DATE
            LIMIT 1
        """),
        {"uid": caller_id},
    ).fetchone()

    xp_result = {"xp_added": 0}
    if not already_session_xp:
        try:
            xp_result = add_xp(db, user_id=caller_id, source="DEEP_WORK", amount=session_xp)
            # Record sentinel so subsequent sessions today give no XP
            any_card = db.execute(
                text("SELECT id FROM flashcards WHERE deck_id = :did LIMIT 1"),
                {"did": deck_id},
            ).fetchone()
            if any_card:
                db.execute(
                    text("""
                        INSERT INTO flashcard_reviews (user_id, card_id, deck_id, rating, reviewed_at)
                        VALUES (:uid, :cid, :did, 98, :now)
                    """),
                    {"uid": caller_id, "cid": int(any_card.id), "did": deck_id, "now": now},
                )
        except Exception:
            logger.error(
                "Flashcard session XP award failed for user_id=%s deck_id=%s amount=%s source=DEEP_WORK",
                caller_id, deck_id, session_xp, exc_info=True,
            )

    # Count flashcard study time toward daily goal (1 min = 1 min)
    flash_minutes = max(1, body.total_time_ms // 60_000) if body.total_time_ms > 0 else 1

    # Single write path for "the user did some studying" — see
    # app/services/study_activity.py. source='flashcards' (NOT 'focus_timer')
    # is deliberate: flashcard study still maintains the streak below, but by
    # product rule must NOT count toward a focus_minutes cohort challenge —
    # that challenge is named and marketed as a focus-timer marathon.
    activity = record_study_activity(
        db, user_id=caller_id, minutes=flash_minutes,
        source="flashcards", xp_awarded=xp_result.get("xp_added", 0),
        local_date=body.local_date, challenge_value=reviewed,
    )

    for stage in activity.stages_completed:
        asyncio.create_task(send_notification(
            caller_id, "achievement", category="SYSTEM",
            meta={
                "stage_key":    stage.get("key", ""),
                "stage_number": stage.get("stage_number"),
                "bonus_xp":     stage.get("bonus_xp", 0),
            },
        ))

    return {
        "ok":                    True,
        "xp_awarded":            xp_result.get("xp_added", 0),
        "flash_minutes":         flash_minutes,
        "today_minutes":         activity.today_minutes,
        "streak_days":           activity.streak_days,
        "goal_met":              activity.goal_met,
        "stages_completed":      activity.stages_completed,
        "challenges_completed":  activity.challenges_completed,
        "challenges_progressed": activity.challenges_progressed,
        "freeze_count":              activity.freeze_count,
        "milestone_freeze_granted":  activity.milestone_freeze_granted,
    }


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    now = datetime.now(UTC)
    row = db.execute(
        text("""
            SELECT
                COUNT(DISTINCT d.id)                    AS total_decks,
                COALESCE(SUM(d.card_count), 0)          AS total_cards,
                COALESCE(SUM(d.mastered_count), 0)      AS total_mastered,
                COALESCE(SUM(
                    (SELECT COUNT(*) FROM flashcards fc
                     WHERE fc.deck_id = d.id
                       AND fc.status != 'mastered'
                       AND fc.status != 'new'
                       AND (fc.next_review IS NULL OR fc.next_review <= :now))
                ), 0) AS total_due,
                COALESCE((
                    SELECT COUNT(*) FROM flashcard_reviews r2
                    WHERE r2.user_id = :uid
                      AND DATE(r2.reviewed_at) = CURRENT_DATE
                      AND r2.rating != 99
                ), 0) AS today_reviewed
            FROM flashcard_decks d
            WHERE d.user_id = :uid
        """),
        {"uid": caller_id, "now": now},
    ).fetchone()

    return {
        "total_decks":    int(row.total_decks)    if row else 0,
        "total_cards":    int(row.total_cards)    if row else 0,
        "total_mastered": int(row.total_mastered) if row else 0,
        "total_due":      int(row.total_due)      if row else 0,
        "today_reviewed": int(row.today_reviewed) if row else 0,
    }


# ── Publish / unpublish ─────────────────────────────────────────────────────────

@router.patch("/decks/{deck_id}/publish")
async def publish_deck(
    deck_id: int,
    body: PublishRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    deck = _get_deck_or_404(db, deck_id, caller_id)

    can_publish = db.execute(
        text("SELECT can_publish FROM profiles WHERE telegram_id = :uid"),
        {"uid": caller_id},
    ).scalar()
    if can_publish is False:
        raise _publish_error(
            "PUBLISH_BANNED",
            "Sizga ommaga ulashish taqiqlangan. Yordam uchun qo'llab-quvvatlashga murojaat qiling.",
        )

    _check_rate_limit(db, "publish", caller_id)

    title = (deck.title or "").strip()
    if not (3 <= len(title) <= 100):
        raise _publish_error("TITLE", "Sarlavha 3-100 belgidan iborat bo'lishi kerak.")

    if body.category not in _CATEGORIES:
        raise _publish_error("CATEGORY", "Turkum tanlanishi shart.")

    card_count = int(deck.card_count or 0)
    if card_count < 10:
        raise _publish_error(
            "MIN_CARDS",
            f"Ommaga ulashish uchun kamida 10 ta karta kerak. Hozir: {card_count} ta.",
        )

    empty_cards = db.execute(
        text("""
            SELECT COUNT(*) FROM flashcards
            WHERE deck_id = :id AND (TRIM(front_text) = '' OR TRIM(back_text) = '')
        """),
        {"id": deck_id},
    ).scalar()
    if int(empty_cards or 0) > 0:
        raise _publish_error("EMPTY_CARDS", "Barcha kartalar to'liq to'ldirilishi kerak.")

    card_texts = db.execute(
        text("SELECT front_text, back_text FROM flashcards WHERE deck_id = :id"),
        {"id": deck_id},
    ).fetchall()
    texts = [title, deck.description or ""]
    for c in card_texts:
        texts.append(c.front_text or "")
        texts.append(c.back_text or "")

    flagged, severity = _content_safety_check(texts)
    if flagged:
        db.execute(
            text("UPDATE flashcard_decks SET moderation_status = 'pending_review', updated_at = :now WHERE id = :id"),
            {"id": deck_id, "now": datetime.now(UTC)},
        )
        db.commit()
        await _notify_admins(
            "deck_content_flagged" if severity == "general" else "deck_child_safety_flagged",
            {"deck_id": deck_id, "user_id": caller_id, "title": title, "severity": severity, "priority": "high" if severity == "child_safety" else "normal"},
        )
        raise _publish_error(
            "CONTENT_FLAGGED",
            "To'plamingiz tekshiruvdan o'tmadi. Agar bu xato deb hisoblasangiz, qo'llab-quvvatlashga murojaat qiling.",
        )

    now = datetime.now(UTC)
    row = db.execute(
        text("""
            UPDATE flashcard_decks SET
                is_public         = TRUE,
                published_at      = COALESCE(published_at, :now),
                is_anonymous      = :anon,
                category          = :category,
                moderation_status = 'approved',
                updated_at        = :now
            WHERE id = :id
            RETURNING *
        """),
        {"id": deck_id, "now": now, "anon": body.is_anonymous, "category": body.category},
    ).fetchone()
    db.commit()
    return _deck_row_simple(row)


@router.patch("/decks/{deck_id}/unpublish")
async def unpublish_deck(
    deck_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    _get_deck_or_404(db, deck_id, caller_id)
    row = db.execute(
        text("UPDATE flashcard_decks SET is_public = FALSE, updated_at = :now WHERE id = :id RETURNING *"),
        {"id": deck_id, "now": datetime.now(UTC)},
    ).fetchone()
    db.commit()
    return _deck_row_simple(row)


# ── Discovery (public library) ──────────────────────────────────────────────────

@router.get("/public")
async def list_public_decks(
    category: str = Query("all"),
    sort:     str = Query("popular", pattern="^(popular|newest|top_rated)$"),
    search:   Optional[str] = Query(None),
    page:     int = Query(1, ge=1),
    limit:    int = Query(20, ge=1, le=20),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    offset = (page - 1) * limit
    filters = ["d.is_public = TRUE", "d.moderation_status = 'approved'"]
    params: dict = {"limit": limit, "offset": offset, "caller": caller_id}

    if category and category != "all":
        filters.append("d.category = :category")
        params["category"] = category
    if search:
        filters.append("(d.title ILIKE :search OR d.description ILIKE :search)")
        params["search"] = f"%{search}%"
    if sort == "top_rated":
        filters.append("d.rating_count >= 5")

    where = " AND ".join(filters)
    order = {
        "popular":   "d.clone_count DESC",
        "newest":    "d.published_at DESC NULLS LAST",
        "top_rated": "d.rating_avg DESC",
    }[sort]

    # Two separate queries beat a single COUNT(*) OVER() here: the window function
    # forces Postgres to materialize every matching row (defeating the LIMIT-aware
    # index scan) just to attach a total to each of the 20 returned rows. A plain
    # COUNT(*) against flashcard_decks alone (no joins needed — filters are all on
    # d.*) stays index-only and cheap regardless of catalog size.
    rows = db.execute(
        text(f"""
            SELECT d.id, d.title, d.description, d.color, d.card_count, d.category, d.badge_type,
                   d.is_anonymous, d.is_featured, d.clone_count, d.rating_avg, d.rating_count,
                   p.telegram_id AS creator_id, p.first_name AS creator_name, p.photo_url AS creator_photo,
                   (dc_check.original_deck_id IS NOT NULL) AS already_cloned
            FROM flashcard_decks d
            LEFT JOIN profiles p ON p.telegram_id = d.user_id
            LEFT JOIN deck_clones dc_check
                   ON dc_check.original_deck_id = d.id AND dc_check.cloned_by = :caller
            WHERE {where}
            ORDER BY {order}
            LIMIT :limit OFFSET :offset
        """),
        params,
    ).fetchall()

    total = db.execute(text(f"SELECT COUNT(*) FROM flashcard_decks d WHERE {where}"), params).scalar()

    top_badge_map = get_top_badges_map(db, [r.creator_id for r in rows if r.creator_id is not None])

    return {
        "decks": [_public_deck_item(r, top_badge_map) for r in rows],
        "total": int(total or 0),
        "page":  page,
        "limit": limit,
    }


@router.get("/public/featured")
async def list_featured_decks(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    rows = db.execute(
        text("""
            SELECT d.id, d.title, d.description, d.color, d.card_count, d.category, d.badge_type,
                   d.is_anonymous, d.is_featured, d.clone_count, d.rating_avg, d.rating_count,
                   p.telegram_id AS creator_id, p.first_name AS creator_name, p.photo_url AS creator_photo,
                   (dc_check.original_deck_id IS NOT NULL) AS already_cloned
            FROM flashcard_decks d
            LEFT JOIN profiles p ON p.telegram_id = d.user_id
            LEFT JOIN deck_clones dc_check
                   ON dc_check.original_deck_id = d.id AND dc_check.cloned_by = :caller
            WHERE d.is_public = TRUE AND d.moderation_status = 'approved' AND d.is_featured = TRUE
            ORDER BY d.published_at DESC NULLS LAST
            LIMIT 10
        """),
        {"caller": caller_id},
    ).fetchall()
    top_badge_map = get_top_badges_map(db, [r.creator_id for r in rows if r.creator_id is not None])
    return [_public_deck_item(r, top_badge_map) for r in rows]


@router.get("/public/{deck_id}")
async def get_public_deck(
    deck_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    row = db.execute(
        text("""
            SELECT d.id, d.title, d.description, d.color, d.card_count, d.category, d.badge_type,
                   d.is_anonymous, d.is_featured, d.is_verified, d.clone_count, d.rating_avg,
                   d.rating_count, d.published_at,
                   p.telegram_id AS creator_id, p.first_name AS creator_name, p.photo_url AS creator_photo,
                   EXISTS (
                       SELECT 1 FROM deck_clones dc
                       WHERE dc.original_deck_id = d.id AND dc.cloned_by = :caller
                   ) AS already_cloned
            FROM flashcard_decks d
            LEFT JOIN profiles p ON p.telegram_id = d.user_id
            WHERE d.id = :id AND d.is_public = TRUE AND d.moderation_status = 'approved'
        """),
        {"id": deck_id, "caller": caller_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Deck not found")

    preview_cards = db.execute(
        text("SELECT front_text, back_text FROM flashcards WHERE deck_id = :id ORDER BY position, created_at LIMIT 5"),
        {"id": deck_id},
    ).fetchall()

    recent_ratings = db.execute(
        text("""
            SELECT r.rating, r.comment, r.created_at,
                   p.telegram_id AS rater_id, p.first_name AS rater_name, p.photo_url AS rater_photo
            FROM deck_ratings r
            JOIN profiles p ON p.telegram_id = r.user_id
            WHERE r.deck_id = :id
            ORDER BY r.created_at DESC
            LIMIT 5
        """),
        {"id": deck_id},
    ).fetchall()

    top_badge_map = get_top_badges_map(db, [row.creator_id] if row.creator_id is not None else [])
    item = _public_deck_item(row, top_badge_map)
    item["is_verified"]  = bool(row.is_verified)
    item["published_at"] = row.published_at.isoformat() if row.published_at else None
    item["preview_cards"] = [{"front_text": c.front_text, "back_text": c.back_text} for c in preview_cards]
    item["recent_ratings"] = [
        {
            "rating":     int(r.rating),
            "comment":    r.comment,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "rater":      {"id": int(r.rater_id), "name": r.rater_name or "", "avatar_url": r.rater_photo},
        }
        for r in recent_ratings
    ]
    return item


# ── Cloning ───────────────────────────────────────────────────────────────────

def _clone_already_response(db: Session, clone_deck_id: int) -> dict:
    row = db.execute(text("SELECT * FROM flashcard_decks WHERE id = :id"), {"id": clone_deck_id}).fetchone()
    result = _deck_row_simple(row)
    result["already_cloned"] = True
    return result


# A study session only ever pulls MAX_NEW_PER_SESSION (10) cards at a time, so a
# freshly-cloned deck only needs this many rows present before the user can start
# practicing. Decks at or under this size clone fully inline; larger decks get this
# many cards inserted synchronously and the remainder finishes in the background so
# the clone request itself doesn't wait on N sequential/bulk inserts.
CLONE_SYNC_BATCH = 30


def _bulk_insert_cloned_cards(db: Session, deck_id: int, cards: list, ef: float, iv: int, now: datetime) -> None:
    """Single multi-row INSERT for a batch of cloned cards — one round trip regardless of batch size."""
    if not cards:
        return
    values_sql = []
    params: dict = {"did": deck_id, "ef": ef, "iv": iv, "now": now}
    for i, c in enumerate(cards):
        values_sql.append(f"(:did, :front_{i}, :back_{i}, :fimg_{i}, :bimg_{i}, :pos_{i}, :ef, :iv, 0, 'new', :now, :now)")
        params[f"front_{i}"] = c.front_text
        params[f"back_{i}"] = c.back_text
        params[f"fimg_{i}"] = c.front_image
        params[f"bimg_{i}"] = c.back_image
        params[f"pos_{i}"] = c.position
    db.execute(
        text(f"""
            INSERT INTO flashcards
                (deck_id, front_text, back_text, front_image, back_image, position,
                 ease_factor, interval_days, repetitions, status, next_review, created_at)
            VALUES {", ".join(values_sql)}
        """),
        params,
    )


def _finish_clone_in_background(new_deck_id: int, remaining_cards: list, ef: float, iv: int, now: datetime) -> None:
    """Runs after the clone response has already been sent. Uses its own DB session
    since the request-scoped session may already be torn down by the time this fires."""
    bg_db = SessionLocal()
    try:
        _bulk_insert_cloned_cards(bg_db, new_deck_id, remaining_cards, ef, iv, now)
        bg_db.commit()
    except Exception as e:
        bg_db.rollback()
        logger.error(f"Background clone card insert failed for deck {new_deck_id}: {e}")
    finally:
        bg_db.close()


@router.post("/public/{deck_id}/clone", status_code=201)
async def clone_public_deck(
    deck_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    original = db.execute(
        text("SELECT * FROM flashcard_decks WHERE id = :id AND is_public = TRUE AND moderation_status = 'approved'"),
        {"id": deck_id},
    ).fetchone()
    if not original:
        raise HTTPException(status_code=404, detail="Deck not found")

    existing = db.execute(
        text("SELECT cloned_deck_id FROM deck_clones WHERE original_deck_id = :id AND cloned_by = :uid"),
        {"id": deck_id, "uid": caller_id},
    ).fetchone()
    if existing:
        return _clone_already_response(db, int(existing.cloned_deck_id))

    _check_rate_limit(db, "clone", caller_id)

    now = datetime.now(UTC)
    cards = db.execute(
        text("""
            SELECT front_text, back_text, front_image, back_image, position
            FROM flashcards WHERE deck_id = :id ORDER BY position, created_at
        """),
        {"id": deck_id},
    ).fetchall()

    new_deck = db.execute(
        text("""
            INSERT INTO flashcard_decks
                (user_id, title, description, color, icon, card_count, mastered_count,
                 cloned_from_deck_id, created_at, updated_at)
            VALUES (:uid, :title, :desc, :color, :icon, :card_count, 0, :orig_id, :now, :now)
            RETURNING *
        """),
        {
            "uid": caller_id, "title": original.title, "desc": original.description,
            "color": original.color, "icon": original.icon, "card_count": len(cards),
            "orig_id": deck_id, "now": now,
        },
    ).fetchone()

    seed_ef, seed_iv = _sm2_seed_for_experience(db, caller_id)
    first_batch = cards[:CLONE_SYNC_BATCH]
    remaining   = cards[CLONE_SYNC_BATCH:]
    _bulk_insert_cloned_cards(db, int(new_deck.id), first_batch, seed_ef, seed_iv, now)

    # ON CONFLICT DO NOTHING guards a double-tap/retry race on the same (deck, user) pair.
    db.execute(
        text("""
            INSERT INTO deck_clones (original_deck_id, cloned_deck_id, cloned_by, created_at)
            VALUES (:orig, :clone, :uid, :now)
            ON CONFLICT (original_deck_id, cloned_by) DO NOTHING
        """),
        {"orig": deck_id, "clone": int(new_deck.id), "uid": caller_id, "now": now},
    )
    winner = db.execute(
        text("SELECT cloned_deck_id FROM deck_clones WHERE original_deck_id = :id AND cloned_by = :uid"),
        {"id": deck_id, "uid": caller_id},
    ).fetchone()

    if int(winner.cloned_deck_id) != int(new_deck.id):
        # Lost the race — another request already registered the canonical clone; discard ours.
        db.execute(text("DELETE FROM flashcard_decks WHERE id = :id"), {"id": int(new_deck.id)})
        db.commit()
        return _clone_already_response(db, int(winner.cloned_deck_id))

    db.execute(text("UPDATE flashcard_decks SET clone_count = clone_count + 1 WHERE id = :id"), {"id": deck_id})
    db.commit()

    # Creator-side milestone bonus only — cloning never grants XP to the cloner.
    await _check_clone_milestones(db, deck_id)

    if remaining:
        background_tasks.add_task(_finish_clone_in_background, int(new_deck.id), remaining, seed_ef, seed_iv, now)

    result = _deck_row_simple(new_deck)
    result["card_count"] = len(cards)
    result["already_cloned"] = False
    return result


# ── Ratings ───────────────────────────────────────────────────────────────────

@router.post("/public/{deck_id}/rate")
async def rate_public_deck(
    deck_id: int,
    body: RateRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    cloned = db.execute(
        text("SELECT 1 FROM deck_clones WHERE original_deck_id = :id AND cloned_by = :uid"),
        {"id": deck_id, "uid": caller_id},
    ).fetchone()
    if not cloned:
        raise HTTPException(status_code=403, detail={
            "success": False,
            "error": {"code": "NOT_CLONED", "details": "Faqat nusxa olingan to'plamlarni baholash mumkin."},
        })

    now = datetime.now(UTC)
    db.execute(
        text("""
            INSERT INTO deck_ratings (deck_id, user_id, rating, comment, created_at, updated_at)
            VALUES (:did, :uid, :rating, :comment, :now, :now)
            ON CONFLICT (deck_id, user_id) DO UPDATE
                SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = :now
        """),
        {"did": deck_id, "uid": caller_id, "rating": body.rating, "comment": body.comment, "now": now},
    )

    summary = db.execute(
        text("""
            UPDATE flashcard_decks SET
                rating_avg   = COALESCE((SELECT AVG(rating)::real FROM deck_ratings WHERE deck_id = :id), 0),
                rating_count = (SELECT COUNT(*) FROM deck_ratings WHERE deck_id = :id)
            WHERE id = :id
            RETURNING rating_avg, rating_count
        """),
        {"id": deck_id},
    ).fetchone()
    db.commit()

    return {
        "rating_avg":   round(float(summary.rating_avg or 0), 2),
        "rating_count": int(summary.rating_count or 0),
        "my_rating":    body.rating,
    }


@router.get("/public/{deck_id}/ratings")
async def list_deck_ratings(
    deck_id: int,
    page:  int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    offset = (page - 1) * limit
    rows = db.execute(
        text("""
            SELECT r.rating, r.comment, r.created_at,
                   p.telegram_id AS rater_id, p.first_name AS rater_name, p.photo_url AS rater_photo
            FROM deck_ratings r
            JOIN profiles p ON p.telegram_id = r.user_id
            WHERE r.deck_id = :id
            ORDER BY r.created_at DESC
            LIMIT :limit OFFSET :offset
        """),
        {"id": deck_id, "limit": limit, "offset": offset},
    ).fetchall()
    total = db.execute(text("SELECT COUNT(*) FROM deck_ratings WHERE deck_id = :id"), {"id": deck_id}).scalar()

    return {
        "ratings": [
            {
                "rating":     int(r.rating),
                "comment":    r.comment,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "rater":      {"id": int(r.rater_id), "name": r.rater_name or "", "avatar_url": r.rater_photo},
            }
            for r in rows
        ],
        "total": int(total or 0),
        "page":  page,
        "limit": limit,
    }


# ── Reporting ─────────────────────────────────────────────────────────────────

@router.post("/public/{deck_id}/report")
async def report_public_deck(
    deck_id: int,
    body: ReportRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    if body.reason not in _REPORT_REASONS:
        raise HTTPException(status_code=400, detail="Invalid reason")

    deck = db.execute(
        text("SELECT id, title FROM flashcard_decks WHERE id = :id AND is_public = TRUE"),
        {"id": deck_id},
    ).fetchone()
    if not deck:
        raise HTTPException(status_code=404, detail="Deck not found")

    _check_rate_limit(db, "report", caller_id)

    now = datetime.now(UTC)
    db.execute(
        text("""
            INSERT INTO deck_reports (deck_id, reported_by, reason, details, created_at)
            VALUES (:did, :uid, :reason, :details, :now)
            ON CONFLICT (deck_id, reported_by) DO NOTHING
        """),
        {"did": deck_id, "uid": caller_id, "reason": body.reason, "details": body.details, "now": now},
    )

    pending_count = db.execute(
        text("SELECT COUNT(DISTINCT reported_by) FROM deck_reports WHERE deck_id = :id AND status = 'pending'"),
        {"id": deck_id},
    ).scalar()

    auto_hidden = False
    if int(pending_count or 0) >= 3:
        result = db.execute(
            text("""
                UPDATE flashcard_decks SET moderation_status = 'pending_review'
                WHERE id = :id AND moderation_status = 'approved'
                RETURNING id
            """),
            {"id": deck_id},
        ).fetchone()
        auto_hidden = result is not None

    db.commit()

    if auto_hidden:
        await _notify_admins("deck_auto_hidden_reports", {
            "deck_id": deck_id, "title": deck.title, "report_count": int(pending_count or 0),
        })

    return {"ok": True}


# ── Sharing (public link resolution, no auth) ──────────────────────────────────

@router.get("/share/{deck_id}")
async def get_share_info(
    deck_id: int,
    db: Session = Depends(get_db),
):
    row = db.execute(
        text("""
            SELECT d.title, d.card_count, d.category, d.badge_type, d.is_anonymous,
                   p.first_name AS creator_name
            FROM flashcard_decks d
            LEFT JOIN profiles p ON p.telegram_id = d.user_id
            WHERE d.id = :id AND d.is_public = TRUE AND d.moderation_status = 'approved'
        """),
        {"id": deck_id},
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Deck not found")

    preview_cards = db.execute(
        text("SELECT front_text, back_text FROM flashcards WHERE deck_id = :id ORDER BY position, created_at LIMIT 3"),
        {"id": deck_id},
    ).fetchall()

    is_official = (row.badge_type == "official")
    creator_name = "Anonim" if (row.is_anonymous or is_official) else (row.creator_name or "Anonim")

    return {
        "title":         row.title,
        "card_count":    int(row.card_count or 0),
        "category":      row.category,
        "creator_name":  creator_name,
        "badge_type":    row.badge_type or "none",
        "preview_cards": [{"front_text": c.front_text, "back_text": c.back_text} for c in preview_cards],
    }


# ── Serialisers ───────────────────────────────────────────────────────────────

def _public_fields(r) -> dict:
    """Public-deck-library fields shared by _deck_row and _deck_row_simple."""
    return {
        "is_anonymous":        bool(getattr(r, "is_anonymous", False)),
        "category":            getattr(r, "category", None),
        "badge_type":          getattr(r, "badge_type", None) or "none",
        "is_featured":         bool(getattr(r, "is_featured", False)),
        "is_verified":         bool(getattr(r, "is_verified", False)),
        "clone_count":         int(getattr(r, "clone_count", 0) or 0),
        "rating_avg":          round(float(getattr(r, "rating_avg", 0) or 0), 2),
        "rating_count":        int(getattr(r, "rating_count", 0) or 0),
        "moderation_status":   getattr(r, "moderation_status", None) or "approved",
        "cloned_from_deck_id": getattr(r, "cloned_from_deck_id", None),
        "published_at":        r.published_at.isoformat() if getattr(r, "published_at", None) else None,
    }


def _deck_row(r) -> dict:
    return {
        "id":             int(r.id),
        "user_id":        int(r.user_id),
        "title":          r.title,
        "description":    r.description,
        "color":          r.color or "#F5A623",
        "icon":           r.icon,
        "card_count":     int(r.card_count or 0),
        "mastered_count": int(r.mastered_count or 0),
        "is_public":      bool(r.is_public),
        "course_id":      r.course_id,
        "due_count":      int(getattr(r, "due_count", 0) or 0),
        "created_at":     r.created_at.isoformat() if r.created_at else None,
        "updated_at":     r.updated_at.isoformat() if r.updated_at else None,
        **_public_fields(r),
    }


def _deck_row_simple(r) -> dict:
    return {
        "id":             int(r.id),
        "user_id":        int(r.user_id),
        "title":          r.title,
        "description":    r.description,
        "color":          r.color or "#F5A623",
        "icon":           r.icon,
        "card_count":     int(r.card_count or 0),
        "mastered_count": int(r.mastered_count or 0),
        "is_public":      bool(r.is_public),
        "course_id":      r.course_id,
        "due_count":      0,
        "created_at":     r.created_at.isoformat() if r.created_at else None,
        "updated_at":     r.updated_at.isoformat() if r.updated_at else None,
        **_public_fields(r),
    }


def _creator_info(r, top_badge: Optional[dict] = None) -> Optional[dict]:
    """None when the deck is anonymous or official (no personal profile to link to)."""
    if r.is_anonymous or r.badge_type == "official":
        return None
    if r.creator_id is None:
        return None
    return {
        "id":         int(r.creator_id),
        "name":       r.creator_name or "",
        "avatar_url": r.creator_photo,
        "top_badge":  top_badge,
    }


def _public_deck_item(r, top_badge_map: Optional[dict] = None) -> dict:
    """Item shape for /public listing endpoints (library card, featured row)."""
    top_badge = (top_badge_map or {}).get(r.creator_id) if r.creator_id is not None else None
    return {
        "id":             int(r.id),
        "title":          r.title,
        "description":    r.description,
        "color":          r.color or "#F5A623",
        "card_count":     int(r.card_count or 0),
        "category":       r.category,
        "badge_type":     r.badge_type or "none",
        "creator":        _creator_info(r, top_badge),
        "clone_count":    int(r.clone_count or 0),
        "rating_avg":     round(float(r.rating_avg or 0), 2),
        "rating_count":   int(r.rating_count or 0),
        "is_featured":    bool(r.is_featured),
        "already_cloned": bool(r.already_cloned),
    }


def _card_row(r) -> dict:
    return {
        "id":            int(r.id),
        "deck_id":       int(r.deck_id),
        "front_text":    r.front_text,
        "back_text":     r.back_text,
        "position":      int(r.position or 0),
        "ease_factor":   float(r.ease_factor or 2.5),
        "interval_days": int(r.interval_days or 0),
        "repetitions":   int(r.repetitions or 0),
        "next_review":   r.next_review.isoformat() if r.next_review else None,
        "last_reviewed": r.last_reviewed.isoformat() if r.last_reviewed else None,
        "status":        r.status or "new",
        "created_at":    r.created_at.isoformat() if r.created_at else None,
    }
