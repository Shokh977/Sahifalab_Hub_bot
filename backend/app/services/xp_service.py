"""
xp_service.py — Server-side XP award via the add_xp() Postgres RPC.

All XP mutations MUST go through this module.  The SQL function enforces:
  DEEP_WORK : unlimited, caller sends round(minutes × 1.66)
  QUIZ      : 25 XP per quiz, hard cap 100 XP per UTC day
  COURSE    : 200 XP one-time per course (deduped by reference_id)
"""

from typing import Optional, Literal

from sqlalchemy.orm import Session
from sqlalchemy import text

# Canonical XP rate for focus work (1.66 XP/min ≈ 100 XP/hour)
DEEP_WORK_XP_PER_MINUTE: float = 1.66

# Default awards per source
DEFAULT_QUIZ_XP:   int = 25
DEFAULT_COURSE_XP: int = 200
QUIZ_DAILY_CAP:    int = 100

XpSource = Literal["DEEP_WORK", "QUIZ", "COURSE"]


def focus_minutes_to_xp(minutes: float) -> int:
    """Convert focus minutes to integer XP (1.66 XP/min, rounded)."""
    return round(minutes * DEEP_WORK_XP_PER_MINUTE)


def add_xp(
    db: Session,
    user_id: int,
    source: XpSource,
    amount: int,
    reference_id: Optional[int] = None,
) -> dict:
    """
    Call the add_xp() Postgres RPC and return {new_xp, new_level, xp_added}.

    The SQL function handles:
      - Row-level locking (prevents concurrent race conditions)
      - QUIZ daily cap enforcement
      - COURSE one-time deduplication
      - xp_logs audit trail insert

    Args:
        db           : SQLAlchemy Session (direct Postgres — bypasses Supabase REST egress)
        user_id      : profiles.telegram_id
        source       : 'DEEP_WORK' | 'QUIZ' | 'COURSE'
        amount       : XP to award (pre-computed by the caller)
        reference_id : course_id when source='COURSE'; None otherwise

    Returns:
        { "new_xp": int, "new_level": int, "xp_added": int }
        xp_added may be 0 if the daily cap or one-time check blocked the award.
    """
    row = db.execute(
        text("""
            SELECT new_xp, new_level, xp_added
            FROM   add_xp(:user_id, :source, :amount, :reference_id)
        """),
        {
            "user_id":      user_id,
            "source":       source,
            "amount":       amount,
            "reference_id": reference_id,
        },
    ).fetchone()

    db.commit()

    return {
        "new_xp":    int(row.new_xp),
        "new_level": int(row.new_level),
        "xp_added":  int(row.xp_added),
    }
