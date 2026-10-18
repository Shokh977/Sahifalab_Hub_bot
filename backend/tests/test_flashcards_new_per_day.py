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


def test_allowance_defaults_to_20_a_day_without_a_limit():
    # Phase 7.5 A1: decks from before Phase 6 (no limit) get 20 new cards per
    # local day, not 10 per session with no daily cap.
    from app.api.v1.endpoints.flashcards import new_card_allowance, DEFAULT_NEW_PER_DAY
    assert DEFAULT_NEW_PER_DAY == 20
    assert new_card_allowance(None, 0) == 20
    assert new_card_allowance(None, 15) == 5
    assert new_card_allowance(None, 50) == 0


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
        s.execute(text("DELETE FROM flashcards WHERE deck_id IN (SELECT id FROM flashcard_decks WHERE user_id = ANY(:u))"), {"u": [USER, OTHER]})
        s.execute(text("DELETE FROM profiles WHERE telegram_id = ANY(:u)"), {"u": [USER, OTHER]})
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


def _card(db, deck_id, status="new", next_review=None):
    return db.execute(text("""
        INSERT INTO flashcards (deck_id, status, next_review) VALUES (:d, :s, :n) RETURNING id
    """), {"d": deck_id, "s": status, "n": next_review}).scalar()


def test_queue_counts_split_reviews_from_new_cards(db):
    """The deck list used to count every never-studied card as due (4 459
    "due" for a fresh 4 459-card deck). Reviews and new cards are now apart,
    and "due" runs to the end of the user's local day."""
    from app.api.v1.endpoints.flashcards import deck_queue_counts, local_day_bounds
    db.execute(text("INSERT INTO profiles (telegram_id, timezone) VALUES (:u, 'Asia/Tashkent')"), {"u": USER})
    deck = db.execute(text("INSERT INTO flashcard_decks (user_id) VALUES (:u) RETURNING id"), {"u": USER}).scalar()
    start, end = local_day_bounds(db, USER)

    for _ in range(5):
        _card(db, deck)                                                       # new
    _card(db, deck, "reviewing", start - timedelta(days=3))                   # overdue
    _card(db, deck, "learning", end - timedelta(minutes=30))                  # due later today
    _card(db, deck, "reviewing", end + timedelta(hours=1))                    # tomorrow
    _card(db, deck, "mastered", start - timedelta(days=1))                    # mastered: never due
    seen_before = _card(db, deck, "learning", end + timedelta(days=2))
    first_today = _card(db, deck, "learning", end + timedelta(days=1))
    _review(db, deck, seen_before, start - timedelta(days=2))
    _review(db, deck, seen_before, start + timedelta(minutes=5))              # re-review: not new today
    _review(db, deck, first_today, start + timedelta(minutes=10))             # introduced today
    db.commit()

    c = deck_queue_counts(db, USER)[deck]
    assert c == {"reviews_due_today": 2, "new_available": 5, "introduced_today": 1}
    assert deck_queue_counts(db, USER, deck)[deck] == c
    assert deck_queue_counts(db, OTHER) == {}


def test_local_day_follows_the_profile_timezone(db):
    from app.api.v1.endpoints.flashcards import local_day_bounds
    db.execute(text("INSERT INTO profiles (telegram_id, timezone) VALUES (:u, 'Asia/Tashkent')"), {"u": USER})
    db.commit()
    start, end = local_day_bounds(db, USER)
    assert end - start == timedelta(days=1)
    # Tashkent is UTC+5: local midnight is 19:00 UTC.
    assert (start.hour, start.minute) == (19, 0)
    assert start <= datetime.now(UTC) < end
