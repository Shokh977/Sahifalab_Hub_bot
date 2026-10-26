"""
leaderboard.py — XP leaderboard.

GET /api/leaderboard/weekly?scope=global|friends&period=week|month|all

  period=week   — XP + focus minutes since Monday of the current week
  period=month  — XP + focus minutes since 1st of the current month
  period=all    — All-time total XP + total focus minutes

Each entry includes:
  score   — XP earned in the period
  minutes — focus session minutes in the period

Also (redesign Phase 7.5 C4, additive):
  total     — how many people have XP in the period (global) / are in the
              friends pool — Bugun's "186 kishi bu hafta"
  around_me — for week/month global, when the caller is outside the returned
              list: the rows at their rank −1, their own, and +1 (same shape
              as entries), so Bugun's rival ladder works for everyone
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.services.badge_service import get_top_badges_map
from app.services.cosmetics_service import rings_for

router = APIRouter()


async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    telegram_id = decode_token(parts[1])
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return telegram_id


def _since(period: str) -> str:
    if period == "week":
        # Monday 00:00 Tashkent time (UTC+5).  date_trunc('week') gives ISO week
        # start (Monday), converted to Tashkent so users who studied on Monday at
        # e.g. 01:00 local time aren't missed due to a UTC-based cutoff.
        return "date_trunc('week', NOW() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent'"
    # Month start in Tashkent local time (UTC+5).  Pure UTC truncation causes XP
    # earned on the 1st before 05:00 Tashkent to fall into the previous month.
    return "date_trunc('month', NOW() AT TIME ZONE 'Asia/Tashkent') AT TIME ZONE 'Asia/Tashkent'"


@router.get("/weekly")
def weekly_leaderboard(
    scope:     str = Query("global"),
    period:    str = Query("week"),
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    if scope not in ("global", "friends"):
        raise HTTPException(status_code=422, detail="scope must be 'global' or 'friends'")
    if period not in ("week", "month", "all"):
        raise HTTPException(status_code=422, detail="period must be 'week', 'month', or 'all'")

    if period == "all":
        if scope == "friends":
            sql = text("""
                WITH pool AS (
                    SELECT following_id AS telegram_id
                    FROM   follows
                    WHERE  follower_id = :uid
                    UNION  SELECT :uid
                ),
                focus_all AS (
                    SELECT user_id, SUM(minutes) AS minutes
                    FROM   focus_sessions
                    GROUP  BY user_id
                ),
                ranked AS (
                    SELECT
                        p.telegram_id,
                        p.first_name,
                        p.site_username          AS username,
                        p.photo_url,
                        p.level,
                        COALESCE(p.total_xp, 0)       AS score,
                        COALESCE(f.minutes, 0)         AS minutes,
                        COALESCE(p.account_type, 'student') AS account_type,
                        RANK() OVER (ORDER BY COALESCE(p.total_xp, 0) DESC) AS rank
                    FROM profiles p
                    JOIN pool ON pool.telegram_id = p.telegram_id
                    LEFT JOIN focus_all f ON f.user_id = p.telegram_id
                )
                SELECT * FROM ranked ORDER BY rank LIMIT 50
            """)
        else:
            sql = text("""
                WITH focus_all AS (
                    SELECT user_id, SUM(minutes) AS minutes
                    FROM   focus_sessions
                    GROUP  BY user_id
                ),
                ranked AS (
                    SELECT
                        p.telegram_id,
                        p.first_name,
                        p.site_username          AS username,
                        p.photo_url,
                        p.level,
                        COALESCE(p.total_xp, 0)       AS score,
                        COALESCE(f.minutes, 0)         AS minutes,
                        COALESCE(p.account_type, 'student') AS account_type,
                        RANK() OVER (ORDER BY COALESCE(p.total_xp, 0) DESC) AS rank
                    FROM profiles p
                    LEFT JOIN focus_all f ON f.user_id = p.telegram_id
                    WHERE COALESCE(p.total_xp, 0) > 0
                )
                SELECT * FROM ranked ORDER BY rank LIMIT 100
            """)
    else:
        since = _since(period)
        if scope == "friends":
            sql = text(f"""
                WITH pool AS (
                    SELECT following_id AS telegram_id
                    FROM   follows
                    WHERE  follower_id = :uid
                    UNION  SELECT :uid
                ),
                xp_period AS (
                    SELECT user_id, SUM(amount) AS score
                    FROM   xp_logs
                    WHERE  created_at >= {since}
                      AND  user_id IN (SELECT telegram_id FROM pool)
                    GROUP  BY user_id
                ),
                focus_period AS (
                    SELECT user_id, SUM(minutes) AS minutes
                    FROM   focus_sessions
                    WHERE  created_at >= {since}
                      AND  user_id IN (SELECT telegram_id FROM pool)
                    GROUP  BY user_id
                ),
                ranked AS (
                    SELECT
                        p.telegram_id,
                        p.first_name,
                        p.site_username        AS username,
                        p.photo_url,
                        p.level,
                        x.score,
                        COALESCE(fp.minutes, 0)             AS minutes,
                        COALESCE(p.account_type, 'student') AS account_type,
                        RANK() OVER (ORDER BY x.score DESC) AS rank
                    FROM profiles p
                    JOIN pool        ON pool.telegram_id = p.telegram_id
                    JOIN xp_period x ON x.user_id        = p.telegram_id
                    LEFT JOIN focus_period fp ON fp.user_id = p.telegram_id
                )
                SELECT * FROM ranked ORDER BY rank LIMIT 50
            """)
        else:
            sql = text(f"""
                WITH xp_period AS (
                    SELECT user_id, SUM(amount) AS score
                    FROM   xp_logs
                    WHERE  created_at >= {since}
                    GROUP  BY user_id
                ),
                focus_period AS (
                    SELECT user_id, SUM(minutes) AS minutes
                    FROM   focus_sessions
                    WHERE  created_at >= {since}
                    GROUP  BY user_id
                ),
                ranked AS (
                    SELECT
                        p.telegram_id,
                        p.first_name,
                        p.site_username        AS username,
                        p.photo_url,
                        p.level,
                        x.score,
                        COALESCE(fp.minutes, 0)             AS minutes,
                        COALESCE(p.account_type, 'student') AS account_type,
                        RANK() OVER (ORDER BY x.score DESC) AS rank
                    FROM profiles p
                    JOIN xp_period x ON x.user_id = p.telegram_id
                    LEFT JOIN focus_period fp ON fp.user_id = p.telegram_id
                )
                SELECT * FROM ranked ORDER BY rank LIMIT 100
            """)

    rows = db.execute(sql, {"uid": caller_id}).fetchall()

    top_badge_map = get_top_badges_map(db, [r.telegram_id for r in rows])
    # Avatar rings (106_profile_looks): Pro / earned / seasonal, shown on the board.
    ring_map = _rings(db, [r.telegram_id for r in rows] + [caller_id])

    my_rank: Optional[int] = None
    entries = []
    for r in rows:
        is_me = r.telegram_id == caller_id
        if is_me:
            my_rank = int(r.rank)
        entries.append({
            "rank":         int(r.rank),
            "telegram_id":  r.telegram_id,
            "first_name":   r.first_name or "",
            "username":     r.username or "",
            "photo_url":    r.photo_url,
            "level":        int(r.level or 1),
            "score":        int(r.score),
            "minutes":      int(r.minutes),
            "account_type": r.account_type or "student",
            "is_me":        is_me,
            "top_badge":    top_badge_map.get(r.telegram_id),
            "ring":         ring_map.get(r.telegram_id),
        })

    total = _total(db, scope, period, caller_id)
    around_me: list = []

    # Caller rank when outside the top list
    if my_rank is None and scope == "global":
        if period == "all":
            rank_row = db.execute(
                text("""
                    SELECT COUNT(*) + 1 AS rank FROM profiles
                    WHERE COALESCE(total_xp, 0) > (
                        SELECT COALESCE(total_xp, 0) FROM profiles WHERE telegram_id = :uid
                    )
                """),
                {"uid": caller_id},
            ).fetchone()
        else:
            since = _since(period)
            rank_row = db.execute(
                text(f"""
                    SELECT COUNT(*) + 1 AS rank
                    FROM (
                        SELECT user_id, SUM(amount) AS score
                        FROM   xp_logs
                        WHERE  created_at >= {since}
                        GROUP  BY user_id
                    ) ranked
                    WHERE score > (
                        SELECT COALESCE(SUM(amount), 0)
                        FROM   xp_logs
                        WHERE  user_id = :uid AND created_at >= {since}
                    )
                """),
                {"uid": caller_id},
            ).fetchone()
        if rank_row:
            my_rank = int(rank_row.rank)
        if period != "all":
            around_me = _around_me(db, period, caller_id)

    if around_me:
        around_rings = _rings(db, [e["telegram_id"] for e in around_me])
        for e in around_me:
            e["ring"] = around_rings.get(e["telegram_id"])

    return {
        "entries": entries, "my_rank": my_rank, "total": total, "around_me": around_me,
        # The caller's own ring, for the "Siz" bar when they're not on the board.
        "my_ring": ring_map.get(caller_id),
    }


def _rings(db: Session, ids: list[int]) -> dict[int, str]:
    """Best-effort: a failure here never breaks the leaderboard."""
    try:
        with db.begin_nested():
            return rings_for(db, ids)
    except Exception:
        return {}


def _total(db: Session, scope: str, period: str, caller_id: int) -> Optional[int]:
    """People on the board for this period. Best-effort: None on any error."""
    try:
        with db.begin_nested():
            if scope == "friends":
                return int(db.execute(text("""
                    SELECT COUNT(*) FROM (
                        SELECT following_id FROM follows WHERE follower_id = :uid
                        UNION SELECT :uid
                    ) pool
                """), {"uid": caller_id}).scalar() or 0)
            if period == "all":
                return int(db.execute(text(
                    "SELECT COUNT(*) FROM profiles WHERE COALESCE(total_xp, 0) > 0"
                )).scalar() or 0)
            since = _since(period)
            return int(db.execute(text(f"""
                SELECT COUNT(DISTINCT user_id) FROM xp_logs WHERE created_at >= {since}
            """)).scalar() or 0)
    except Exception:
        return None


def _around_me(db: Session, period: str, caller_id: int) -> list:
    """The caller's row and the rows ranked just above and below (global)."""
    since = _since(period)
    try:
        with db.begin_nested():
            rows = db.execute(text(f"""
                WITH xp_period AS (
                    SELECT user_id, SUM(amount) AS score
                    FROM   xp_logs
                    WHERE  created_at >= {since}
                    GROUP  BY user_id
                ),
                ranked AS (
                    SELECT x.user_id, x.score,
                           RANK() OVER (ORDER BY x.score DESC) AS rank,
                           ROW_NUMBER() OVER (ORDER BY x.score DESC, x.user_id) AS pos
                    FROM xp_period x
                ),
                me AS (SELECT pos FROM ranked WHERE user_id = :uid)
                SELECT r.user_id, r.score, r.rank,
                       p.first_name, p.site_username AS username, p.photo_url, p.level,
                       COALESCE(p.account_type, 'student') AS account_type,
                       COALESCE((SELECT SUM(minutes) FROM focus_sessions f
                                 WHERE f.user_id = r.user_id AND f.created_at >= {since}), 0) AS minutes
                FROM ranked r
                JOIN me ON r.pos BETWEEN me.pos - 1 AND me.pos + 1
                JOIN profiles p ON p.telegram_id = r.user_id
                ORDER BY r.pos
            """), {"uid": caller_id}).fetchall()
    except Exception:
        return []
    return [{
        "rank":         int(r.rank),
        "telegram_id":  r.user_id,
        "first_name":   r.first_name or "",
        "username":     r.username or "",
        "photo_url":    r.photo_url,
        "level":        int(r.level or 1),
        "score":        int(r.score),
        "minutes":      int(r.minutes),
        "account_type": r.account_type or "student",
        "is_me":        r.user_id == caller_id,
        "top_badge":    None,
    } for r in rows]
