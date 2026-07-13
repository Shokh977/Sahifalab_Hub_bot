"""
achievements.py — Achievement system.

GET /api/achievements — all achievement definitions with earned status for the caller.
                        Auto-grants newly-earned badges into user_badges (lazy grant).
"""

from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
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


# ── Static achievement catalogue ───────────────────────────────────────────────
# metric: which user stat determines progress / earned status
# required_progress: value the metric must reach

ACHIEVEMENTS = [
    # ── Learning milestones ───────────────────────────────────────────────────
    {
        "id": 1, "key": "first_lesson",
        "name": "Birinchi qadam",
        "description": "Birinchi darsni muvaffaqiyatli yakunladingiz!",
        "tier": "bronze", "sort_order": 1,
        "requirement_text": "Birinchi darsni tugatish",
        "required_progress": 1, "metric": "lessons_done",
    },
    {
        "id": 2, "key": "course_graduate",
        "name": "Bitiruvchi",
        "description": "Birinchi kursni muvaffaqiyatli yakunladingiz!",
        "tier": "silver", "sort_order": 2,
        "requirement_text": "Birinchi kursni yakunlash",
        "required_progress": 1, "metric": "courses_done",
    },
    {
        "id": 3, "key": "three_courses",
        "name": "O'rganuvchi",
        "description": "3 ta kursni muvaffaqiyatli yakunladingiz!",
        "tier": "gold", "sort_order": 3,
        "requirement_text": "3 ta kursni yakunlash",
        "required_progress": 3, "metric": "courses_done",
    },
    {
        "id": 4, "key": "five_courses",
        "name": "Bilimdon",
        "description": "5 ta kursni muvaffaqiyatli yakunladingiz!",
        "tier": "platinum", "sort_order": 4,
        "requirement_text": "5 ta kursni yakunlash",
        "required_progress": 5, "metric": "courses_done",
    },
    {
        "id": 5, "key": "ten_courses",
        "name": "Ustoz",
        "description": "10 ta kursni yakunladingiz! Siz haqiqiy bilim izlovchisiz!",
        "tier": "diamond", "sort_order": 5,
        "requirement_text": "10 ta kursni yakunlash",
        "required_progress": 10, "metric": "courses_done",
    },
    # ── Focus / study time ────────────────────────────────────────────────────
    {
        "id": 6, "key": "focus_1h",
        "name": "Diqqatli",
        "description": "1 soat ta'lim vaqtini to'plash",
        "tier": "bronze", "sort_order": 6,
        "requirement_text": "1 soat ta'lim o'tkazish",
        "required_progress": 60, "metric": "focus_minutes",  # minutes
    },
    {
        "id": 7, "key": "focus_5h",
        "name": "Mashaqqatli",
        "description": "5 soat ta'lim vaqtini to'pladingiz!",
        "tier": "silver", "sort_order": 7,
        "requirement_text": "5 soat ta'lim o'tkazish",
        "required_progress": 300, "metric": "focus_minutes",
    },
    {
        "id": 8, "key": "deep_work_master",
        "name": "Chuqur ish",
        "description": "25 soat chuqur ta'lim olib bordingiz!",
        "tier": "gold", "sort_order": 8,
        "requirement_text": "25 soat ta'lim o'tkazish",
        "required_progress": 1500, "metric": "focus_minutes",
    },
    {
        "id": 9, "key": "focus_50h",
        "name": "Olim",
        "description": "50 soat ta'lim olib bordingiz! Haqiqiy olim!",
        "tier": "platinum", "sort_order": 9,
        "requirement_text": "50 soat ta'lim o'tkazish",
        "required_progress": 3000, "metric": "focus_minutes",
    },
    {
        "id": 10, "key": "focus_100h",
        "name": "Grandmaster",
        "description": "100 soat ta'lim olib bordingiz! Siz haqiqiy Grandmaster!",
        "tier": "legend", "sort_order": 10,
        "requirement_text": "100 soat ta'lim o'tkazish",
        "required_progress": 6000, "metric": "focus_minutes",
    },
    # Streak milestones (streak_3/streak_7/streak_30/streak_100) — REMOVED.
    # Superseded by the "Stage milestones" block at the end of this list,
    # which is aligned 1:1 with the 10 tree stages (streak_stages table) and
    # granted in real time by stage_service.py:check_and_award_stages() at the same
    # moment as the stage's XP bonus, instead of being lazily recomputed here
    # on every GET. If any user already holds the old streak_3/7/30/100
    # badge_key rows in user_badges, those rows are left untouched (not
    # revoked) — they just no longer appear in this list's response.
    # ── XP milestones ─────────────────────────────────────────────────────────
    {
        "id": 15, "key": "xp_100",
        "name": "Tajribali",
        "description": "100 XP to'pladingiz!",
        "tier": "bronze", "sort_order": 15,
        "requirement_text": "100 XP to'plash",
        "required_progress": 100, "metric": "total_xp",
    },
    {
        "id": 16, "key": "xp_1000",
        "name": "XP yig'uvchi",
        "description": "1 000 XP to'pladingiz!",
        "tier": "silver", "sort_order": 16,
        "requirement_text": "1 000 XP to'plash",
        "required_progress": 1000, "metric": "total_xp",
    },
    {
        "id": 17, "key": "xp_5000",
        "name": "XP ustasi",
        "description": "5 000 XP to'pladingiz! Siz haqiqiy ustasiz!",
        "tier": "gold", "sort_order": 17,
        "requirement_text": "5 000 XP to'plash",
        "required_progress": 5000, "metric": "total_xp",
    },
    {
        "id": 18, "key": "xp_10000",
        "name": "XP legendi",
        "description": "10 000 XP to'pladingiz! Siz legendasiz!",
        "tier": "diamond", "sort_order": 18,
        "requirement_text": "10 000 XP to'plash",
        "required_progress": 10000, "metric": "total_xp",
    },
    # ── Social ────────────────────────────────────────────────────────────────
    {
        "id": 19, "key": "first_connection",
        "name": "Ijtimoiy",
        "description": "Birinchi do'stingizni topdingiz!",
        "tier": "bronze", "sort_order": 19,
        "requirement_text": "Birinchi aloqani o'rnatish",
        "required_progress": 1, "metric": "connections_count",
    },
    {
        "id": 20, "key": "social_5",
        "name": "Jamoatchi",
        "description": "5 ta aloqa o'rnatdingiz!",
        "tier": "silver", "sort_order": 20,
        "requirement_text": "5 ta aloqa o'rnatish",
        "required_progress": 5, "metric": "connections_count",
    },
    # ── Public flashcard decks (step-14) ─────────────────────────────────────────
    {
        "id": 21, "key": "popular_creator",
        "name": "Mashhur muallif",
        "description": "Sizning to'plamingiz 100 marta nusxalandi!",
        "tier": "gold", "sort_order": 21,
        "requirement_text": "Birorta to'plamingiz 100 marta nusxalanishi",
        "required_progress": 100, "metric": "max_deck_clones",
    },
    # ── Stage milestones (aligned 1:1 with the 10 tree stages) ────────────────
    # Granted in real time by stage_service.py:check_and_award_stages() at the same
    # moment the stage's XP bonus is awarded — the lazy earned>=required check
    # below is a harmless idempotent safety net, not the primary grant path.
    {
        "id": 22, "key": "stage_1", "name": "O'zgarish urug'i",
        "description": "Birinchi kuningizni yakunladingiz!",
        "tier": "bronze", "sort_order": 22,
        "requirement_text": "1 kunlik streak yig'ing",
        "required_progress": 1, "metric": "streak_days",
    },
    {
        "id": 23, "key": "stage_2", "name": "Kichik ko'chat",
        "description": "3 kun ketma-ket o'qidingiz!",
        "tier": "bronze", "sort_order": 23,
        "requirement_text": "3 kunlik streak yig'ing",
        "required_progress": 3, "metric": "streak_days",
    },
    {
        "id": 24, "key": "stage_3", "name": "Yosh nihol",
        "description": "7 kun ketma-ket o'qidingiz!",
        "tier": "silver", "sort_order": 24,
        "requirement_text": "7 kunlik streak yig'ing",
        "required_progress": 7, "metric": "streak_days",
    },
    {
        "id": 25, "key": "stage_4", "name": "O'suvchi daraxt",
        "description": "14 kun ketma-ket o'qidingiz!",
        "tier": "silver", "sort_order": 25,
        "requirement_text": "14 kunlik streak yig'ing",
        "required_progress": 14, "metric": "streak_days",
    },
    {
        "id": 26, "key": "stage_5", "name": "Gullayotgan daraxt",
        "description": "30 kun ketma-ket o'qidingiz! Ajoyib!",
        "tier": "gold", "sort_order": 26,
        "requirement_text": "30 kunlik streak yig'ing",
        "required_progress": 30, "metric": "streak_days",
    },
    {
        "id": 27, "key": "stage_6", "name": "Sehrli daraxt",
        "description": "50 kun ketma-ket o'qidingiz!",
        "tier": "gold", "sort_order": 27,
        "requirement_text": "50 kunlik streak yig'ing",
        "required_progress": 50, "metric": "streak_days",
    },
    {
        "id": 28, "key": "stage_7", "name": "Gullab-yashnagan",
        "description": "75 kun ketma-ket o'qidingiz!",
        "tier": "platinum", "sort_order": 28,
        "requirement_text": "75 kunlik streak yig'ing",
        "required_progress": 75, "metric": "streak_days",
    },
    {
        "id": 29, "key": "stage_8", "name": "Qadimiy bilim",
        "description": "120 kun ketma-ket o'qidingiz!",
        "tier": "platinum", "sort_order": 29,
        "requirement_text": "120 kunlik streak yig'ing",
        "required_progress": 120, "metric": "streak_days",
    },
    {
        "id": 30, "key": "stage_9", "name": "Samoviy daraxt",
        "description": "200 kun ketma-ket o'qidingiz!",
        "tier": "diamond", "sort_order": 30,
        "requirement_text": "200 kunlik streak yig'ing",
        "required_progress": 200, "metric": "streak_days",
    },
    {
        "id": 31, "key": "stage_10", "name": "Abadiy dunyo daraxti",
        "description": "365 kun ketma-ket o'qidingiz! Siz afsonaviy insonsiz!",
        "tier": "legend", "sort_order": 31,
        "requirement_text": "365 kunlik streak yig'ing",
        "required_progress": 365, "metric": "streak_days",
    },
]

