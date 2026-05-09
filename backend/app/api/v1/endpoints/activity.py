"""
activity.py — User activity feed.

GET /api/activity?limit=20&offset=0
  Returns the caller's activity log, newest-first, with offset pagination.

Sources (UNIONed, deduped by time):
  1. activity_log         — major lifecycle events (course_completed, level_up, …)
  2. user_quiz_completion — quiz/test results with score %
  3. user_badges          — earned badges / achievements
"""

import json
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


_FEED_SQL = text("""
    WITH unified AS (

        -- 1. activity_log: course_completed, level_up, certificate_earned, etc.
        SELECT
            id                  AS id,
            activity_type,
            metadata,
            created_at
        FROM activity_log
        WHERE user_id = :uid

        UNION ALL

        -- 2. user_quiz_completion: test results with score
        SELECT
            (uqc.id + 1000000)::bigint                AS id,
            'test_passed'                              AS activity_type,
            jsonb_build_object(
                'test_title', COALESCE(qz.title, 'Test'),
                'score',      ROUND(COALESCE(uqc.percentage, 0))::int
            )                                          AS metadata,
            uqc.completed_at                           AS created_at
        FROM user_quiz_completion uqc
        LEFT JOIN quiz qz ON qz.id = uqc.quiz_id
        WHERE uqc.telegram_id = :uid

        UNION ALL

        -- 3. user_badges: achievement / badge unlocks
        SELECT
            (id + 2000000000)::bigint              AS id,
            'achievement_earned'                    AS activity_type,
            jsonb_build_object(
                'achievement_name', badge_key
            )                                       AS metadata,
            granted_at                              AS created_at
        FROM user_badges
        WHERE user_id = :uid

    )
    SELECT id, activity_type, metadata, created_at
    FROM   unified
    ORDER  BY created_at DESC
    LIMIT  :lim OFFSET :off
""")

_COUNT_SQL = text("""
    SELECT (
        (SELECT COUNT(*) FROM activity_log         WHERE user_id    = :uid) +
        (SELECT COUNT(*) FROM user_quiz_completion WHERE telegram_id = :uid) +
        (SELECT COUNT(*) FROM user_badges          WHERE user_id    = :uid)
    ) AS total
""")


def _iso(dt) -> Optional[str]:
    """Return ISO-8601 string, always UTC-suffixed for naive datetimes."""
    if dt is None:
        return None
    s = dt.isoformat()
    # naive datetime → treat as UTC
    if "+" not in s and s.count("-") < 3 and not s.endswith("Z"):
        s += "Z"
    return s


@router.get("")
async def list_activity(
    limit:     int = Query(20, ge=1, le=100),
    offset:    int = Query(0, ge=0),
    db:        Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    rows = db.execute(_FEED_SQL, {"uid": caller_id, "lim": limit, "off": offset}).fetchall()

    total_row = db.execute(_COUNT_SQL, {"uid": caller_id}).fetchone()
    total = int(total_row[0]) if total_row else 0

    items = []
    for r in rows:
        meta = r.metadata
        if isinstance(meta, str):
            try:
                meta = json.loads(meta)
            except Exception:
                meta = None
        items.append({
            "id":            r.id,
            "activity_type": r.activity_type,
            "metadata":      meta,
            "created_at":    _iso(r.created_at),
        })

    return {
        "items":    items,
        "total":    total,
        "offset":   offset,
        "has_more": (offset + limit) < total,
    }
