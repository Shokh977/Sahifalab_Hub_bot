"""
integration_service.py — Cross-feature integration hooks.

Every significant user action (course completion, level-up, post creation, etc.)
flows through here to keep the activity log, feed, and notifications in sync.

Design rules:
  - All public hook_*() functions are FIRE-AND-FORGET — they must never raise
    an unhandled exception (primary request must always succeed).
  - log_activity() uses ON CONFLICT DO NOTHING so hooks are safe to call more
    than once (idempotent).
  - Async notifications are scheduled on the running event loop if one exists,
    following the same pattern used in social_routes._fire_notification().
  - Connections are notified in bulk via _notify_connections_bg().

Public API
----------
    log_activity(db, user_id, activity_type, ...)    → None (sync, idempotent)
    calculate_profile_completeness(db, user_id)      → int  (0-100)
    hook_course_completed(db, user_id, ...)           → None
    hook_quiz_passed(db, user_id, ...)                → None
    hook_level_up(db, user_id, ...)                   → None
    hook_post_created(db, user_id, post_id)           → None
    hook_course_published(db, teacher_id, ...)        → None
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy import text, func

from app.models.models import Profile
from app.models.social_models import Post, Skill

logger = logging.getLogger(__name__)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _fire(coro):
    """Schedule an async coroutine on the running event loop (fire-and-forget)."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            asyncio.run_coroutine_threadsafe(coro, loop)
    except Exception as exc:
        logger.debug("_fire: could not schedule coroutine: %s", exc)


def _get_profile(db: Session, user_id: int) -> Optional[Profile]:
    try:
        return db.query(Profile).filter(Profile.telegram_id == user_id).first()
    except Exception:
        return None


def _get_connection_ids(db: Session, user_id: int) -> list[int]:
    """Return telegram_ids of all accepted connections for user_id."""
    try:
        rows = db.execute(text("""
            SELECT CASE
                WHEN requester_id = :uid THEN receiver_id
                ELSE requester_id
            END AS other_id
            FROM connections
            WHERE (requester_id = :uid OR receiver_id = :uid)
              AND status = 'accepted'
        """), {"uid": user_id}).fetchall()
        return [int(r[0]) for r in rows]
    except Exception as exc:
        logger.debug("_get_connection_ids failed: %s", exc)
        return []


async def _notify_one(user_id: int, notif_type: str, category: str, meta: dict):
    """Send one notification — imported lazily to avoid circular imports."""
    if user_id <= 0:
        return
    try:
        from app.api.v1.endpoints.notifications import send_notification
        await send_notification(user_id, notif_type, category, meta)
    except Exception as exc:
        logger.debug("_notify_one(%s, %s) failed: %s", user_id, notif_type, exc)


def _notify_connections_bg(
    connection_ids: list[int],
    notif_type: str,
    category: str,
    meta: dict,
):
    """Fire notifications to all connections in background (fire-and-forget)."""
    async def _bulk():
        for uid in connection_ids:
            await _notify_one(uid, notif_type, category, meta)
    _fire(_bulk())


# ── Activity log ──────────────────────────────────────────────────────────────

