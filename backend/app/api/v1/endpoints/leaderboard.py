"""
leaderboard.py — XP leaderboard.

GET /api/leaderboard/weekly?scope=global|friends&period=week|month|all

  period=week   — XP earned since Monday of the current week (xp_logs)
  period=month  — XP earned since 1st of the current month (xp_logs)
  period=all    — All-time total XP (profiles.total_xp, covers all 1400+ users)

  global  — top 100 users
  friends — top 50 followed users + caller
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token

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
    """Return a SQL expression for the start of the given period."""
    if period == "week":
        return "date_trunc('week', NOW())"   # Monday 00:00 UTC of current week
    return "date_trunc('month', NOW())"      # 1st of current month 00:00 UTC


@router.get("/weekly")
async def weekly_leaderboard(
    scope:     str = Query("global"),
    period:    str = Query("week"),
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    if scope not in ("global", "friends"):
        raise HTTPException(status_code=422, detail="scope must be 'global' or 'friends'")
    if period not in ("week", "month", "all"):
        raise HTTPException(status_code=422, detail="period must be 'week', 'month', or 'all'")

    # ── Build main ranking SQL ────────────────────────────────────────────────

    if period == "all":
        if scope == "friends":
            sql = text("""
                WITH pool AS (
                    SELECT following_id AS telegram_id
                    FROM   follows
                    WHERE  follower_id = :uid
                    UNION  SELECT :uid
                ),
                ranked AS (
                    SELECT
                        p.telegram_id,
                        p.first_name,
                        p.site_username  AS username,
                        p.photo_url,
                        p.level,
                        COALESCE(p.total_xp, 0) AS score,
                        RANK() OVER (ORDER BY COALESCE(p.total_xp, 0) DESC) AS rank
                    FROM profiles p
                    JOIN pool ON pool.telegram_id = p.telegram_id
                )
                SELECT * FROM ranked ORDER BY rank LIMIT 50
            """)
        else:
            sql = text("""
                WITH ranked AS (
                    SELECT
                        telegram_id,
                        first_name,
                        site_username    AS username,
                        photo_url,
                        level,
                        COALESCE(total_xp, 0) AS score,
                        RANK() OVER (ORDER BY COALESCE(total_xp, 0) DESC) AS rank
                    FROM profiles
                    WHERE COALESCE(total_xp, 0) > 0
                )
                SELECT * FROM ranked ORDER BY rank LIMIT 100
            """)
    else:
        # week or month — sum from xp_logs since the period start
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
                ranked AS (
                    SELECT
                        p.telegram_id,
                        p.first_name,
                        p.site_username  AS username,
                        p.photo_url,
                        p.level,
                        x.score,
                        RANK() OVER (ORDER BY x.score DESC) AS rank
                    FROM profiles p
                    JOIN xp_period x ON x.user_id = p.telegram_id
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
                ranked AS (
                    SELECT
                        p.telegram_id,
                        p.first_name,
                        p.site_username  AS username,
                        p.photo_url,
                        p.level,
                        x.score,
                        RANK() OVER (ORDER BY x.score DESC) AS rank
                    FROM profiles p
                    JOIN xp_period x ON x.user_id = p.telegram_id
                )
                SELECT * FROM ranked ORDER BY rank LIMIT 100
            """)

    rows = db.execute(sql, {"uid": caller_id}).fetchall()

    my_rank: Optional[int] = None
    entries = []
    for r in rows:
        is_me = r.telegram_id == caller_id
        if is_me:
            my_rank = int(r.rank)
        entries.append({
            "rank":        int(r.rank),
            "telegram_id": r.telegram_id,
            "first_name":  r.first_name or "",
            "username":    r.username or "",
            "photo_url":   r.photo_url,
            "level":       int(r.level or 1),
            "score":       int(r.score),
            "is_me":       is_me,
        })

    # ── Caller rank when outside the top list ─────────────────────────────────
    if my_rank is None and scope == "global":
        if period == "all":
            rank_row = db.execute(
                text("""
                    SELECT COUNT(*) + 1 AS rank
                    FROM profiles
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

    return {"entries": entries, "my_rank": my_rank}
