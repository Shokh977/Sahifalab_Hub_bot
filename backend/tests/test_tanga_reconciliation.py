"""
test_tanga_reconciliation.py — proves the reconciliation job
(app/services/tanga_reconciliation.py) finds a focus_sessions row whose live
Tanga grant never happened, grants it exactly once, and never touches a
session that's within its grace window or already reconciled.
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


def test_reconciliation_grants_missing_tanga_for_old_orphan_session(db_session):
    from app.services.tanga_reconciliation import reconcile_missing_study_grants

    _seed_profile(db_session)
    session_id = _seed_orphan_session(db_session, minutes=20, xp_awarded=33, age_minutes=10)

    result = reconcile_missing_study_grants(db_session, grace_minutes=5)

    assert result["checked"] == 1
    assert result["granted"] == 1

    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 33

    ledger = db_session.execute(
        text("SELECT reason, idempotency_key FROM tanga_transactions WHERE user_id = :uid"),
        {"uid": TEST_TELEGRAM_ID},
    ).fetchone()
    assert ledger.reason == "study_activity_reconciled"
    assert ledger.idempotency_key == f"study_activity:{session_id}"


def test_reconciliation_ignores_sessions_within_grace_window(db_session):
    """A session that just committed (its live grant may still be running in
    the original request) must not be double-processed by the job."""
    from app.services.tanga_reconciliation import reconcile_missing_study_grants

    _seed_profile(db_session)
    _seed_orphan_session(db_session, minutes=20, xp_awarded=33, age_minutes=1)

    result = reconcile_missing_study_grants(db_session, grace_minutes=5)

    assert result["checked"] == 0
    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 0


def test_reconciliation_is_idempotent_across_runs(db_session):
    """Running the job twice over the same orphan must not double-grant —
    the second run finds the session already reconciled (via the ledger
    idempotency_key) and skips it."""
    from app.services.tanga_reconciliation import reconcile_missing_study_grants

    _seed_profile(db_session)
    _seed_orphan_session(db_session, minutes=20, xp_awarded=33, age_minutes=10)

    first = reconcile_missing_study_grants(db_session, grace_minutes=5)
    second = reconcile_missing_study_grants(db_session, grace_minutes=5)

    assert first["granted"] == 1
    assert second["checked"] == 0, "an already-reconciled session must not be found as a candidate again"

    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 33, "balance must reflect exactly one grant across two job runs"