def log_activity(
    db: Session,
    user_id: int,
    activity_type: str,
    reference_id: Optional[str] = None,
    reference_type: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    """
    Append an entry to activity_log (idempotent via ON CONFLICT DO NOTHING).

    Accepted activity_types:
        course_completed | certificate_earned | level_up |
        post_created | course_published | connection_made | job_posted
    """
    try:
        db.execute(text("""
            INSERT INTO activity_log
                (user_id, activity_type, reference_id, reference_type,
                 metadata, created_at)
            VALUES
                (:uid, :atype, :ref_id, :ref_type,
                 CAST(:meta AS jsonb), NOW())
            ON CONFLICT (user_id, activity_type, reference_id, reference_type)
            DO NOTHING
        """), {
            "uid":      user_id,
            "atype":    activity_type,
            "ref_id":   str(reference_id) if reference_id is not None else None,
            "ref_type": reference_type,
            "meta":     _jsonb_str(metadata),
        })
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.debug("log_activity(%s, %s) failed: %s", user_id, activity_type, exc)


def _jsonb_str(d: Optional[dict]) -> Optional[str]:
    if d is None:
        return None
    import json
    return json.dumps(d, ensure_ascii=False)


# ── Auto-post ─────────────────────────────────────────────────────────────────

def _auto_post(
    db: Session,
    user_id: int,
    content: str,
    post_type: str = "text",
    post_metadata: Optional[dict] = None,
) -> Optional[Post]:
    """
    Create an auto-generated post in the feed.
    Returns the new Post ORM object, or None on failure.
    """
    try:
        post = Post(
            author_id=user_id,
            content=content,
            post_type=post_type,
            post_metadata=post_metadata,
        )
        db.add(post)
        db.commit()
        db.refresh(post)
        return post
    except Exception as exc:
        db.rollback()
        logger.debug("_auto_post(%s) failed: %s", user_id, exc)
        return None


# ── Profile completeness ──────────────────────────────────────────────────────

def calculate_profile_completeness(db: Session, user_id: int) -> int:
    """
    Calculate profile completeness score (0-100).

    Weights:
        avatar_url       +20
        headline         +20
        bio              +15
        skills ≥ 3       +15
        location_city    +10
        certificate ≥ 1  +10
        cover_image_url  +10
    """
    profile = _get_profile(db, user_id)
    if not profile:
        return 0

    score = 0

    if getattr(profile, "photo_url", None):
        score += 20
    if getattr(profile, "headline", None):
        score += 20
    if getattr(profile, "bio", None):
        score += 15
    if getattr(profile, "location_city", None):
        score += 10
    if getattr(profile, "cover_image_url", None):
        score += 10

    # Skills count
    try:
        skill_count = (
            db.query(func.count(Skill.id))
            .filter(Skill.user_id == user_id)
            .scalar()
        ) or 0
        if skill_count >= 3:
            score += 15
    except Exception:
        pass

    # Certificates count (cross-schema — use raw SQL)
    try:
        cert_row = db.execute(
            text("SELECT COUNT(*) FROM course_certificates WHERE student_id = :uid"),
            {"uid": user_id},
        ).fetchone()
        if cert_row and int(cert_row[0]) >= 1:
            score += 10
    except Exception:
        pass

    return min(score, 100)


# ════════════════════════════════════════════════════════════════════════════════
# HOOK 1 — Course completed
# ════════════════════════════════════════════════════════════════════════════════

def hook_course_completed(
    db: Session,
    user_id: int,
    course_id: int,
    course_title: str,
    skill_tags: list[str],
) -> None:
    """
    Triggered when a user earns COURSE XP for the first time (xp_added > 0).

    Steps:
      1. Auto-verify skills from course skill_tags
      2. Insert activity_log: course_completed
      3. Create auto-post in feed
      4. Notify connections
    """
    try:
        profile = _get_profile(db, user_id)
        if not profile:
            return

        name = profile.first_name or "Foydalanuvchi"

        # 1. Auto-verify skills
        if skill_tags:
            try:
                from app.services.skills_service import auto_verify_skills
                auto_verify_skills(db, user_id, skill_tags, verified_by=f"course:{course_id}")
            except Exception as exc:
                logger.debug("hook_course_completed: auto_verify_skills failed: %s", exc)

        # 2. Activity log
        log_activity(
            db, user_id,
            activity_type="course_completed",
            reference_id=str(course_id),
            reference_type="course",
            metadata={"course_title": course_title},
        )

        # 3. Auto-post
        _auto_post(
            db, user_id,
            content=f"{name} «{course_title}» kursini yakunladi! 🎓",
            post_type="achievement",
            post_metadata={
                "achievement_type": "course_completed",
                "course_id": course_id,
                "course_title": course_title,
            },
        )

        # 4. Notify connections (background)
        conn_ids = _get_connection_ids(db, user_id)
        if conn_ids:
            _notify_connections_bg(
                conn_ids,
                notif_type="connection_achievement",
                category="SOCIAL",
                meta={
                    "actor_id": user_id,
                    "actor_name": name,
                    "course_title": course_title,
                    "achievement": "course_completed",
                },
            )

    except Exception as exc:
        logger.warning("hook_course_completed(%s, %s) failed: %s", user_id, course_id, exc)


# ════════════════════════════════════════════════════════════════════════════════
# HOOK 2 — Quiz/test passed (certificate earned)
# ════════════════════════════════════════════════════════════════════════════════

def hook_quiz_passed(
    db: Session,
    user_id: int,
    quiz_id: int,
    quiz_title: str,
    score: float,
    skill_tags: Optional[list[str]] = None,
) -> None:
    """
    Triggered on the FIRST time a quiz is passed (xp_awarded=True).

    Steps:
      1. Auto-verify skills from quiz skill_tags
      2. Insert activity_log: certificate_earned
      3. Create auto-post
      4. Notify connections
    """
    try:
        profile = _get_profile(db, user_id)
        if not profile:
            return

        name = profile.first_name or "Foydalanuvchi"

        # 1. Auto-verify skills
        if skill_tags:
            try:
                from app.services.skills_service import auto_verify_skills
                auto_verify_skills(db, user_id, skill_tags, verified_by=f"test:{quiz_id}")
            except Exception as exc:
                logger.debug("hook_quiz_passed: auto_verify_skills failed: %s", exc)

        # 2. Activity log
        log_activity(
            db, user_id,
            activity_type="certificate_earned",
            reference_id=str(quiz_id),
            reference_type="quiz",
            metadata={"quiz_title": quiz_title, "score": score},
        )

        # 3. Auto-post
        score_int = int(round(score))
        _auto_post(
            db, user_id,
            content=f"{name} «{quiz_title}» testini {score_int}% natija bilan yakunladi! 🏆",
            post_type="achievement",
            post_metadata={
                "achievement_type": "quiz_passed",
                "quiz_id": quiz_id,
                "quiz_title": quiz_title,
                "score": score_int,
            },
        )

        # 4. Notify connections (background)
        conn_ids = _get_connection_ids(db, user_id)
        if conn_ids:
            _notify_connections_bg(
                conn_ids,
                notif_type="connection_achievement",
                category="SOCIAL",
                meta={
                    "actor_id": user_id,
                    "actor_name": name,
                    "quiz_title": quiz_title,
                    "score": score_int,
                    "achievement": "quiz_passed",
                },
            )

    except Exception as exc:
        logger.warning("hook_quiz_passed(%s, %s) failed: %s", user_id, quiz_id, exc)


# ════════════════════════════════════════════════════════════════════════════════
# HOOK 3 — Level up
# ════════════════════════════════════════════════════════════════════════════════

_LEVEL_NAMES = {
    1: "Yangi boshlash", 2: "O'rganuvchi", 3: "O'rganuvchi",
    4: "Rivojlanuvchi", 5: "Rivojlanuvchi", 6: "Rivojlanuvchi",
    7: "Faol", 8: "Faol", 9: "Faol",
    10: "Mutaxassis", 11: "Mutaxassis", 12: "Mutaxassis",
    13: "Tajribali", 14: "Tajribali", 15: "Tajribali", 16: "Tajribali",
    17: "Senior", 18: "Senior", 19: "Senior", 20: "Senior",
    21: "Ekspert", 22: "Ekspert", 23: "Ekspert", 24: "Ekspert",
    25: "Usta", 26: "Usta", 27: "Grandmaster",
}


def _level_name(level: int) -> str:
    return _LEVEL_NAMES.get(level, "Grandmaster")


def hook_level_up(
    db: Session,
    user_id: int,
    new_level: int,
) -> None:
    """
    Triggered when add_xp() returns a new_level > old_level.

    Steps:
      1. Insert activity_log: level_up
      2. Create auto-post
      3. Notify connections
    """
    try:
        profile = _get_profile(db, user_id)
        if not profile:
            return

        name = profile.first_name or "Foydalanuvchi"
        level_name = _level_name(new_level)

        # 1. Activity log
        log_activity(
            db, user_id,
            activity_type="level_up",
            reference_id=str(new_level),
            reference_type="level",
            metadata={"new_level": new_level, "new_level_name": level_name},
        )

        # 2. Auto-post
        _auto_post(
            db, user_id,
            content=f"{name} «{level_name}» ({new_level}-daraja) darajasiga yetdi! ⭐",
            post_type="achievement",
            post_metadata={
                "achievement_type": "level_up",
                "new_level": new_level,
                "level_name": level_name,
            },
        )

        # 3. Notify connections (background)
        conn_ids = _get_connection_ids(db, user_id)
        if conn_ids:
            _notify_connections_bg(
                conn_ids,
                notif_type="connection_achievement",
                category="SOCIAL",
                meta={
                    "actor_id": user_id,
                    "actor_name": name,
                    "new_level": new_level,
                    "level_name": level_name,
                    "achievement": "level_up",
                },
            )

    except Exception as exc:
        logger.warning("hook_level_up(%s, %s) failed: %s", user_id, new_level, exc)


# ════════════════════════════════════════════════════════════════════════════════
# HOOK 4 — Post created
# ════════════════════════════════════════════════════════════════════════════════

def hook_post_created(
    db: Session,
    user_id: int,
    post_id: int,
) -> None:
    """
    Triggered immediately after create_post() succeeds.

    Steps:
      1. Insert activity_log: post_created
      (views_count and saves_count already default to 0 in the model)
    """
    try:
        log_activity(
            db, user_id,
            activity_type="post_created",
            reference_id=str(post_id),
            reference_type="post",
        )
    except Exception as exc:
        logger.warning("hook_post_created(%s, %s) failed: %s", user_id, post_id, exc)


# ════════════════════════════════════════════════════════════════════════════════
# HOOK 5 — Course published (teacher)
# ════════════════════════════════════════════════════════════════════════════════

def hook_course_published(
    db: Session,
    teacher_id: int,
    course_id: int,
    course_title: str,
    thumbnail_url: Optional[str] = None,
    price: Optional[float] = None,
    is_paid: bool = False,
) -> None:
    """
    Triggered when a teacher sets is_published=True on a course.

    Steps:
      1. Create course_announcement auto-post in feed
      2. Insert activity_log: course_published
      3. Notify teacher's connections
    """
    try:
        profile = _get_profile(db, teacher_id)
        if not profile:
            return

        name = profile.first_name or "O'qituvchi"

        # 1. Auto-post: course_announcement type
        _auto_post(
            db, teacher_id,
            content=f"{name} yangi kurs e'lon qildi: «{course_title}»",
            post_type="course_announcement",
            post_metadata={
                "course_id": course_id,
                "course_title": course_title,
                "course_thumbnail": thumbnail_url,
                "price": price,
                "is_paid": is_paid,
                "teacher_name": name,
            },
        )

        # 2. Activity log
        log_activity(
            db, teacher_id,
            activity_type="course_published",
            reference_id=str(course_id),
            reference_type="course",
            metadata={"course_title": course_title},
        )

        # 3. Notify connections (background)
        conn_ids = _get_connection_ids(db, teacher_id)
        if conn_ids:
            _notify_connections_bg(
                conn_ids,
                notif_type="connection_course_published",
                category="SOCIAL",
                meta={
                    "actor_id": teacher_id,
                    "actor_name": name,
                    "course_id": course_id,
                    "course_title": course_title,
                },
            )

    except Exception as exc:
        logger.warning("hook_course_published(%s, %s) failed: %s", teacher_id, course_id, exc)


# ════════════════════════════════════════════════════════════════════════════════
# HOOK 6 — Connection accepted (notifications)
# Note: activity_log for both users is already handled in connections.py _log_activity()
# This hook adds the push notifications on top.
# ════════════════════════════════════════════════════════════════════════════════

def hook_connection_accepted(
    db: Session,
    acceptor_id: int,
    requester_id: int,
) -> None:
    """
    Triggered when a connection request is accepted.
    Sends a notification to the requester (the person who sent the request).
    Activity log is already handled by _log_activity() in connections.py.
    """
    try:
        profile = _get_profile(db, acceptor_id)
        name = (profile.first_name if profile else None) or "Foydalanuvchi"

        _fire(_notify_one(
            requester_id,
            notif_type="connection_accepted",
            category="SOCIAL",
            meta={"actor_id": acceptor_id, "actor_name": name},
        ))
    except Exception as exc:
        logger.warning("hook_connection_accepted(%s, %s) failed: %s", acceptor_id, requester_id, exc)
