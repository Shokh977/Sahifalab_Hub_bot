"""
day_bucket.py — the Python entry point to resolve_day_bucket() (migration
093), the single SQL-side authority for "what day is it, for this user,
right now". Nothing computes a day bucket any other way.

Why this exists: POST /api/focus/complete used to trust a bare client-
supplied `local_date` string as the bucket key for both the XP taper
(credited_seconds_today) and the Tanga daily cap (earn_date) — with the
real wall-clock cap on *how many seconds* only ever bounding volume per
call, never bounding how many distinct "days" a caller could invent. See
migration 093's header comment for the full incident writeup.

Invariant: for a profile with a CONFIRMED timezone (set by a real client
via PATCH /api/auth/me), the server-computed date is authoritative — the
client's claim is never used to choose the bucket, only compared for
divergence logging. For a profile without one yet (registerTimezone() is
new; most existing profiles likely don't have one — see the accompanying
report), the client's claim is honored only within a tight ±1 day window of
the server's own computation, and a rolling-24h cap of 2 distinct buckets
applies regardless of branch. All of this lives in the SQL function, not
here — this module is a thin, honest wrapper, not a second decision-maker.
"""
from datetime import date as Date, datetime, timedelta, UTC
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

TIMEZONE_CHANGE_COOLDOWN = timedelta(hours=24)


def timezone_change_allowed(timezone_confirmed_at: Optional[datetime], now: Optional[datetime] = None) -> bool:
    """Rate limit: at most one ACCEPTED timezone change per 24h (abuse-review
    §2 — hopping zones to roll a calendar day over early). A profile that has
    never confirmed one (timezone_confirmed_at is NULL — still sitting on the
    migration default) may always set its first one; there is nothing to
    rate-limit against yet. Pure function — no DB — so the rule itself is
    unit-testable independent of the PATCH /api/auth/me endpoint that uses it."""
    if timezone_confirmed_at is None:
        return True
    now = now or datetime.now(UTC)
    return (now - timezone_confirmed_at) >= TIMEZONE_CHANGE_COOLDOWN


def try_parse_client_date(client_local_date: Optional[str]) -> Optional[Date]:
    """Best-effort parse of the client's claim into a real date, purely so it
    can be passed as a typed bind param — this makes no authority decision;
    resolve_day_bucket() does. An unparseable/absent string becomes NULL,
    which the SQL function treats identically to "no claim offered". Public
    so any caller binding a client_date param directly (e.g. focus.py, ahead
    of its own credit_focus_time() call) parses it exactly the same way."""
    if not client_local_date:
        return None
    try:
        return Date.fromisoformat(client_local_date)
    except ValueError:
        return None


def resolve_day_bucket(db: Session, user_id: int, client_local_date: Optional[str], source: str) -> Date:
    """Resolve today's bucket for `user_id` via the SQL function. `source` is
    a short tag ('focus_timer' | 'flashcards' | ...) for the audit trail in
    user_day_bucket_log / local_date_divergence_log — it never affects which
    date is chosen."""
    row = db.execute(
        text("SELECT resolve_day_bucket(:uid, :cdate, :source) AS bucket"),
        {"uid": user_id, "cdate": try_parse_client_date(client_local_date), "source": source},
    ).fetchone()
    db.commit()  # resolve_day_bucket() writes rows (usage/divergence log) — same rule as everywhere else: commit before returning control
    return row.bucket
