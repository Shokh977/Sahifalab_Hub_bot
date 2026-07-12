"""
xp_service.py — Server-side XP award via the add_xp() Postgres RPC.

All XP mutations MUST go through this module.  The SQL function enforces:
  DEEP_WORK      : unlimited, caller sends round(minutes × 1.66)
  QUIZ           : 25 XP per quiz, hard cap 100 XP per UTC day
  COURSE         : 200 XP one-time per course (deduped by reference_id)
  DECK_MILESTONE : unlimited like DEEP_WORK at the SQL level — dedup for the
                   one-time clone-milestone bonus is handled by the caller
                   (flashcard_decks.clone_milestones_awarded), not this RPC.
  WELCOME        : unlimited like DEEP_WORK at the SQL level — dedup for the
                   one-time new-user bonus is handled by the caller.
  STREAK_STAGE   : unlimited like DEEP_WORK at the SQL level — dedup for the
                   one-time per-stage bonus is handled by the caller
                   (user_stage_completions UNIQUE(user_id, stage_key)).

IMPORTANT: xp_logs.source has a Postgres CHECK constraint
(migrations/070_widen_xp_logs_source_constraint.sql) restricting it to
exactly the values below. Any new source added to XpSource MUST be added to
that constraint in the same PR, or every award using it will fail silently
if the caller swallows the exception (this happened to WELCOME and
DECK_MILESTONE for an unknown period before migration 070 — never wrap
add_xp() in a bare `except: pass` again).
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

XpSource = Literal["DEEP_WORK", "QUIZ", "COURSE", "WELCOME", "DECK_MILESTONE", "STREAK_STAGE"]


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
