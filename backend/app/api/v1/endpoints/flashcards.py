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
"""

import asyncio
from datetime import datetime, UTC, timedelta, date as Date
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.services.xp_service import add_xp
from app.api.v1.endpoints.notifications import send_notification
from app.api.v1.endpoints.focus import _check_and_award_challenges

router = APIRouter()

MAX_NEW_PER_SESSION = 10

XP_PER_REVIEW   = 2   # every card reviewed
XP_BONUS_RECALL = 3   # additional when rating >= 3
XP_SESSION_DONE = 15  # completing a full session
XP_MASTERY_CARD = 5   # first time a card reaches mastered
XP_MASTERY_DECK = 50  # 100% deck mastery


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

def _parse_local_date(local_date: Optional[str]) -> Date:
    """Return the client's local calendar date, or UTC today as fallback."""
    if local_date:
        try:
            return Date.fromisoformat(local_date)
        except ValueError:
            pass
    return datetime.now(UTC).date()


class CompleteSessionRequest(BaseModel):
    total_time_ms:  int = Field(..., ge=0)
    cards_reviewed: int = Field(..., ge=0)
    local_date:     Optional[str] = None


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

    # XP only on first review of this card today (subsequent practice = no XP)
    xp_result = {"xp_added": 0}
    total_xp  = 0
    if first_review_today:
        xp_base    = XP_PER_REVIEW
        xp_bonus   = XP_BONUS_RECALL if body.rating >= 3 else 0
        xp_mastery = XP_MASTERY_CARD if newly_mastered else 0
        total_xp   = xp_base + xp_bonus + xp_mastery
        try:
            xp_result = add_xp(db, user_id=caller_id, source="DEEP_WORK", amount=total_xp)
        except Exception:
            pass

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
                pass

    return {
        "ok":            True,
        "new_status":    sm2["status"],
        "next_review":   sm2["next_review"].isoformat() if sm2["next_review"] else None,
        "interval_days": sm2["interval_days"],
        "xp_awarded":    xp_result.get("xp_added", total_xp),
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
    now       = datetime.now(UTC)
    today     = _parse_local_date(body.local_date)
    yesterday = today - timedelta(days=1)

    # Award session XP once per deck per day (sentinel rating=98)
    already_session_xp = db.execute(
        text("""
            SELECT 1 FROM flashcard_reviews
            WHERE user_id = :uid AND deck_id = :did AND rating = 98
              AND DATE(reviewed_at) = CURRENT_DATE
            LIMIT 1
        """),
        {"uid": caller_id, "did": deck_id},
    ).fetchone()

    xp_result = {"xp_added": 0}
    if not already_session_xp:
        try:
            xp_result = add_xp(db, user_id=caller_id, source="DEEP_WORK", amount=XP_SESSION_DONE)
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
            pass

    # Count flashcard study time toward daily goal (1 min = 1 min)
    flash_minutes = max(1, body.total_time_ms // 60_000) if body.total_time_ms > 0 else 1

    # Record a focus_session row so streak + goal logic fires
    db.execute(
        text("""
            INSERT INTO focus_sessions (user_id, minutes, xp_awarded, session_date)
            VALUES (:uid, :min, :xp, :today)
        """),
        {"uid": caller_id, "min": flash_minutes, "xp": xp_result.get("xp_added", 0), "today": today},
    )

    # Update streak — only advance when today's total meets the daily goal
    db.execute(
        text("""
            UPDATE profiles SET
                total_focus_minutes = COALESCE(total_focus_minutes, 0) + :min,
                streak_days = CASE
                    WHEN (
                        SELECT COALESCE(SUM(minutes), 0)
                        FROM focus_sessions
                        WHERE user_id = :uid AND session_date = :today
                    ) >= COALESCE(daily_goal_minutes, 20)
                    THEN
                        CASE
                            WHEN streak_last_date = :today     THEN COALESCE(streak_days, 0)
                            WHEN streak_last_date = :yesterday THEN COALESCE(streak_days, 0) + 1
                            ELSE 1
                        END
                    ELSE COALESCE(streak_days, 0)
                END,
                streak_last_date = CASE
                    WHEN (
                        SELECT COALESCE(SUM(minutes), 0)
                        FROM focus_sessions
                        WHERE user_id = :uid AND session_date = :today
                    ) >= COALESCE(daily_goal_minutes, 20)
                    THEN :today
                    ELSE streak_last_date
                END
            WHERE telegram_id = :uid
        """),
        {"min": flash_minutes, "uid": caller_id, "today": today, "yesterday": yesterday},
    )
    db.commit()

    # Fetch fresh stats for goal-complete check
    stats_row = db.execute(
        text("""
            SELECT
                COALESCE(SUM(minutes) FILTER (WHERE session_date = :today), 0) AS today_minutes,
                COALESCE(streak_days, 0) AS streak_days,
                COALESCE(daily_goal_minutes, 20) AS daily_goal
            FROM focus_sessions fs
            JOIN profiles p ON p.telegram_id = :uid
            WHERE fs.user_id = :uid
            GROUP BY streak_days, daily_goal_minutes
        """),
        {"uid": caller_id, "today": today},
    ).fetchone()

    today_minutes = int(stats_row.today_minutes) if stats_row else flash_minutes
    streak_days   = int(stats_row.streak_days)   if stats_row else 1
    daily_goal    = int(stats_row.daily_goal)     if stats_row else 20
    goal_met      = today_minutes >= daily_goal

    # Check and award streak milestone challenges
    newly_completed = _check_and_award_challenges(db, caller_id, streak_days)
    try:
        db.commit()
    except Exception:
        db.rollback()

    for ch in newly_completed:
        asyncio.create_task(send_notification(
            caller_id, "achievement", category="SYSTEM",
            meta={"challenge_key": ch.get("key", ""), "bonus_xp": ch.get("bonus_xp", 0)},
        ))

    return {
        "ok":                  True,
        "xp_awarded":          xp_result.get("xp_added", XP_SESSION_DONE),
        "flash_minutes":       flash_minutes,
        "today_minutes":       today_minutes,
        "streak_days":         streak_days,
        "goal_met":            goal_met,
        "challenges_completed": newly_completed,
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


# ── Serialisers ───────────────────────────────────────────────────────────────

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
