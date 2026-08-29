"""
test_tanga_service.py — proves spend_tanga()/grant_tanga()'s atomic guarded
UPDATE + ledger-in-same-transaction design (088_tanga_currency), mirroring
the style of test_freeze_endpoint_idempotency.py: opt-in against a real
Postgres via DATABASE_URL, reserved out-of-range telegram_id, teardown in a
finally block. A double call proves what a racing request would hit — the
guard is the WHERE clause, not a lock this test pretends to simulate with
threads.
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

TEST_TELEGRAM_ID = -9_000_000_002


@pytest.fixture
def db_session():
    from app.db.session import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.execute(text("DELETE FROM tanga_transactions WHERE user_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.execute(text("DELETE FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.commit()
        session.close()


def _seed_profile(db, tanga_balance: int, total_xp: int):
    db.execute(text("""
        INSERT INTO profiles (telegram_id, tanga_balance, total_xp, timezone)
        VALUES (:uid, :bal, :xp, 'Asia/Tashkent')
        ON CONFLICT (telegram_id) DO UPDATE SET tanga_balance = :bal, total_xp = :xp
    """), {"uid": TEST_TELEGRAM_ID, "bal": tanga_balance, "xp": total_xp})
    db.commit()


def test_spend_tanga_insufficient_balance_is_clean_failure(db_session):
    from app.services.tanga_service import spend_tanga

    _seed_profile(db_session, tanga_balance=50, total_xp=50)
    result = spend_tanga(db_session, TEST_TELEGRAM_ID, amount=100, reason="ai_explanation")

    assert result.ok is False
    assert result.error == "insufficient_balance"

    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 50, "a failed spend must never partially deduct the balance"

    ledger_count = db_session.execute(
        text("SELECT COUNT(*) AS n FROM tanga_transactions WHERE user_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert ledger_count.n == 0, "a failed spend must not write a ledger row"


def test_spend_tanga_idempotent_replay_is_a_noop(db_session):
    from app.services.tanga_service import spend_tanga

    _seed_profile(db_session, tanga_balance=200, total_xp=200)
    key = "test-idem-key-1"

    first = spend_tanga(db_session, TEST_TELEGRAM_ID, amount=100, reason="ai_explanation", idempotency_key=key)
    assert first.ok is True
    assert first.balance == 100

    second = spend_tanga(db_session, TEST_TELEGRAM_ID, amount=100, reason="ai_explanation", idempotency_key=key)
    assert second.ok is True
    assert second.idempotent_replay is True
    assert second.balance == first.balance, "replay must return the original result, not re-apply the delta"

    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 100, "balance must be deducted exactly once across both calls"

    ledger_count = db_session.execute(
        text("SELECT COUNT(*) AS n FROM tanga_transactions WHERE user_id = :uid AND idempotency_key = :k"),
        {"uid": TEST_TELEGRAM_ID, "k": key},
    ).fetchone()
    assert ledger_count.n == 1, "exactly one ledger row per idempotency_key, not one per call"


def test_spend_tanga_double_call_without_key_is_double_spend_by_design(db_session):
    """Sanity check on the boundary of the guarantee: idempotency is opt-in
    via idempotency_key. Two DISTINCT calls with no key are two real spends —
    this is intentional (e.g. two separate AI actions), not a bug."""
    from app.services.tanga_service import spend_tanga

    _seed_profile(db_session, tanga_balance=200, total_xp=200)

    first = spend_tanga(db_session, TEST_TELEGRAM_ID, amount=100, reason="ai_explanation")
    second = spend_tanga(db_session, TEST_TELEGRAM_ID, amount=100, reason="ai_explanation")

    assert first.ok is True and second.ok is True
    assert second.balance == 0


def test_spend_tanga_mirror_phase_a_decrements_total_xp(db_session):
    """Phase A: old client reads total_xp as the spendable balance — every
    spend must mirror a decrement there too, in the SAME UPDATE.

    tanga-economy-rework (092) flips the steady-state default to Phase B
    (see test_spend_tanga_mirror_phase_b_total_xp_never_decreases below,
    superseded by the version gate in app/services/client_version.py for
    the one caller — streaks.py's freeze purchase — that ever needed Phase
    A). This test explicitly sets Phase A to prove the flag still behaves
    correctly if read, then restores the real steady state (B) afterward."""
    from app.services.config_service import invalidate_config_cache
    from app.services.tanga_service import spend_tanga

    _seed_profile(db_session, tanga_balance=300, total_xp=300)
    db_session.execute(text("UPDATE app_config SET value = '\"A\"'::jsonb WHERE key = 'tanga_mirror_mode'"))
    db_session.commit()
    invalidate_config_cache("tanga_mirror_mode")
    try:
        result = spend_tanga(db_session, TEST_TELEGRAM_ID, amount=120, reason="freeze_purchase")

        assert result.ok is True
        row = db_session.execute(
            text("SELECT tanga_balance, total_xp FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
        ).fetchone()
        assert row.tanga_balance == 180
        assert row.total_xp == 180, "Phase A must mirror the spend onto total_xp so the old client is unaffected"
    finally:
        db_session.execute(text("UPDATE app_config SET value = '\"B\"'::jsonb WHERE key = 'tanga_mirror_mode'"))
        db_session.commit()
        invalidate_config_cache("tanga_mirror_mode")


def test_grant_tanga_for_xp_skips_zero_award(db_session):
    """QUIZ's daily cap / COURSE's one-time dedup can make add_xp() return
    xp_added=0 — grant_tanga_for_xp must not grant Tanga for XP that wasn't
    actually awarded."""
    from app.services.tanga_service import grant_tanga_for_xp

    _seed_profile(db_session, tanga_balance=10, total_xp=10)
    result = grant_tanga_for_xp(db_session, TEST_TELEGRAM_ID, {"xp_added": 0}, reason="quiz_complete")

    assert result is None
    row = db_session.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 10


def test_freeze_purchase_extra_guard_blocks_cap_overrun(db_session):
    """The freeze-cap condition folded into spend_tanga's extra_guard_sql
    must be checked atomically alongside the balance — not as a separate
    statement that could race."""
    from app.services.tanga_service import spend_tanga

    _seed_profile(db_session, tanga_balance=1000, total_xp=1000)
    db_session.execute(
        text("UPDATE profiles SET freeze_count = 4 WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    )
    db_session.commit()

    # Requesting 3 more freezes would push freeze_count to 7, over the cap of 5.
    result = spend_tanga(
        db_session, TEST_TELEGRAM_ID, amount=500, reason="freeze_purchase",
        extra_set_sql="freeze_count = COALESCE(freeze_count, 0) + :n",
        extra_guard_sql="COALESCE(freeze_count, 0) + :n <= :cap",
        extra_params={"n": 3, "cap": 5},
    )

    assert result.ok is False
    row = db_session.execute(
        text("SELECT tanga_balance, freeze_count FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
    ).fetchone()
    assert row.tanga_balance == 1000, "balance must be untouched when the extra guard fails"
    assert row.freeze_count == 4


def _ledger_sum(db, user_id: int) -> int:
    row = db.execute(
        text("SELECT COALESCE(SUM(delta), 0) AS s FROM tanga_transactions WHERE user_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    return int(row.s)


def _current_balance(db, user_id: int) -> int:
    row = db.execute(
        text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": user_id}
    ).fetchone()
    return int(row.tanga_balance)


def test_ledger_invariant_holds_after_mixed_operations(db_session):
    """tanga_balance must equal SUM(tanga_transactions.delta) for the user
    after any sequence of grants/spends — this is the core "my Tanga
    disappeared" support/debugging guarantee the ledger exists for."""
    from app.services.tanga_service import grant_tanga, spend_tanga

    # total_xp seeded high (not 0): grant_tanga() never touches total_xp by
    # design (see module docstring — add_xp() owns it exclusively), so
    # Phase A's spend guard on total_xp would otherwise become the binding
    # constraint here and mask the ledger-invariant property this test
    # exists to check. In real usage every earn call site increments both
    # via two separate calls, keeping them roughly in step.
    _seed_profile(db_session, tanga_balance=0, total_xp=1000)

    grant_tanga(db_session, TEST_TELEGRAM_ID, amount=500, reason="welcome_bonus")
    grant_tanga(db_session, TEST_TELEGRAM_ID, amount=50, reason="quiz_complete")
    spend_tanga(db_session, TEST_TELEGRAM_ID, amount=200, reason="freeze_purchase")
    spend_tanga(db_session, TEST_TELEGRAM_ID, amount=1000, reason="ai_explanation")  # insufficient — no-op
    grant_tanga(db_session, TEST_TELEGRAM_ID, amount=25, reason="streak_stage")

    assert _current_balance(db_session, TEST_TELEGRAM_ID) == _ledger_sum(db_session, TEST_TELEGRAM_ID)
    assert _current_balance(db_session, TEST_TELEGRAM_ID) == 375  # 500+50-200+25


