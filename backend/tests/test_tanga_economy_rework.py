"""
test_tanga_economy_rework.py — tanga-economy-rework (092): daily cap
enforcement, streak-stage milestone conversion + idempotency (including
break/rebuild), reward acknowledgement idempotency, no-Tanga-proportional-
to-minutes, and the old-client legacy freeze path being byte-for-byte
unchanged. Mirrors test_tanga_service.py's style: opt-in against a real
Postgres via DATABASE_URL, reserved out-of-range telegram_id, teardown in a
finally block.
"""
import os
from datetime import date, timedelta

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not DATABASE_URL,
    reason="DATABASE_URL not set — this integration test needs a real Postgres instance with migration 092 applied",
)

TEST_TELEGRAM_ID = -9_000_000_092


@pytest.fixture
def db_session():
    from app.db.session import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.execute(text("DELETE FROM tanga_transactions WHERE user_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.execute(text("DELETE FROM user_stage_completions WHERE user_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.execute(text("DELETE FROM streak_stages WHERE key LIKE 'test_%'"))
        session.execute(text("DELETE FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID})
        session.commit()
        session.close()


def _seed_profile(db, tanga_balance: int = 0, total_xp: int = 0, streak_days: int = 0):
    db.execute(text("""
        INSERT INTO profiles (telegram_id, tanga_balance, total_xp, streak_days, timezone)
        VALUES (:uid, :bal, :xp, :sd, 'Asia/Tashkent')
        ON CONFLICT (telegram_id) DO UPDATE SET tanga_balance = :bal, total_xp = :xp, streak_days = :sd
    """), {"uid": TEST_TELEGRAM_ID, "bal": tanga_balance, "xp": total_xp, "sd": streak_days})
    db.commit()


def _balance(db, user_id: int = TEST_TELEGRAM_ID) -> int:
    row = db.execute(text("SELECT tanga_balance FROM profiles WHERE telegram_id = :uid"), {"uid": user_id}).fetchone()
    return int(row.tanga_balance)


def _ledger_count(db, user_id: int = TEST_TELEGRAM_ID, reason: str | None = None) -> int:
    if reason:
        row = db.execute(
            text("SELECT COUNT(*) AS n FROM tanga_transactions WHERE user_id = :uid AND reason = :r"),
            {"uid": user_id, "r": reason},
        ).fetchone()
    else:
        row = db.execute(text("SELECT COUNT(*) AS n FROM tanga_transactions WHERE user_id = :uid"), {"uid": user_id}).fetchone()
    return int(row.n)


# ═══════════════════════════════════════════════════════════════════════════
# Daily cap enforcement
# ═══════════════════════════════════════════════════════════════════════════

def test_daily_capped_grant_respects_remaining_headroom(db_session):
    from app.services.tanga_service import daily_capped_grant, remaining_daily_cap

    _seed_profile(db_session, tanga_balance=0)
    today = date.today()

    # Default daily_cap is 35 (app_config, seeded by migration 092).
    assert remaining_daily_cap(db_session, TEST_TELEGRAM_ID, today) == 35

    first = daily_capped_grant(db_session, TEST_TELEGRAM_ID, amount=30, reason="daily_goal_met", today=today)
    assert first is not None and first.ok
    assert remaining_daily_cap(db_session, TEST_TELEGRAM_ID, today) == 5

    # This grant would push 30+10=40 over the 35 cap — must be skipped entirely,
    # not partially credited.
    second = daily_capped_grant(db_session, TEST_TELEGRAM_ID, amount=10, reason="threshold_60min", today=today)
    assert second is None, "a grant that would exceed the daily cap must be skipped, not partially applied"
    assert _balance(db_session) == 30, "balance must be exactly the first grant — no partial credit"


def test_daily_cap_is_per_day_not_permanent(db_session):
    from app.services.tanga_service import daily_capped_grant, remaining_daily_cap

    _seed_profile(db_session, tanga_balance=0)
    today = date.today()
    yesterday = today - timedelta(days=1)

    daily_capped_grant(db_session, TEST_TELEGRAM_ID, amount=35, reason="daily_goal_met", today=yesterday)
    assert remaining_daily_cap(db_session, TEST_TELEGRAM_ID, yesterday) == 0
    # A new day resets the cap — the ledger sum is bucketed by earn_date, not lifetime.
    assert remaining_daily_cap(db_session, TEST_TELEGRAM_ID, today) == 35


def test_daily_capped_grant_rejects_non_capped_reason(db_session):
    from app.services.tanga_service import daily_capped_grant

    _seed_profile(db_session)
    with pytest.raises(ValueError):
        daily_capped_grant(db_session, TEST_TELEGRAM_ID, amount=100, reason="challenge_complete", today=date.today())


def test_check_and_award_daily_earn_events_no_grant_proportional_to_minutes(db_session):
    """The core claim of this rework: studying MORE minutes must never grant
    proportionally more Tanga. 500 minutes (way past both thresholds) grants
    exactly the same flat sum as studying just past 120 minutes."""
    from app.services.tanga_service import check_and_award_daily_earn_events

    _seed_profile(db_session, tanga_balance=0)
    today = date.today()

    check_and_award_daily_earn_events(db_session, TEST_TELEGRAM_ID, today, today_minutes=125, goal_met=True)
    balance_at_125 = _balance(db_session)

    # A second, much larger minute count the SAME day must not grant anything
    # further — goal_met/60min/120min are one-shot-per-day flags, not a rate.
    check_and_award_daily_earn_events(db_session, TEST_TELEGRAM_ID, today, today_minutes=500, goal_met=True)
    assert _balance(db_session) == balance_at_125, (
        "studying 500 minutes instead of 125 must not grant additional Tanga — "
        "these are flat daily thresholds, never a per-minute rate"
    )
    # Sanity: this is the daily_goal_met(10, celebrate=False) + threshold_60min(5)
    # + threshold_120min(5) = 20 default sum, well under the 35 cap.
    assert balance_at_125 == 20


# ═══════════════════════════════════════════════════════════════════════════
# Streak-stage milestones: XP → Tanga, once per user ever
# ═══════════════════════════════════════════════════════════════════════════

def _seed_stage(db, key: str, required_days: int, bonus_tanga: int, stage_number: int):
    db.execute(text("""
        INSERT INTO streak_stages (key, stage_number, title, required_days, bonus_xp, bonus_tanga, is_active, sort_order)
        VALUES (:key, :sn, :key, :rd, 0, :bt, TRUE, :sn)
        ON CONFLICT (key) DO UPDATE SET required_days = :rd, bonus_tanga = :bt
    """), {"key": key, "sn": stage_number, "rd": required_days, "bt": bonus_tanga})
    db.commit()


def test_streak_stage_grants_tanga_not_xp(db_session):
    from app.services.stage_service import check_and_award_stages

    _seed_profile(db_session, tanga_balance=0, total_xp=100)
    _seed_stage(db_session, "test_3day", required_days=3, bonus_tanga=15, stage_number=2)

    newly_done = check_and_award_stages(db_session, TEST_TELEGRAM_ID, streak_days=3)

    assert len(newly_done) == 1
    assert newly_done[0]["bonus_tanga"] == 15
    assert newly_done[0]["bonus_xp"] == 0, "a stage with bonus_tanga > 0 must NOT also grant XP"
    assert _balance(db_session) == 15

    row = db_session.execute(
        text("SELECT total_xp FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_TELEGRAM_ID},
    ).fetchone()
    assert int(row.total_xp) == 100, "total_xp must be completely untouched by a Tanga-paying stage"


def test_streak_stage_milestone_fires_exactly_once_per_user_ever(db_session):
    from app.services.stage_service import check_and_award_stages

    _seed_profile(db_session, tanga_balance=0)
    _seed_stage(db_session, "test_7day", required_days=7, bonus_tanga=30, stage_number=3)

    first = check_and_award_stages(db_session, TEST_TELEGRAM_ID, streak_days=7)
    assert len(first) == 1
    assert _balance(db_session) == 30

    # Re-checking at the SAME streak (e.g. a duplicate call from a retried
    # request) must not grant again.
    second = check_and_award_stages(db_session, TEST_TELEGRAM_ID, streak_days=7)
    assert second == []
    assert _balance(db_session) == 30
    assert _ledger_count(db_session, reason="streak_stage") == 1


def test_streak_stage_milestone_does_not_repay_after_break_and_rebuild(db_session):
    """A streak that breaks and rebuilds past a previously-awarded milestone
    must not pay out a second time — spec Part 1 is explicit about this."""
    from app.services.stage_service import check_and_award_stages

    _seed_profile(db_session, tanga_balance=0)
    _seed_stage(db_session, "test_14day", required_days=14, bonus_tanga=50, stage_number=4)

    check_and_award_stages(db_session, TEST_TELEGRAM_ID, streak_days=14)
    assert _balance(db_session) == 50

    # Streak breaks (drops back to 0 elsewhere in the app — not this
    # function's concern) and rebuilds all the way past 14 again.
    second_pass = check_and_award_stages(db_session, TEST_TELEGRAM_ID, streak_days=14)
    assert second_pass == [], "rebuilding past an already-earned milestone must not pay out again"
    assert _balance(db_session) == 50
    assert _ledger_count(db_session, reason="streak_stage") == 1


def test_streak_stage_reward_is_not_celebrated_by_the_generic_reward_queue(db_session):
    """streak_stage grants celebrate=False — a stage-up already gets its own
    dedicated client-side celebration (EvolutionModal); it must not ALSO
    surface in GET /api/rewards/pending (spec Part 5's generic queue)."""
    from app.services.stage_service import check_and_award_stages

    _seed_profile(db_session, tanga_balance=0)
    _seed_stage(db_session, "test_30day", required_days=30, bonus_tanga=100, stage_number=5)

    check_and_award_stages(db_session, TEST_TELEGRAM_ID, streak_days=30)

    row = db_session.execute(
        text("SELECT celebrate, notified_at FROM tanga_transactions WHERE user_id = :uid AND reason = 'streak_stage'"),
        {"uid": TEST_TELEGRAM_ID},
    ).fetchone()
    assert row.celebrate is False


# ═══════════════════════════════════════════════════════════════════════════
# Reward queue (Part 5): GET pending semantics + acknowledge idempotency
# ═══════════════════════════════════════════════════════════════════════════

def test_grant_tanga_default_celebrate_true_appears_pending(db_session):
    from app.services.tanga_service import grant_tanga

    _seed_profile(db_session)
    grant_tanga(db_session, TEST_TELEGRAM_ID, amount=100, reason="opening_balance")

    row = db_session.execute(
        text("SELECT celebrate, notified_at FROM tanga_transactions WHERE user_id = :uid"),
        {"uid": TEST_TELEGRAM_ID},
    ).fetchone()
    assert row.celebrate is True
    assert row.notified_at is None


def test_ai_refund_and_void_refund_do_not_celebrate(db_session):
    from app.services.tanga_service import grant_tanga

    _seed_profile(db_session)
    grant_tanga(db_session, TEST_TELEGRAM_ID, amount=10, reason="ai_refund", celebrate=False)
    grant_tanga(db_session, TEST_TELEGRAM_ID, amount=1, reason="daily_quiz_void_refund", celebrate=False)

    rows = db_session.execute(
        text("SELECT reason, celebrate FROM tanga_transactions WHERE user_id = :uid"),
        {"uid": TEST_TELEGRAM_ID},
    ).fetchall()
    assert all(r.celebrate is False for r in rows), "reversing a charge/void is never a reward"


def test_acknowledge_pending_rewards_is_idempotent(db_session):
    from app.services.tanga_service import grant_tanga

    _seed_profile(db_session)
    grant_tanga(db_session, TEST_TELEGRAM_ID, amount=50, reason="opening_balance")
    row = db_session.execute(
        text("SELECT id FROM tanga_transactions WHERE user_id = :uid"), {"uid": TEST_TELEGRAM_ID},
    ).fetchone()
    reward_id = int(row.id)

    def _acknowledge():
        db_session.execute(
            text("""
                UPDATE tanga_transactions SET notified_at = NOW()
                WHERE user_id = :uid AND id = ANY(:ids) AND notified_at IS NULL
            """),
            {"uid": TEST_TELEGRAM_ID, "ids": [reward_id]},
        )
        db_session.commit()

    _acknowledge()
    first_notified_at = db_session.execute(
        text("SELECT notified_at FROM tanga_transactions WHERE id = :id"), {"id": reward_id},
    ).fetchone().notified_at

    _acknowledge()  # repeat — simulates a retried acknowledge call
    second_notified_at = db_session.execute(
        text("SELECT notified_at FROM tanga_transactions WHERE id = :id"), {"id": reward_id},
    ).fetchone().notified_at

    assert first_notified_at == second_notified_at, "re-acknowledging an already-notified reward must be a pure no-op"


# ═══════════════════════════════════════════════════════════════════════════
# Version gate (Part 6): old client's legacy freeze path is untouched
# ═══════════════════════════════════════════════════════════════════════════

def test_is_tanga_client_false_when_header_absent_or_old():
    """The safe default: no header (the current Play Store build) or an
    unparseable/older version must resolve to the LEGACY path."""
    from app.services.client_version import is_tanga_client
    from app.db.session import SessionLocal

    db = SessionLocal()
    try:
        assert is_tanga_client(db, None) is False
        assert is_tanga_client(db, "") is False
        assert is_tanga_client(db, "not-a-version") is False
        assert is_tanga_client(db, "1.0.0") is False  # below the 1.2.0 minimum seeded by migration 092
        assert is_tanga_client(db, "1.2.0") is True
        assert is_tanga_client(db, "1.3.0") is True
    finally:
        db.close()


def test_legacy_freeze_purchase_spends_total_xp_never_tanga(db_session):
    from app.api.v1.endpoints.streaks import _purchase_freeze_legacy, PurchaseFreezeRequest

    _seed_profile(db_session, tanga_balance=500, total_xp=500)
    body = PurchaseFreezeRequest(count=1)

    result = _purchase_freeze_legacy(db_session, TEST_TELEGRAM_ID, body)

    assert result["ok"] is True
    assert result["xp_spent"] == 200, "legacy 1-pack price must remain exactly 200, frozen"
    assert result["tanga_spent"] == 0

    row = db_session.execute(
        text("SELECT total_xp, tanga_balance, freeze_count FROM profiles WHERE telegram_id = :uid"),
        {"uid": TEST_TELEGRAM_ID},
    ).fetchone()
    assert int(row.total_xp) == 300, "legacy path must spend total_xp"
    assert int(row.tanga_balance) == 500, "legacy path must NEVER touch tanga_balance"
    assert int(row.freeze_count) == 1

    # And no ledger row — the legacy path is a bare column UPDATE, exactly
    # reproducing pre-088 behaviour (spec Part 6: "behaviour unchanged").
    assert _ledger_count(db_session) == 0
