"""
test_flashcards_new_per_day.py — per-deck daily new-card limit (migration
104, redesign Phase 6). The pure allowance rule needs no DB; the counting
queries run against real Postgres via DATABASE_URL (skipped otherwise).
"""
import os
from datetime import datetime, timedelta, UTC

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")
USER = -9_000_000_104
OTHER = -9_000_000_105


def test_allowance_keeps_the_old_rule_without_a_limit():
    from app.api.v1.endpoints.flashcards import new_card_allowance, MAX_NEW_PER_SESSION
    assert new_card_allowance(None, 0) == MAX_NEW_PER_SESSION
    assert new_card_allowance(None, 50) == MAX_NEW_PER_SESSION   # per session, as before


def test_allowance_subtracts_cards_introduced_today():
    from app.api.v1.endpoints.flashcards import new_card_allowance
    assert new_card_allowance(20, 0) == 20
    assert new_card_allowance(20, 12) == 8
    assert new_card_allowance(20, 20) == 0
    assert new_card_allowance(20, 35) == 0


@pytest.fixture
def db():
    if not DATABASE_URL:
        pytest.skip("DATABASE_URL not set")
    from app.db.session import SessionLocal
    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.execute(text("DELETE FROM flashcard_reviews WHERE user_id = ANY(:u)"), {"u": [USER, OTHER]})
        s.execute(text("DELETE FROM flashcard_decks WHERE user_id = ANY(:u)"), {"u": [USER, OTHER]})
        s.commit()
        s.close()


def _review(db, deck_id, card_id, when, user=USER, rating=3):
    db.execute(text("""
        INSERT INTO flashcard_reviews (user_id, card_id, deck_id, rating, reviewed_at)
        VALUES (:u, :c, :d, :r, :t)
    """), {"u": user, "c": card_id, "d": deck_id, "r": rating, "t": when})


def test_introduced_today_counts_first_reviews_only(db):
    from app.api.v1.endpoints.flashcards import introduced_today
    deck = db.execute(text("INSERT INTO flashcard_decks (user_id) VALUES (:u) RETURNING id"), {"u": USER}).scalar()
    now = datetime.now(UTC)
    yesterday = now - timedelta(days=1)

    _review(db, deck, 1, now)            # first seen today
    _review(db, deck, 2, now)            # first seen today
    _review(db, deck, 2, now)            # second review today: still one card
    _review(db, deck, 3, yesterday)      # introduced yesterday…
    _review(db, deck, 3, now)            # …reviewed again today: not new today
    _review(db, deck, 4, now, rating=99) # marker rows don't count
    _review(db, deck, 5, now, user=OTHER)  # someone else's
    db.commit()

    assert introduced_today(db, deck, USER) == 2


def test_deck_limit_reads_none_until_set(db):
    from app.api.v1.endpoints.flashcards import _deck_new_per_day
    deck = db.execute(text("INSERT INTO flashcard_decks (user_id) VALUES (:u) RETURNING id"), {"u": USER}).scalar()
    db.commit()
    assert _deck_new_per_day(db, deck) is None
    db.execute(text("UPDATE flashcard_decks SET new_per_day = 20 WHERE id = :id"), {"id": deck})
    db.commit()
    assert _deck_new_per_day(db, deck) == 20
