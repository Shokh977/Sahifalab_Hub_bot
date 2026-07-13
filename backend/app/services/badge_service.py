"""
badge_service.py — Trofey Xonasi (step-24): the single source of truth for
badge data, shared by GET /api/achievements, GET /api/profile/me/badges,
GET /api/profile/{username}/badges, and the top-badge decoration on
leaderboard rows / deck creator cards.

Three badge families, all stored the same way — one row per earned badge
in user_badges(user_id, badge_key) — but sourced differently:
  - challenges  : granted in real time by challenge_service.py on completion.
  - stages      : granted in real time by stage_service.py on stage-up.
  - achievements: NOT granted anywhere in real time. The only grant path is
                  compute_and_grant_achievements() below (lazy — computed
                  from the user's current stats, on demand). Before step-24
                  the only caller of this path was GET /api/achievements,
                  which no mobile screen ever called — so on production,
                  every qualifying non-stage achievement was sitting
                  ungranted until this function ran for that user at least
                  once. Any endpoint that reads achievement earned-status
                  MUST call compute_and_grant_achievements() first, not just
                  read user_badges directly, or it will show real, current
                  achievements as permanently locked.
"""
from datetime import datetime, UTC
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# ── Static achievement catalogue ───────────────────────────────────────────────
# metric: which user stat determines progress / earned status
# required_progress: value the metric must reach
# Stage badges (stage_1..stage_10) are included here too — they're aligned 1:1
# with the 10 tree stages and already granted for real by stage_service.py, so
# recomputing them here is a harmless, idempotent no-op (ON CONFLICT DO NOTHING).

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

ACH_BY_KEY = {a["key"]: a for a in ACHIEVEMENTS}


def _table_exists(db: Session, name: str) -> bool:
    row = db.execute(
        text("SELECT to_regclass(:t) IS NOT NULL AS ok"),
        {"t": f"public.{name}"},
    ).fetchone()
    return bool(row and row.ok)


def _compute_metrics(db: Session, user_id: int) -> dict:
    profile_row = db.execute(
        text("""
            SELECT
                COALESCE(total_xp,            0) AS total_xp,
                COALESCE(streak_days,         0) AS streak_days,
                COALESCE(total_focus_minutes, 0) AS focus_minutes
            FROM profiles
            WHERE telegram_id = :uid
        """),
        {"uid": user_id},
    ).fetchone()

    total_xp      = int(profile_row.total_xp)      if profile_row else 0
    streak_days   = int(profile_row.streak_days)   if profile_row else 0
    focus_minutes = int(profile_row.focus_minutes) if profile_row else 0

    courses_done = 0
    if _table_exists(db, "course_certificates"):
        row = db.execute(
            text("SELECT COUNT(*) FROM course_certificates WHERE student_id = :uid"),
            {"uid": user_id},
        ).fetchone()
        courses_done = int(row[0]) if row else 0

    lessons_done = 0
    if _table_exists(db, "lesson_progress"):
        row = db.execute(
            text("SELECT COUNT(*) FROM lesson_progress WHERE student_id = :uid AND is_completed = TRUE"),
            {"uid": user_id},
        ).fetchone()
        lessons_done = int(row[0]) if row else 0
    elif _table_exists(db, "xp_logs"):
        row = db.execute(
            text("SELECT COUNT(*) FROM xp_logs WHERE user_id = :uid AND source = 'LESSON'"),
            {"uid": user_id},
        ).fetchone()
        lessons_done = int(row[0]) if row else 0

    connections_count = 0
    if _table_exists(db, "connections"):
        row = db.execute(
            text("""
                SELECT COUNT(*) FROM connections
                WHERE (requester_id = :uid OR receiver_id = :uid) AND status = 'accepted'
            """),
            {"uid": user_id},
        ).fetchone()
        connections_count = int(row[0]) if row else 0

    max_deck_clones = 0
    if _table_exists(db, "flashcard_decks"):
        row = db.execute(
            text("SELECT COALESCE(MAX(clone_count), 0) FROM flashcard_decks WHERE user_id = :uid"),
            {"uid": user_id},
        ).fetchone()
        max_deck_clones = int(row[0]) if row else 0

    return {
        "total_xp":          total_xp,
        "streak_days":       streak_days,
        "focus_minutes":     focus_minutes,
        "courses_done":      courses_done,
        "lessons_done":      lessons_done,
        "connections_count": connections_count,
        "max_deck_clones":   max_deck_clones,
    }


def compute_and_grant_achievements(db: Session, user_id: int) -> tuple[dict, dict]:
    """
    Returns (metrics, granted) where granted = {badge_key: datetime} for every
    ACHIEVEMENTS entry the user has earned (existing + newly lazy-granted).
    Newly-qualifying badges are persisted into user_badges here.
    """
    metrics = _compute_metrics(db, user_id)

    granted: dict[str, datetime] = {}
    if _table_exists(db, "user_badges"):
        rows = db.execute(
            text("SELECT badge_key, granted_at FROM user_badges WHERE user_id = :uid"),
            {"uid": user_id},
        ).fetchall()
        for r in rows:
            granted[r.badge_key] = r.granted_at

    newly_earned: list[str] = []
    now = datetime.now(UTC)
    for ach in ACHIEVEMENTS:
        key      = ach["key"]
        current  = metrics.get(ach["metric"], 0)
        required = ach["required_progress"]
        if current >= required and key not in granted:
            newly_earned.append(key)
            granted[key] = now

    if newly_earned and _table_exists(db, "user_badges"):
        for key in newly_earned:
            try:
                db.execute(
                    text("""
                        INSERT INTO user_badges (user_id, badge_key, granted_at)
                        VALUES (:uid, :key, :ts)
                        ON CONFLICT DO NOTHING
                    """),
                    {"uid": user_id, "key": key, "ts": now},
                )
            except Exception:
                pass
        try:
            db.commit()
        except Exception:
            db.rollback()

    return metrics, granted