def test_spend_tanga_mirror_phase_b_total_xp_never_decreases(db_session):
    """Phase B (flag flipped): spend_tanga must stop touching total_xp
    entirely — it becomes a pure lifetime score from that point forward."""
    from app.services.config_service import invalidate_config_cache
    from app.services.tanga_service import spend_tanga

    _seed_profile(db_session, tanga_balance=300, total_xp=300)
    db_session.execute(text(
        "UPDATE app_config SET value = '\"B\"'::jsonb WHERE key = 'tanga_mirror_mode'"
    ))
    db_session.commit()
    invalidate_config_cache("tanga_mirror_mode")
    try:
        result = spend_tanga(db_session, TEST_TELEGRAM_ID, amount=120, reason="freeze_purchase")
        assert result.ok is True
        row = db_session.execute(
            text("SELECT tanga_balance, total_xp FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID}
        ).fetchone()
        assert row.tanga_balance == 180
        assert row.total_xp == 300, "Phase B: total_xp must never decrease, regardless of spend"
    finally:
        # Restore to B, not A — tanga-economy-rework (092) makes B the real
        # steady state now; leaving it at A here would break whichever test
        # runs next depending on file order (see the Phase A test above).
        db_session.execute(text(
            "UPDATE app_config SET value = '\"B\"'::jsonb WHERE key = 'tanga_mirror_mode'"
        ))
        db_session.commit()
        invalidate_config_cache("tanga_mirror_mode")


def test_concurrent_spends_cannot_overdraw(db_session):
    """Real concurrency, not a mock: two separate DB connections both try to
    spend more than half the balance at the same instant. Exactly one must
    win — the guard is the atomic UPDATE...WHERE, which serializes at the
    database, not at the Python layer."""
    import threading
    from app.db.session import SessionLocal
    from app.services.tanga_service import grant_tanga, spend_tanga

    # Seed via grant_tanga (not a raw UPDATE) so the ledger reflects the
    # FULL balance history — lets the final assertion compare balance to
    # SUM(delta) directly, with no manual "starting offset" bookkeeping.
    _seed_profile(db_session, tanga_balance=0, total_xp=1000)
    grant_tanga(db_session, TEST_TELEGRAM_ID, amount=100, reason="welcome_bonus")

    results = [None, None]
    barrier = threading.Barrier(2)

    def attempt(idx: int):
        session = SessionLocal()
        try:
            barrier.wait(timeout=5)  # maximize actual overlap
            results[idx] = spend_tanga(session, TEST_TELEGRAM_ID, amount=80, reason="ai_flashcard_gen")
        finally:
            session.close()

    threads = [threading.Thread(target=attempt, args=(i,)) for i in range(2)]
    for t in threads: t.start()
    for t in threads: t.join(timeout=10)

    oks = [r for r in results if r is not None and r.ok]
    assert len(oks) == 1, f"exactly one of two concurrent 80-Tanga spends against a 100 balance must succeed, got {results}"

    final_balance = _current_balance(db_session, TEST_TELEGRAM_ID)
    assert final_balance == 20, "balance must reflect exactly one spend, never both (no overdraw)"
    assert final_balance == _ledger_sum(db_session, TEST_TELEGRAM_ID)


def test_transaction_boundary_study_record_survives_grant_failure(db_session, monkeypatch):
    """The exact failure mode of the recent outage, inverted and proven
    closed: force the Tanga grant that follows record_study_activity() to
    fail, and assert the focus_sessions row it wrote is still there,
    unaffected — a gamification side-effect must never roll back the record
    that a user studied."""
    from app.services import study_activity
    from app.services.tanga_service import grant_tanga_for_xp

    _seed_profile(db_session, tanga_balance=0, total_xp=0)

    activity = study_activity.record_study_activity(
        db_session, user_id=TEST_TELEGRAM_ID, minutes=25, source="focus_timer", xp_awarded=42,
        today=date.today(),
    )
    assert activity.session_id is not None

    session_row = db_session.execute(
        text("SELECT id, minutes, xp_awarded FROM focus_sessions WHERE id = :sid"),
        {"sid": activity.session_id},
    ).fetchone()
    assert session_row is not None, "focus_sessions row must exist immediately after record_study_activity()"
    assert session_row.minutes == 25

    def _boom(*args, **kwargs):
        raise RuntimeError("simulated Tanga grant failure — provider/DB blip after the study write already committed")

    monkeypatch.setattr("app.services.tanga_service.grant_tanga", _boom)

    # Mirrors exactly what focus.py does: call grant_tanga_for_xp() after
    # record_study_activity() returns, and never let its failure propagate.
    result = grant_tanga_for_xp(
        db_session, TEST_TELEGRAM_ID, {"xp_added": 42}, reason="focus_timer",
        reference_type="focus_session", reference_id=activity.session_id,
        idempotency_key=f"study_activity:{activity.session_id}",
    )
    assert result is None, "grant_tanga_for_xp must swallow the failure, not raise"

    # The study record must be completely unaffected by the grant failure.
    session_row_after = db_session.execute(
        text("SELECT id, minutes, xp_awarded FROM focus_sessions WHERE id = :sid"),
        {"sid": activity.session_id},
    ).fetchone()
    assert session_row_after is not None, "focus_sessions row must survive a failed Tanga grant"
    assert session_row_after.minutes == 25
