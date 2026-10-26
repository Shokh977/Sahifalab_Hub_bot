"""
cosmetics_service.py — profile cosmetics (106_profile_looks): the catalog,
the unlock rules, and the look a profile actually renders.

Unlock rules (product decisions, 2026-10-26):
  free        — everyone, always
  achievement — best streak >= N days (stays unlocked once earned)
  pro         — while profiles.pro_until is in the future
  seasonal    — EVERYONE during the season window, nobody outside it
                (no Pro needed). Windows come from app_config.

A saved choice that is locked now is never deleted: effective_look() renders
it as the slot's free fallback, and it comes back when it unlocks again.
"""
import json
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.config_service import get_config

TASHKENT = timezone(timedelta(hours=5))
SLOTS = ("banner", "ring", "tree")
FALLBACK = {"banner": "plain", "ring": "oddiy", "tree": "tabiiy"}

# slot -> id -> unlock rule
CATALOG: dict[str, dict[str, dict[str, Any]]] = {
    "banner": {
        "plain": {"kind": "free"},
        "tong": {"kind": "achievement", "streak_days": 30},
        "tun": {"kind": "pro"},
        "oltin": {"kind": "pro"},
        "bahor": {"kind": "seasonal", "season": "navroz"},
        "hilol": {"kind": "seasonal", "season": "ramazon"},
    },
    "ring": {
        "oddiy": {"kind": "free"},
        "olov": {"kind": "achievement", "streak_days": 50},
        "shabnam": {"kind": "pro"},
        "kometa": {"kind": "pro"},
        "oltin": {"kind": "pro"},
        "lola": {"kind": "seasonal", "season": "navroz"},
    },
    # Streak tree colour looks (MagicTree palettes; the shape never changes).
    "tree": {
        "tabiiy": {"kind": "free"},
        "sakura": {"kind": "pro"},
        "kumush": {"kind": "achievement", "streak_days": 100},
        "oltin": {"kind": "pro"},
    },
}


@dataclass
class UnlockContext:
    is_pro: bool
    best_streak: int
    open_seasons: set[str]


def _parse_window(raw: Any, today: date) -> Optional[tuple[date, date]]:
    """{"start": "03-01", "end": "03-31"} (every year) or full ISO dates."""
    if not isinstance(raw, dict):
        return None
    start, end = raw.get("start"), raw.get("end")
    if not isinstance(start, str) or not isinstance(end, str):
        return None
    try:
        if len(start) == 5 and len(end) == 5:
            return (
                date.fromisoformat(f"{today.year}-{start}"),
                date.fromisoformat(f"{today.year}-{end}"),
            )
        return date.fromisoformat(start), date.fromisoformat(end)
    except ValueError:
        return None


def open_seasons(db: Session, today: Optional[date] = None) -> set[str]:
    today = today or datetime.now(TASHKENT).date()
    out = set()
    for season in ("navroz", "ramazon"):
        window = _parse_window(get_config(db, f"season_{season}"), today)
        if window and window[0] <= today <= window[1]:
            out.add(season)
    return out


def is_unlocked(slot: str, item_id: str, ctx: UnlockContext) -> bool:
    rule = CATALOG.get(slot, {}).get(item_id)
    if rule is None:
        return False
    kind = rule["kind"]
    if kind == "free":
        return True
    if kind == "achievement":
        return ctx.best_streak >= rule["streak_days"]
    if kind == "pro":
        return ctx.is_pro
    if kind == "seasonal":
        return rule["season"] in ctx.open_seasons
    return False


def effective_look(saved: Optional[dict], ctx: UnlockContext) -> dict[str, str]:
    saved = saved if isinstance(saved, dict) else {}
    out = {}
    for slot in SLOTS:
        choice = saved.get(slot)
        out[slot] = choice if isinstance(choice, str) and is_unlocked(slot, choice, ctx) else FALLBACK[slot]
    return out


def item_states(ctx: UnlockContext) -> dict[str, dict[str, bool]]:
    return {slot: {i: is_unlocked(slot, i, ctx) for i in items} for slot, items in CATALOG.items()}


# ── DB access (raw SQL: the columns aren't on the Profile model) ─────────────

def looks_enabled(db: Session) -> bool:
    row = db.execute(text("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name IN ('profile_look', 'pro_until')
    """)).scalar()
    return (row or 0) == 2


def read_look_row(db: Session, user_id: int) -> tuple[Optional[dict], Optional[datetime]]:
    row = db.execute(
        text("SELECT profile_look, pro_until FROM profiles WHERE telegram_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    if row is None:
        return None, None
    return row.profile_look, row.pro_until


def pro_active(pro_until: Optional[datetime], now: Optional[datetime] = None) -> bool:
    if pro_until is None:
        return False
    now = now or datetime.now(timezone.utc)
    if pro_until.tzinfo is None:
        pro_until = pro_until.replace(tzinfo=timezone.utc)
    return pro_until > now


def longest_streak(db: Session, user_id: int, daily_goal: int) -> int:
    """Longest run of days meeting the daily goal (same CTE as streaks.py)."""
    return int(db.execute(text("""
        WITH daily AS (
            SELECT session_date
            FROM focus_sessions
            WHERE user_id = :uid
            GROUP BY session_date
            HAVING SUM(minutes) >= :goal
        ),
        gaps AS (
            SELECT session_date,
                   session_date - (ROW_NUMBER() OVER (ORDER BY session_date)
                                   * INTERVAL '1 day')::interval AS grp
            FROM daily
        ),
        streaks AS (
            SELECT COUNT(*) AS streak_len FROM gaps GROUP BY grp
        )
        SELECT COALESCE(MAX(streak_len), 0) AS longest FROM streaks
    """), {"uid": user_id, "goal": daily_goal}).scalar() or 0)


def write_look(db: Session, user_id: int, look: dict) -> None:
    db.execute(
        text("UPDATE profiles SET profile_look = CAST(:look AS JSONB) WHERE telegram_id = :uid"),
        {"look": json.dumps(look), "uid": user_id},
    )
    db.commit()
