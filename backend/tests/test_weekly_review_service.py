"""
test_weekly_review_service.py — weekly review timing rework: every user
gets their review on THEIR OWN local Monday at 7am+ (profiles.timezone),
not a single shared UTC instant and not staggered across different
weekdays by telegram_id % 7 anymore.

The SQL-vs-Python cross-check below is deliberately NOT time-hardcoded —
asserting "these specific timezones are due right now" would be flaky
depending on when the suite happens to run. Instead it asserts the raw SQL
condition in run_staggered_batch's WHERE clause always agrees with the same
decision computed via user_time.py's already-unit-tested pure functions,
for a spread of real IANA zones, regardless of the actual wall-clock time.
"""
import os
from datetime import date

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")

TEST_BASE_ID = -9_000_000_140

ZONES = [
    "Asia/Tashkent", "Asia/Seoul", "Pacific/Kiritimati", "Pacific/Midway",
    "America/Los_Angeles", "Etc/GMT+12", "Europe/London", "Asia/Kolkata",
    "Pacific/Auckland", "America/Sao_Paulo",
]


@pytest.fixture
def db_session():
    if not DATABASE_URL:
        pytest.skip("DATABASE_URL not set")
    from app.db.session import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        # Covers the ZONES-indexed ids (0..len(ZONES)-1) AND the individual
        # tests' fixed offsets (100-109) — each test uses a distinct offset
        # so there's no intra-run collision, but every id used anywhere in
        # this file must be cleaned up here regardless.
        ids = [TEST_BASE_ID - i for i in range(len(ZONES) + 2)] + [TEST_BASE_ID - i for i in range(100, 110)]
        session.execute(text("DELETE FROM weekly_reviews WHERE user_id = ANY(:ids)"), {"ids": ids})
        session.execute(text("DELETE FROM focus_sessions WHERE user_id = ANY(:ids)"), {"ids": ids})
        session.execute(text("DELETE FROM profiles WHERE telegram_id = ANY(:ids)"), {"ids": ids})
        session.commit()
        session.close()


def test_sql_local_monday_7am_condition_matches_python_user_time_semantics(db_session):
    """run_staggered_batch's raw SQL (EXTRACT(ISODOW...)=1 AND
    EXTRACT(HOUR...)>=7) must decide "is this user due" identically to
    user_time.py's user_local_date()/user_local_hour() pure functions, for
    every zone tested — no off-by-one in the ISODOW->Python-weekday
    conversion, no mismatch in how "local" is computed."""
    from app.services.user_time import user_local_date, user_local_hour

    ids_by_zone = {}
    for i, tz in enumerate(ZONES):
        uid = TEST_BASE_ID - i
        ids_by_zone[tz] = uid
        db_session.execute(
            text("INSERT INTO profiles (telegram_id, status, timezone) VALUES (:uid, 'active', :tz)"),
            {"uid": uid, "tz": tz},
        )
    db_session.commit()

    rows = db_session.execute(
        text("""
            SELECT telegram_id FROM profiles
            WHERE telegram_id = ANY(:ids)
              AND EXTRACT(ISODOW FROM (NOW() AT TIME ZONE COALESCE(timezone, 'Asia/Tashkent'))) = 1
              AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(timezone, 'Asia/Tashkent'))) >= 7
        """),
        {"ids": list(ids_by_zone.values())},
    ).fetchall()
    sql_due = {int(r.telegram_id) for r in rows}

    python_due = {
        uid for tz, uid in ids_by_zone.items()
        if user_local_date(tz).weekday() == 0 and user_local_hour(tz) >= 7
    }

    assert sql_due == python_due, (
        f"SQL and Python disagree on who's due — SQL said {sql_due}, Python said {python_due}"
    )


def test_run_staggered_batch_finds_candidates_without_error(db_session):
    """Smoke test: the query itself must run cleanly against real profile
    rows (COALESCE fallback, casts, etc.) regardless of whether anyone is
    actually due right now."""
    import asyncio
    from app.services.weekly_review_service import run_staggered_batch

    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone) VALUES (:uid, 'active', 'Asia/Tashkent')"),
        {"uid": TEST_BASE_ID - 100},
    )
    db_session.commit()

    result = asyncio.run(run_staggered_batch(db_session, max_users=10))
    assert "candidates" in result and "generated" in result and "skipped" in result