def get_badge_groups(db: Session, user_id: int, include_locked: bool) -> dict:
    """
    Trofey Xonasi data for one user — challenges first, then stages, then
    ordinary achievements. include_locked=False (public profile) drops every
    unearned entry from all three groups — the public API must never leak
    another user's locked badges.
    """
    _, granted = compute_and_grant_achievements(db, user_id)

    # ── Challenges — real challenges table joined against user_badges ────────
    rows = db.execute(
        text("""
            SELECT badge_key, title, color, cover_image_url, reward_xp
            FROM challenges
            WHERE badge_key IS NOT NULL
            ORDER BY created_at DESC
        """)
    ).fetchall()
    challenges = []
    for r in rows:
        earned_at = granted.get(r.badge_key)
        if not include_locked and earned_at is None:
            continue
        challenges.append({
            "key":         r.badge_key,
            "name":        r.title,
            "description": f"\"{r.title}\" musobaqasini yakunlab, ushbu nishonni qo'lga kiriting.",
            "group":       "challenges",
            "tier":        None,
            "earned":      earned_at is not None,
            "earned_at":   earned_at.isoformat() if earned_at else None,
            "challenge_color":     r.color,
            "challenge_cover_url": r.cover_image_url,
            "reward_xp":           r.reward_xp,
        })

    # ── Stages + ordinary achievements — static catalogue ────────────────────
    stages, achievements_ = [], []
    for ach in ACHIEVEMENTS:
        key       = ach["key"]
        earned_at = granted.get(key)
        earned    = earned_at is not None
        if not include_locked and not earned:
            continue
        item = {
            "key": key, "name": ach["name"], "description": ach["description"],
            "tier": ach["tier"],
            "earned": earned, "earned_at": earned_at.isoformat() if earned_at else None,
            "challenge_color": None, "challenge_cover_url": None, "reward_xp": None,
        }
        if key.startswith("stage_"):
            item["group"] = "stages"
            stages.append(item)
        else:
            item["group"] = "achievements"
            achievements_.append(item)

    if include_locked:
        earned_count = sum(1 for g in (challenges, stages, achievements_) for b in g if b["earned"])
    else:
        earned_count = len(challenges) + len(stages) + len(achievements_)

    total_challenges = db.execute(
        text("SELECT COUNT(*) FROM challenges WHERE badge_key IS NOT NULL")
    ).scalar() or 0
    total_count = int(total_challenges) + len(ACHIEVEMENTS)

    return {
        "groups": {"challenges": challenges, "stages": stages, "achievements": achievements_},
        "summary": {"earned_count": earned_count, "total_count": total_count},
    }


def get_top_badges_map(db: Session, user_ids: list[int]) -> dict:
    """
    Batched "most prestigious badge" lookup for N users in ONE query — for
    decorating leaderboard rows / deck creator cards without an N+1. Priority:
    challenge badge > highest tree stage > most-recently-earned other
    achievement (a cheap proxy for rarity — true population-based rarity
    would need an extra aggregate per badge and isn't worth it here, this is
    decoration, not a ranking system).

    Returns {user_id: {"key", "kind", "name", "color"}} — only for users who
    have at least one badge; users with none are simply absent from the dict.
    """
    if not user_ids:
        return {}

    rows = db.execute(
        text("""
            WITH ranked AS (
                SELECT
                    ub.user_id, ub.badge_key, ub.granted_at,
                    c.color AS challenge_color, c.title AS challenge_title,
                    CASE
                        WHEN c.badge_key IS NOT NULL THEN 1
                        WHEN ub.badge_key LIKE 'stage_%' THEN 2
                        ELSE 3
                    END AS priority,
                    CASE WHEN ub.badge_key LIKE 'stage_%'
                         THEN CAST(substring(ub.badge_key FROM 7) AS INT)
                         ELSE 0
                    END AS stage_num
                FROM user_badges ub
                LEFT JOIN challenges c ON c.badge_key = ub.badge_key
                WHERE ub.user_id = ANY(:ids)
            )
            SELECT DISTINCT ON (user_id)
                user_id, badge_key, priority, challenge_color, challenge_title
            FROM ranked
            ORDER BY user_id, priority ASC, stage_num DESC, granted_at DESC
        """),
        {"ids": user_ids},
    ).fetchall()

    result: dict = {}
    for r in rows:
        if r.priority == 1:
            result[r.user_id] = {
                "key": r.badge_key, "kind": "challenge",
                "name": r.challenge_title, "color": r.challenge_color,
            }
        elif r.priority == 2:
            ach = ACH_BY_KEY.get(r.badge_key)
            result[r.user_id] = {
                "key": r.badge_key, "kind": "stage",
                "name": ach["name"] if ach else r.badge_key, "color": None,
            }
        else:
            ach = ACH_BY_KEY.get(r.badge_key)
            result[r.user_id] = {
                "key": r.badge_key, "kind": "achievement",
                "name": ach["name"] if ach else r.badge_key, "color": None,
            }
    return result
