"""
skills_service.py — Reusable skill helpers.

The main export is auto_verify_skills(), called from course/test completion
hooks to automatically grant verified skills to a user.
"""

from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.social_models import Skill


def auto_verify_skills(
    db: Session,
    user_id: int,
    skill_tags: list[str],
    verified_by: str,
) -> list[Skill]:
    """
    Auto-verify or create skills for a user after course/test completion.

    For each skill_name in skill_tags (case-insensitive match):
      - If the user already has that skill → set is_verified=True, set verified_by
      - If the user doesn't have it       → create with is_verified=True

    Args:
        db:          SQLAlchemy Session
        user_id:     profiles.telegram_id
        skill_tags:  list of skill name strings (e.g. ["Python", "SQL"])
        verified_by: source identifier (e.g. "course:42" or "test:7")

    Returns:
        list of Skill ORM objects (upserted/updated rows)

    Raises:
        Propagates DB exceptions after rollback — callers should handle.
    """
    if not skill_tags:
        return []

    results: list[Skill] = []

    for raw_name in skill_tags:
        skill_name = raw_name.strip()
        if not skill_name:
            continue

        # Case-insensitive lookup to avoid "Python" / "python" duplicates
        existing = (
            db.query(Skill)
            .filter(
                Skill.user_id == user_id,
                func.lower(Skill.skill_name) == skill_name.lower(),
            )
            .first()
        )

        if existing:
            existing.is_verified = True
            existing.verified_by = verified_by
            results.append(existing)
        else:
            skill = Skill(
                user_id=user_id,
                skill_name=skill_name,
                is_verified=True,
                verified_by=verified_by,
            )
            db.add(skill)
            results.append(skill)

    try:
        db.commit()
        for s in results:
            db.refresh(s)
    except Exception:
        db.rollback()
        raise

    return results
