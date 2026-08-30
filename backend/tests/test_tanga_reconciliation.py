"""
test_tanga_reconciliation.py — tanga_reconciliation.py is now DISABLED (see
its module docstring): migration 092 removed the live 1:1 XP-mirror Tanga
grant this job existed to retry, but nobody updated the job, and it was
found live in production re-granting a full, uncapped xp_awarded-as-Tanga
amount for every focus session every 15 minutes ("Tanga on every minute of
study" farming report). These tests pin the fix — a no-op, unconditionally
— so a future "helpful" resurrection of the old query can't reintroduce the
same incident without failing a test first.
"""
import os
from datetime import date

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="DATABASE_URL not set — this integration test needs a real Postgres instance with migration 088 applied",
)

TEST_TELEGRAM_ID = -9_000_000_004


@pytest.fixture
def db_session():
    from app.db.session import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.execute(text("DELETE FROM tanga_transactions WHERE user_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.execute(text("DELETE FROM focus_sessions WHERE user_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.execute(text("DELETE FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.commit()
        session.close()


def _seed_profile(db, tanga_balance: int = 0):
    db.execute(text("""
        INSERT INTO profiles (telegram_id, tanga_balance, total_xp, timezone)
        VALUES (:uid, :bal, :bal, 'Asia/Tashkent')
        ON CONFLICT (telegram_id) DO UPDATE SET tanga_balance = :bal, total_xp = :bal
    """), {"uid": TEST_TELEGRAM_ID, "bal": tanga_balance})
    db.commit()


def _seed_orphan_session(db, minutes: int, xp_awarded: int, age_minutes: int) -> int:
    row = db.execute(text("""
        INSERT INTO focus_sessions (user_id, minutes, xp_awarded, session_date, created_at)
        VALUES (:uid, :min, :xp, CURRENT_DATE, NOW() - make_interval(mins => :age))
        RETURNING id
    """), {"uid": TEST_TELEGRAM_ID, "min": minutes, "xp": xp_awarded, "age": age_minutes}).fetchone()
    db.commit()
    return int(row.id)


def test_reconciliation_never_grants_anything_regardless_of_orphan_sessions(db_session):
    """The core regression pin: even a focus_sessions row that looks exactly
    like the old "orphaned live grant" case (old enough to clear the grace
    window, no matching ledger row) must NOT be granted. This is precisely
    the shape of the row that was being paid out uncapped every 15 minutes."""
    from app.services.tanga_reconciliation import reconcile_missing_study_grants

    _seed_profile(db_session)
    _seed_orphan_session(db_session, minutes=20, xp_awarded=33, age_minutes=10)

    result = reconcile_missing_study_grants(db_session, grace_minutes=5)

    assert result == {"checked": 0, "granted": 0, "failed": 0, "disabled": True}

    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 0, "disabled reconciliation must never move a balance"

    ledger_count = db_session.execute(
        text("SELECT COUNT(*) FROM tanga_transactions WHERE user_id = :uid"), {"uid": TEST_TELEGRAM_ID},
    ).scalar()
    assert ledger_count == 0


def test_find_unreconciled_sessions_always_returns_empty(db_session):
    from app.services.tanga_reconciliation import find_unreconciled_sessions

    _seed_profile(db_session)
    _seed_orphan_session(db_session, minutes=20, xp_awarded=33, age_minutes=10)

    assert find_unreconciled_sessions(db_session, grace_minutes=5) == []
