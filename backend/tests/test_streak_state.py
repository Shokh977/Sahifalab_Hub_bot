"""
test_streak_state.py — coverage for compute_streak_state() in
app/services/freeze_service.py (plan doc section B's state table).
"""
from datetime import date, timedelta

from app.services.freeze_service import compute_streak_state

TODAY = date(2026, 3, 10)


def test_never_studied_is_active_not_lost():
    # No last_date means nothing to protect or lose — gates on streak_days>0
    # elsewhere, so this must never read as 'lost'.
    assert compute_streak_state(TODAY, None, set(), today_goal_met=False) == "active"


def test_studied_today_is_active():
    assert compute_streak_state(TODAY, TODAY, set(), today_goal_met=True) == "active"


def test_studied_yesterday_organically_is_active():
    yesterday = TODAY - timedelta(days=1)
    assert compute_streak_state(TODAY, yesterday, freeze_used_dates=set(), today_goal_met=False) == "active"


def test_yesterday_frozen_and_today_not_yet_met_is_frozen_today():
    yesterday = TODAY - timedelta(days=1)
    assert compute_streak_state(TODAY, yesterday, freeze_used_dates={yesterday}, today_goal_met=False) == "frozen_today"


def test_yesterday_frozen_but_today_already_met_is_active_not_frozen_today():
    # Must not stay 'frozen_today' forever — once today's goal is met the
    # streak is genuinely safe again, not just "protected".
    yesterday = TODAY - timedelta(days=1)
    assert compute_streak_state(TODAY, yesterday, freeze_used_dates={yesterday}, today_goal_met=True) == "active"


def test_exactly_one_day_missed_is_at_risk():
    two_days_ago = TODAY - timedelta(days=2)
    assert compute_streak_state(TODAY, two_days_ago, set(), today_goal_met=False) == "at_risk"


def test_two_days_missed_is_lost():
    three_days_ago = TODAY - timedelta(days=3)
    assert compute_streak_state(TODAY, three_days_ago, set(), today_goal_met=False) == "lost"


def test_long_lapsed_is_lost():
    long_ago = TODAY - timedelta(days=30)
    assert compute_streak_state(TODAY, long_ago, set(), today_goal_met=False) == "lost"