def test_generate_weekly_review_skips_users_with_zero_activity(db_session):
    """No focus minutes and no flashcard reviews -> skipped, no row
    inserted, no AI call attempted (this must never spend a Gemini call on
    silence)."""
    import asyncio
    from app.services.weekly_review_service import generate_weekly_review

    uid = TEST_BASE_ID - 101
    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone) VALUES (:uid, 'active', 'Asia/Tashkent')"),
        {"uid": uid},
    )
    db_session.commit()

    ok = asyncio.run(generate_weekly_review(db_session, uid, date.today()))
    assert ok is False

    row = db_session.execute(text("SELECT 1 FROM weekly_reviews WHERE user_id = :uid"), {"uid": uid}).fetchone()
    assert row is None


def test_generate_weekly_review_is_idempotent_per_week(db_session):
    """A row already existing for this week_start -> skipped immediately,
    never re-generated (and never re-spends an AI call)."""
    import asyncio
    import json
    from app.services.weekly_review_service import generate_weekly_review, _week_start

    uid = TEST_BASE_ID - 102
    today = date.today()
    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone) VALUES (:uid, 'active', 'Asia/Tashkent')"),
        {"uid": uid},
    )
    db_session.execute(
        text("""
            INSERT INTO weekly_reviews (user_id, week_start, content)
            VALUES (:uid, :ws, CAST(:content AS jsonb))
        """),
        {"uid": uid, "ws": _week_start(today), "content": json.dumps({"already": "here"})},
    )
    db_session.commit()

    ok = asyncio.run(generate_weekly_review(db_session, uid, today))
    assert ok is False

    count = db_session.execute(text("SELECT COUNT(*) FROM weekly_reviews WHERE user_id = :uid"), {"uid": uid}).scalar()
    assert count == 1


def test_week_start_returns_last_completed_week_not_this_week():
    """Regression for a real bug the timing rework exposed: since the batch
    now only ever calls generate_weekly_review on the user's own local
    Monday, _week_start(today) must return LAST week's Monday (the week
    that just ended), never "today" itself — a review generated the same
    morning a new week starts must summarize the completed week, not the
    few hours since midnight. Checked for every weekday, not just Monday,
    since the formula must stay correct even if called off-schedule."""
    from app.services.weekly_review_service import _week_start
    from datetime import timedelta

    monday = date(2026, 8, 31)  # a known real Monday
    assert monday.weekday() == 0
    for offset in range(7):
        today = monday + timedelta(days=offset)
        result = _week_start(today)
        assert result == monday - timedelta(days=7), (
            f"for today={today} ({today.strftime('%A')}), expected last week's Monday "
            f"{monday - timedelta(days=7)}, got {result}"
        )


def test_gather_user_stats_excludes_activity_outside_the_reviewed_week(db_session):
    """Regression: this_week_minutes/days_active/week_xp/etc. used to have
    no upper bound, so a review generated Monday morning for LAST week
    would silently include today's (the NEW week's) activity too. A
    session inside the reviewed week must count; one the day after the
    reviewed week ends (i.e. in the following week) must not."""
    from app.services.weekly_review_service import gather_user_stats

    uid = TEST_BASE_ID - 103
    week_start = date(2026, 8, 17)   # a Monday
    week_end_exclusive = date(2026, 8, 24)  # the following Monday
    today = date(2026, 8, 24)  # the day the review is generated (next Monday)

    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone, daily_goal_minutes) VALUES (:uid, 'active', 'Asia/Tashkent', 20)"),
        {"uid": uid},
    )
    # Inside the reviewed week — must count.
    db_session.execute(
        text("INSERT INTO focus_sessions (user_id, minutes, session_date) VALUES (:uid, 30, :d)"),
        {"uid": uid, "d": week_start},
    )
    # The day the NEW week starts — must NOT count toward the reviewed week.
    db_session.execute(
        text("INSERT INTO focus_sessions (user_id, minutes, session_date) VALUES (:uid, 999, :d)"),
        {"uid": uid, "d": week_end_exclusive},
    )
    db_session.commit()

    stats = gather_user_stats(db_session, uid, week_start, today)
    assert stats["week_start"] == week_start.isoformat()
    assert stats["this_week_minutes"] == 30, "must exclude the session dated the day the following week starts"
    assert stats["days_active"] == 1
