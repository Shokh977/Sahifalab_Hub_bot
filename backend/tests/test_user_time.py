"""
test_user_time.py — timezone boundary + DST coverage for app/services/user_time.py.

These are pure-function tests, no database required.
"""
from datetime import datetime, UTC, date

from app.services.user_time import user_local_date, user_local_hour, validate_timezone


def test_tashkent_and_seoul_land_on_different_calendar_dates():
    # 2026-03-01 15:00 UTC: Tashkent (UTC+5) is 20:00 on the 1st;
    # Seoul (UTC+9) is already 00:00 on the 2nd.
    at = datetime(2026, 3, 1, 15, 0, tzinfo=UTC)
    assert user_local_date("Asia/Tashkent", at) == date(2026, 3, 1)
    assert user_local_date("Asia/Seoul", at) == date(2026, 3, 2)


def test_tashkent_midnight_crossing():
    # 18:59 UTC = 23:59 Tashkent (still the 1st); 19:01 UTC = 00:01 (now the 2nd)
    before = datetime(2026, 3, 1, 18, 59, tzinfo=UTC)
    after  = datetime(2026, 3, 1, 19, 1,  tzinfo=UTC)
    assert user_local_date("Asia/Tashkent", before) == date(2026, 3, 1)
    assert user_local_date("Asia/Tashkent", after)  == date(2026, 3, 2)


def test_seoul_midnight_crossing():
    # 14:59 UTC = 23:59 Seoul (still the 1st); 15:01 UTC = 00:01 (now the 2nd)
    before = datetime(2026, 3, 1, 14, 59, tzinfo=UTC)
    after  = datetime(2026, 3, 1, 15, 1,  tzinfo=UTC)
    assert user_local_date("Asia/Seoul", before) == date(2026, 3, 1)
    assert user_local_date("Asia/Seoul", after)  == date(2026, 3, 2)


def test_late_night_session_credited_to_correct_local_day():
    # A user studying at 23:30 their own time must be credited to that
    # calendar day, not the UTC day — the exact "I studied and still lost my
    # streak" bug class this module exists to prevent for cron-driven logic.
    at = datetime(2026, 3, 1, 18, 30, tzinfo=UTC)  # 23:30 in Tashkent
    assert user_local_date("Asia/Tashkent", at) == date(2026, 3, 1)
    assert user_local_hour("Asia/Tashkent", at) == 23


def test_missing_or_unknown_timezone_falls_back_to_tashkent():
    at = datetime(2026, 3, 1, 20, 0, tzinfo=UTC)  # 01:00 Tashkent (the 2nd)
    assert user_local_date(None, at) == user_local_date("Asia/Tashkent", at)
    assert user_local_date("Not/AZone", at) == user_local_date("Asia/Tashkent", at)


def test_dst_spring_forward_does_not_raise():
    # 2026-03-08 07:00 UTC lands on a wall-clock time that doesn't exist in
    # America/New_York that day (clocks jump 02:00 -> 03:00). zoneinfo must
    # resolve this without extra handling from us — this test documents that,
    # it doesn't add logic.
    at = datetime(2026, 3, 8, 7, 0, tzinfo=UTC)
    d = user_local_date("America/New_York", at)
    assert isinstance(d, date)


def test_dst_fall_back_does_not_raise():
    # 2026-11-01: America/New_York falls back 02:00 -> 01:00 (that wall-clock
    # hour occurs twice). Must resolve without raising or double-processing.
    at = datetime(2026, 11, 1, 6, 0, tzinfo=UTC)
    d = user_local_date("America/New_York", at)
    assert isinstance(d, date)


def test_validate_timezone_accepts_real_zones():
    assert validate_timezone("Asia/Tashkent") == "Asia/Tashkent"
    assert validate_timezone("Asia/Seoul") == "Asia/Seoul"
    assert validate_timezone("America/New_York") == "America/New_York"


def test_validate_timezone_rejects_garbage():
    import pytest
    for bad in ["Not/AZone", "", "UTC+5", "tashkent"]:
        with pytest.raises(ValueError):
            validate_timezone(bad)
