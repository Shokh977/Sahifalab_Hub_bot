"""
test_freeze_endpoint_idempotency.py — proves apply_freeze()'s atomic guarded
UPDATE (not a lock we're trusting blindly) is what makes a double
application impossible, whether the second attempt comes from a racing
request or an overlapping cron tick.

This repo has no existing test-DB convention, so this test is opt-in: it only
runs against a real Postgres instance, pointed to by the DATABASE_URL env var,
and is skipped with a clear message otherwise. It creates one throwaway
profiles row (a reserved out-of-range telegram_id) and deletes it in a
finally block regardless of outcome — never run this against a database you
care about without knowing what DATABASE_URL points to.
"""
import os
from datetime import date, timedelta

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="DATABASE_URL not set — this integration test needs a real Postgres instance with migration 085 applied",
)

# Deliberately out of realistic Telegram ID range so it can never collide
# with a real user, and is unambiguous to spot/clean up manually if the
# finally block is ever skipped by a hard crash.
TEST_TELEGRAM_ID = -9_000_000_001


@pytest.fixture
def db_session():
    from app.db.session import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.execute(text("DELETE FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.commit()
        session.close()


def test_apply_freeze_second_call_is_a_noop(db_session):
    from app.services.freeze_service import apply_freeze

    today = date.today()
    missed = today - timedelta(days=1)
    last_date = today - timedelta(days=2)

    db_session.execute(text("""
        INSERT INTO profiles (telegram_id, streak_days, streak_last_date, freeze_count, freeze_used_dates, timezone)
        VALUES (:uid, 5, :last_date, 1, '{}', 'Asia/Tashkent')
        ON CONFLICT (telegram_id) DO UPDATE SET
            streak_days = 5, streak_last_date = :last_date, freeze_count = 1, freeze_used_dates = '{}'
    """), {"uid": TEST_TELEGRAM_ID, "last_date": last_date})
    db_session.commit()

    first = apply_freeze(db_session, TEST_TELEGRAM_ID, missed, last_date)
    assert first == 1, "first application should succeed"

    second = apply_freeze(db_session, TEST_TELEGRAM_ID, missed, last_date)
    assert second == 0, "second application (racing request or overlapping cron tick) must be a no-op"

    row = db_session.execute(
        text("SELECT freeze_count, freeze_used_dates FROM profiles WHERE telegram_id = :uid"),
        {"uid": TEST_TELEGRAM_ID},
    ).fetchone()
    assert row.freeze_count == 0, "freeze_count must be decremented exactly once, not twice"
    assert list(row.freeze_used_dates) == [missed], "missed_date must appear exactly once"
