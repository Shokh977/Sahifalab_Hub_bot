"""
test_focus_endpoints.py — regression coverage for GET /api/focus/stats and
GET /api/focus/weekly, which both threw an unconditional NameError
(`_parse_local_date` was removed from study_activity.py by the day-bucket
rework in commit cf0a68a but two call sites in focus.py were never updated)
— a live production 500 on every call, silently swallowed by the mobile
client into hardcoded zero stats (see focusStats.get()'s .catch() in
sahifalab-app/lib/api.ts). These tests call the endpoint functions directly
(bypassing FastAPI's dependency injection, same pattern as
test_daily_quiz_service.py's direct service-function calls) so a future
regression of this exact class of bug (a stray reference to a removed
helper) fails a test instead of reaching production silently.
"""
import asyncio
import os
from datetime import date, timedelta

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")

TEST_USER = -9_000_000_120


@pytest.fixture
def db_session():
    if not DATABASE_URL:
        pytest.skip("DATABASE_URL not set")
    from app.db.session import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.execute(text("DELETE FROM focus_sessions WHERE user_id = :uid"), {"uid": TEST_USER})
        session.execute(text("DELETE FROM user_day_bucket_log WHERE user_id = :uid"), {"uid": TEST_USER})
        session.execute(text("DELETE FROM local_date_divergence_log WHERE user_id = :uid"), {"uid": TEST_USER})
        session.execute(text("DELETE FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_USER})
        session.commit()
        session.close()


def _seed(db, today: date, minutes: int = 25):
    db.execute(text("""
        INSERT INTO profiles (telegram_id, streak_days, daily_goal_minutes, total_focus_minutes, timezone)
        VALUES (:uid, 3, 20, 100, 'Asia/Tashkent')
        ON CONFLICT (telegram_id) DO UPDATE
            SET streak_days = 3, daily_goal_minutes = 20, total_focus_minutes = 100, timezone = 'Asia/Tashkent'
    """), {"uid": TEST_USER})
    db.execute(text("""
        INSERT INTO focus_sessions (user_id, minutes, session_date) VALUES (:uid, :m, :d)
    """), {"uid": TEST_USER, "m": minutes, "d": today})
    db.commit()


def test_get_focus_stats_does_not_crash_and_returns_todays_minutes(db_session):
    """Direct regression test: this endpoint threw NameError on every call
    before the fix. today_minutes/daily_goal/streak_days are exactly the
    fields the mobile dashboard's "X/Y daq" widget and streak display read."""
    from app.api.v1.endpoints.focus import get_focus_stats

    today = date.today()
    _seed(db_session, today, minutes=25)

    result = asyncio.run(get_focus_stats(local_date=None, db=db_session, caller_id=TEST_USER))

    assert result["today_minutes"] == 25
    assert result["daily_goal"] == 20
    assert result["streak_days"] == 3
    assert result["total_focus_minutes"] == 100


def test_get_focus_stats_honors_explicit_local_date_query_param(db_session):
    from app.api.v1.endpoints.focus import get_focus_stats

    today = date.today()
    _seed(db_session, today, minutes=25)

    result = asyncio.run(get_focus_stats(local_date=today.isoformat(), db=db_session, caller_id=TEST_USER))
    assert result["today_minutes"] == 25


def test_get_weekly_focus_does_not_crash_and_marks_goal_met(db_session):
    """Same NameError as get_focus_stats — GET /api/focus/weekly backs the
    7-day breakdown strip; must not throw and must report goal_met once
    minutes reach the profile's daily_goal_minutes."""
    from app.api.v1.endpoints.focus import get_weekly_focus

    today = date.today()
    _seed(db_session, today, minutes=25)  # >= daily_goal_minutes(20) -> goal_met

    result = asyncio.run(get_weekly_focus(local_date=None, db=db_session, caller_id=TEST_USER))

    assert len(result) == 7
    todays_entry = next(d for d in result if d["date"] == today.isoformat())
    assert todays_entry["minutes"] == 25
    assert todays_entry["goal_met"] is True

    yesterday_entry = next(d for d in result if d["date"] == (today - timedelta(days=1)).isoformat())
    assert yesterday_entry["minutes"] == 0
    assert yesterday_entry["goal_met"] is False
