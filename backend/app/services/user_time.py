"""
user_time.py — per-user IANA timezone resolution.

Client-initiated requests (streaks.py, study_activity.py) already resolve
"today" from a device-supplied `local_date` string and don't need this module
for their primary path — that's already correct per-device. This module exists
for the cases that have no client request to piggyback on:

  1. The fallback branch when `local_date` is absent/unparseable (today: bare
     UTC date — wrong for non-Tashkent users; this module fixes that).
  2. Every cron job that has to decide, for each user independently, what
     "midnight" or "8pm" or "9am" means to them (streak-freeze-auto-apply,
     streak-at-risk-push, streak-reminder).

Pure functions only — no DB access — so they're unit-testable without a
database (see tests/test_user_time.py).
"""
from datetime import datetime, UTC, date, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TZ = "Asia/Tashkent"


def validate_timezone(tz: str) -> str:
    """Raise ValueError if tz isn't a real IANA zone name. Returns tz unchanged on success."""
    try:
        ZoneInfo(tz)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        raise ValueError(f"Unknown timezone: {tz}")
    return tz


def _zone(tz: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(tz) if tz else ZoneInfo(DEFAULT_TZ)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return ZoneInfo(DEFAULT_TZ)


def user_local_date(tz: str | None, at: datetime | None = None) -> date:
    """Resolve 'today' in the user's IANA timezone. Falls back to Asia/Tashkent
    if tz is missing or not a recognised zone."""
    return (at or datetime.now(UTC)).astimezone(_zone(tz)).date()


def user_local_hour(tz: str | None, at: datetime | None = None) -> int:
    """Resolve the current local hour (0-23) in the user's timezone."""
    return (at or datetime.now(UTC)).astimezone(_zone(tz)).hour


def local_midnight_utc(tz: str | None, local_day: date) -> datetime:
    """The UTC instant of local_day's upcoming midnight (start of local_day+1) —
    used for streak_state='at_risk' window_closes_at."""
    naive = datetime.combine(local_day + timedelta(days=1), time.min)
    return naive.replace(tzinfo=_zone(tz)).astimezone(UTC)