_ACH_BY_KEY = {a["key"]: a for a in ACHIEVEMENTS}


def _table_exists(db: Session, name: str) -> bool:
    row = db.execute(
        text("SELECT to_regclass(:t) IS NOT NULL AS ok"),
        {"t": f"public.{name}"},
    ).fetchone()
    return bool(row and row.ok)


@router.get("")
async def list_achievements(
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Return all achievement definitions with per-user earned status."""

    # ── 1. Fetch user stats in one query ──────────────────────────────────────
    profile_row = db.execute(
        text("""
            SELECT
                COALESCE(total_xp,            0) AS total_xp,
                COALESCE(streak_days,         0) AS streak_days,
                COALESCE(total_focus_minutes, 0) AS focus_minutes
            FROM profiles
            WHERE telegram_id = :uid
        """),
        {"uid": caller_id},
    ).fetchone()

    total_xp      = int(profile_row.total_xp)      if profile_row else 0
    streak_days   = int(profile_row.streak_days)   if profile_row else 0
    focus_minutes = int(profile_row.focus_minutes) if profile_row else 0

    courses_done = 0
    if _table_exists(db, "course_certificates"):
        row = db.execute(
            text("SELECT COUNT(*) FROM course_certificates WHERE student_id = :uid"),
            {"uid": caller_id},
        ).fetchone()
        courses_done = int(row[0]) if row else 0

    lessons_done = 0
    if _table_exists(db, "lesson_progress"):
        row = db.execute(
            text("SELECT COUNT(*) FROM lesson_progress WHERE student_id = :uid AND is_completed = TRUE"),
            {"uid": caller_id},
        ).fetchone()
        lessons_done = int(row[0]) if row else 0
    elif _table_exists(db, "xp_logs"):
        # fallback: count unique COURSE-source xp_logs as a proxy for completed lessons
        row = db.execute(
            text("SELECT COUNT(*) FROM xp_logs WHERE user_id = :uid AND source = 'LESSON'"),
            {"uid": caller_id},
        ).fetchone()
        lessons_done = int(row[0]) if row else 0

    connections_count = 0
    if _table_exists(db, "connections"):
        row = db.execute(
            text("""
                SELECT COUNT(*) FROM connections
                WHERE (requester_id = :uid OR receiver_id = :uid) AND status = 'accepted'
            """),
            {"uid": caller_id},
        ).fetchone()
        connections_count = int(row[0]) if row else 0

    max_deck_clones = 0
    if _table_exists(db, "flashcard_decks"):
        row = db.execute(
            text("SELECT COALESCE(MAX(clone_count), 0) FROM flashcard_decks WHERE user_id = :uid"),
            {"uid": caller_id},
        ).fetchone()
        max_deck_clones = int(row[0]) if row else 0

    metrics = {
        "total_xp":          total_xp,
        "streak_days":       streak_days,
        "focus_minutes":     focus_minutes,
        "courses_done":      courses_done,
        "lessons_done":      lessons_done,
        "connections_count": connections_count,
        "max_deck_clones":   max_deck_clones,
    }

    # ── 2. Load already-granted badges ───────────────────────────────────────
    granted: dict[str, datetime] = {}
    if _table_exists(db, "user_badges"):
        rows = db.execute(
            text("SELECT badge_key, granted_at FROM user_badges WHERE user_id = :uid"),
            {"uid": caller_id},
        ).fetchall()
        for r in rows:
            granted[r.badge_key] = r.granted_at

    # ── 3. Compute earned status + lazy-grant newly earned ────────────────────
    newly_earned: list[str] = []
    now = datetime.now(UTC)

    for ach in ACHIEVEMENTS:
        key      = ach["key"]
        current  = metrics.get(ach["metric"], 0)
        required = ach["required_progress"]
        earned   = current >= required

        if earned and key not in granted:
            newly_earned.append(key)
            granted[key] = now

    # Persist newly-earned badges (best-effort, ignore duplicates)
    if newly_earned and _table_exists(db, "user_badges"):
        for key in newly_earned:
            try:
                db.execute(
                    text("""
                        INSERT INTO user_badges (user_id, badge_key, granted_at)
                        VALUES (:uid, :key, :ts)
                        ON CONFLICT DO NOTHING
                    """),
                    {"uid": caller_id, "key": key, "ts": now},
                )
            except Exception:
                pass
        try:
            db.commit()
        except Exception:
            db.rollback()

    # ── 4. Build response ─────────────────────────────────────────────────────
    result = []
    for ach in ACHIEVEMENTS:
        key      = ach["key"]
        current  = metrics.get(ach["metric"], 0)
        required = ach["required_progress"]
        earned   = current >= required
        earned_at_dt = granted.get(key)

        result.append({
            "id":               ach["id"],
            "key":              ach["key"],
            "name":             ach["name"],
            "description":      ach["description"],
            "icon_url":         None,
            "tier":             ach["tier"],
            "sort_order":       ach["sort_order"],
            "requirement_text": ach["requirement_text"],
            "current_progress": min(current, required),
            "required_progress": required,
            "earned":           earned,
            "earned_at":        earned_at_dt.isoformat() if earned_at_dt else None,
        })

    return result
