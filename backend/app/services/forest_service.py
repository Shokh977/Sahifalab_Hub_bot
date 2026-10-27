"""
forest_service.py — O'rmon (the forest): every streak a user has finished,
kept as a tree at the size it reached.

Derived from history, not stored: a streak is a run of consecutive days on
which the user met their daily goal (focus_sessions) or used a streak
freeze (profiles.freeze_used_dates) — the same goal-met-days basis as
longest_streak, plus freezes, which keep a streak alive. Runs shorter than
MIN_DAYS are left out (a forest of 1-day seeds isn't one). The run that is
still going is the user's current tree, not part of the forest. Because it
is computed, existing users get their whole forest on day one.

Known limits: the daily goal used is today's (as for longest_streak), and
past trees are drawn in the default look — the look a tree was grown with
isn't recorded.
"""
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

MIN_DAYS = 3
MAX_TREES = 60


def streak_runs(db: Session, user_id: int, daily_goal: int) -> list[dict]:
    """All runs of MIN_DAYS+ streak days, newest first (at most MAX_TREES)."""
    rows = db.execute(text("""
        WITH days AS (
            SELECT session_date AS d
            FROM focus_sessions
            WHERE user_id = :uid
            GROUP BY session_date
            HAVING SUM(minutes) >= :goal
            UNION
            SELECT unnest(freeze_used_dates) AS d
            FROM profiles
            WHERE telegram_id = :uid
        ),
        grouped AS (
            SELECT d, d - CAST(ROW_NUMBER() OVER (ORDER BY d) AS INTEGER) AS grp
            FROM days
        )
        SELECT MIN(d) AS start_date, MAX(d) AS end_date, COUNT(*) AS days
        FROM grouped
        GROUP BY grp
        HAVING COUNT(*) >= :min_days
        ORDER BY MAX(d) DESC
        LIMIT :max_trees
    """), {"uid": user_id, "goal": daily_goal, "min_days": MIN_DAYS, "max_trees": MAX_TREES + 1}).fetchall()
    return [{"start": r.start_date, "end": r.end_date, "days": int(r.days)} for r in rows]


def forest(runs: list[dict], current_streak: int, today: date) -> list[dict]:
    """
    The finished streaks: drops the run that is still going (it ends today or
    yesterday while the user has a live streak) and serialises the rest.
    """
    out = []
    for run in runs:
        ongoing = current_streak > 0 and run["end"] >= today - timedelta(days=1)
        if ongoing:
            continue
        out.append({"start": run["start"].isoformat(), "end": run["end"].isoformat(), "days": run["days"]})
    return out[:MAX_TREES]


def forest_for(db: Session, user_id: int, daily_goal: int, current_streak: int, today: date) -> list[dict]:
    return forest(streak_runs(db, user_id, daily_goal), current_streak, today)


def forest_stats(trees: list[dict], current_streak: int) -> dict[str, Optional[int]]:
    longest = max([t["days"] for t in trees] + [current_streak], default=0)
    return {
        "trees": len(trees) + (1 if current_streak > 0 else 0),
        "longest": longest,
        "total_days": sum(t["days"] for t in trees) + current_streak,
    }
