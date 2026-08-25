"""
test_ai_limiter.py — proves the dual-gate limiter (089_ai_infrastructure,
spec Part 5): free allowance exhaustion falls through to a Tanga charge,
the hard daily cap blocks regardless of balance, and refund() reverses a
charge without double-writing the ledger. Same opt-in-against-real-Postgres
convention as test_tanga_service.py.
"""
import os
from datetime import date

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="DATABASE_URL not set — this integration test needs a real Postgres instance with migration 089 applied",
)

TEST_TELEGRAM_ID = -9_000_000_003


@pytest.fixture
def db_session():
    from app.db.session import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.execute(text("DELETE FROM tanga_transactions WHERE user_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.execute(text("DELETE FROM ai_daily_usage WHERE user_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.execute(text("DELETE FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.commit()
        session.close()


def _seed_profile(db, tanga_balance: int):
    db.execute(text("""
        INSERT INTO profiles (telegram_id, tanga_balance, total_xp, timezone)
        VALUES (:uid, :bal, :bal, 'Asia/Tashkent')
        ON CONFLICT (telegram_id) DO UPDATE SET tanga_balance = :bal, total_xp = :bal
    """), {"uid": TEST_TELEGRAM_ID, "bal": tanga_balance})
    db.commit()


def _set_gate_config(db, free_daily_allowance=2, hard_daily_cap=3, prices=None):
    import json
    value = json.dumps({
        "free_daily_allowance": free_daily_allowance,
        "hard_daily_cap": hard_daily_cap,
        "global_daily_ceiling_tanga": 1_000_000,
        "prices": prices or {"explanation": 25},
    })
    db.execute(text("""
        INSERT INTO app_config (key, value) VALUES ('ai_dual_gate', CAST(:v AS jsonb))
        ON CONFLICT (key) DO UPDATE SET value = CAST(:v AS jsonb)
    """), {"v": value})
    db.commit()
    from app.services.config_service import invalidate_config_cache
    invalidate_config_cache("ai_dual_gate")


def test_free_allowance_exhausts_then_charges_tanga(db_session):
    from app.services.ai import limiter

    _seed_profile(db_session, tanga_balance=1000)
    _set_gate_config(db_session, free_daily_allowance=2, hard_daily_cap=10, prices={"explanation": 25})

    first  = limiter.check_and_charge(db_session, TEST_TELEGRAM_ID, "explanation", "a1")
    second = limiter.check_and_charge(db_session, TEST_TELEGRAM_ID, "explanation", "a2")
    third  = limiter.check_and_charge(db_session, TEST_TELEGRAM_ID, "explanation", "a3")

    assert first.allowed and not first.charged_tanga
    assert second.allowed and not second.charged_tanga
    assert third.allowed and third.charged_tanga and third.tanga_spent == 25

    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 975


def test_hard_daily_cap_blocks_regardless_of_balance(db_session):
    from app.services.ai import limiter

    _seed_profile(db_session, tanga_balance=1_000_000)
    _set_gate_config(db_session, free_daily_allowance=1, hard_daily_cap=2, prices={"explanation": 10})

    r1 = limiter.check_and_charge(db_session, TEST_TELEGRAM_ID, "explanation", "b1")
    r2 = limiter.check_and_charge(db_session, TEST_TELEGRAM_ID, "explanation", "b2")
    r3 = limiter.check_and_charge(db_session, TEST_TELEGRAM_ID, "explanation", "b3")

    assert r1.allowed and r2.allowed
    assert not r3.allowed
    assert r3.reason == "daily_cap_reached", "a huge balance must not bypass the hard cap"


def test_refund_reverses_a_charged_action(db_session):
    from app.services.ai import limiter

    _seed_profile(db_session, tanga_balance=100)
    _set_gate_config(db_session, free_daily_allowance=0, hard_daily_cap=10, prices={"explanation": 40})

    result = limiter.check_and_charge(db_session, TEST_TELEGRAM_ID, "explanation", "c1")
    assert result.allowed and result.charged_tanga and result.tanga_spent == 40

    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 60, "balance must be deducted before the (simulated) AI call runs"

    limiter.refund(db_session, TEST_TELEGRAM_ID, "explanation", "c1", result.tanga_spent)

    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 100, "a failed call must be fully refunded — never charge for a failed call"


def test_refund_is_idempotent_exactly_once(db_session):
    """A retried refund (e.g. the caller's error-handling path runs twice
    for the same failed call) must restore the balance exactly once, not
    accumulate — refund() rides grant_tanga()'s idempotency_key guard."""
    from app.services.ai import limiter

    _seed_profile(db_session, tanga_balance=100)
    _set_gate_config(db_session, free_daily_allowance=0, hard_daily_cap=10, prices={"explanation": 40})

    result = limiter.check_and_charge(db_session, TEST_TELEGRAM_ID, "explanation", "e1")
    assert result.allowed and result.tanga_spent == 40

    limiter.refund(db_session, TEST_TELEGRAM_ID, "explanation", "e1", result.tanga_spent)
    limiter.refund(db_session, TEST_TELEGRAM_ID, "explanation", "e1", result.tanga_spent)
    limiter.refund(db_session, TEST_TELEGRAM_ID, "explanation", "e1", result.tanga_spent)

    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 100, "three refund calls for the same action must not over-credit"

    ledger_count = db_session.execute(
        text("SELECT COUNT(*) AS n FROM tanga_transactions WHERE user_id = :uid AND reason = 'ai_refund'"),
        {"uid": TEST_TELEGRAM_ID},
    ).fetchone()
    assert ledger_count.n == 1, "exactly one refund ledger row, regardless of how many times refund() was called"


def test_insufficient_balance_past_free_allowance_is_clean_failure(db_session):
    from app.services.ai import limiter

    _seed_profile(db_session, tanga_balance=5)
    _set_gate_config(db_session, free_daily_allowance=0, hard_daily_cap=10, prices={"explanation": 25})

    result = limiter.check_and_charge(db_session, TEST_TELEGRAM_ID, "explanation", "d1")

    assert not result.allowed
    assert result.reason == "insufficient_balance"
    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 5, "a rejected charge must never touch the balance"
