"""
profile_public.py — Public profile page and skills API.

Two routers, both registered in api/v1/__init__.py:
  profile_router  → mounted at /profile
  skills_router   → mounted at /skills

Profile endpoints:
  GET  /profile/{username}    — full public profile (all sections)
  PUT  /profile/me            — update own headline / bio / location
  GET  /profile/me/views      — profile view analytics (own views only)

Skills endpoints:
  GET    /skills/{username}          — list user's skills
  POST   /skills                     — add skill to own profile
  DELETE /skills/{skill_id}          — remove own skill
  PUT    /skills/reorder             — reorder own skills
  POST   /skills/{skill_id}/endorse  — toggle endorsement (idempotent)
"""

import io
import uuid
import math
import logging
from datetime import datetime, UTC, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy import func, or_, and_, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.api.v1.endpoints.upload import _upload_to_bunny, _cdn_url

from app.db.session import get_db
from app.models.models import Profile
from app.models.social_models import (
    Post, Skill, SkillEndorsement, Connection, ActivityLog, ProfileViewLog,
)
from app.services.auth_service import decode_token
from app.services.integration_service import calculate_profile_completeness

logger = logging.getLogger(__name__)

profile_router = APIRouter(tags=["profile"])
skills_router  = APIRouter(tags=["skills"])


# ── Level helpers ─────────────────────────────────────────────────────────────
# Must mirror the SQL calculate_level_from_xp() function (see 038_xp_gamification).

_LEVEL_NAMES = {
    1:  "Navkar",
    2:  "Chokar",
    3:  "G'ulom",
    4:  "Yasovul",
    5:  "Munshiy",
    6:  "Mirzo",
    7:  "Mahram",
    8:  "Ko'kalosh",
    9:  "To'qsabo",
    10: "Yuzboshi",
    11: "Mingboshi",
    12: "Darug'a",
    13: "Parvonachi",
    14: "Shog'ovul",
    15: "Otaliq",
    16: "Inoq",
    17: "Bijiy",
    18: "Bek",
    19: "Biy",
    20: "Beklarbegi",
    21: "Noib",
    22: "Qo'shbegi",
    23: "Amir",
    24: "Sulton",
    25: "Xon",
    26: "Xoqon",
    27: "Sohibqiron",
    28: "Shahanshoh",
    29: "Zulqarnayn",
}


def _level_name(level: int) -> str:
    return _LEVEL_NAMES.get(level, "Zulqarnayn")


def _next_level_xp(level: int) -> int:
    """XP required to reach the next level (mirrors SQL formula)."""
    if level >= 29:
        return 0  # max level reached
    return math.ceil(100 * (level + 1) ** 2.5)


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _optional_viewer(authorization: Optional[str]) -> Optional[int]:
    """Extract telegram_id from Bearer header; return None if absent or invalid."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return decode_token(authorization.split(" ", 1)[1])


def _require_viewer(authorization: Optional[str]) -> int:
    """Extract telegram_id; raise 401 if missing or invalid."""
    tid = _optional_viewer(authorization)
    if not tid:
        raise HTTPException(status_code=401, detail="Avtorizatsiya talab qilinadi")
    return tid


# ── Pydantic request models ───────────────────────────────────────────────────

class ProfileUpdateRequest(BaseModel):
    first_name:      Optional[str] = None
    headline:        Optional[str] = None
    bio:             Optional[str] = None
    location_city:   Optional[str] = None
    cover_image_url: Optional[str] = None
    website_url:     Optional[str] = None
    photo_url:       Optional[str] = None
    site_username:   Optional[str] = None

    @field_validator("headline")
    @classmethod
    def validate_headline(cls, v):
        if v is not None and len(v) > 120:
            raise ValueError("Sarlavha 120 ta belgidan oshmasligi kerak")
        return v

    @field_validator("bio")
    @classmethod
    def validate_bio(cls, v):
        if v is not None and len(v) > 500:
            raise ValueError("Bio 500 ta belgidan oshmasligi kerak")
        return v

    @field_validator("site_username")
    @classmethod
    def validate_site_username(cls, v):
        import re
        if v is not None:
            v = v.strip().lower()
            if not re.match(r'^[a-z0-9_]{3,30}$', v):
                raise ValueError("Foydalanuvchi nomi 3-30 ta harf, raqam yoki _ belgidan iborat bo'lishi kerak")
        return v


class AddSkillRequest(BaseModel):
    skill_name: str

    @field_validator("skill_name")
    @classmethod
    def validate_skill_name(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Ko'nikma nomi bo'sh bo'lmasligi kerak")
        if len(v) > 100:
            raise ValueError("Ko'nikma nomi 100 ta belgidan oshmasligi kerak")
        return v


class ReorderSkillsRequest(BaseModel):
    skill_ids: list[int]   # ordered list of skill PKs — new display_order = index


# ── Profile view deduplication ────────────────────────────────────────────────

def _maybe_log_view(db: Session, profile_id: int, viewer_id: Optional[int]) -> None:
    """
    Insert a profile_view_log row if the viewer hasn't viewed this profile
    in the last 24 hours.  The DB trigger handles incrementing the counters.
    Self-views are silently skipped.
    """
    if viewer_id is None or viewer_id == profile_id:
        return
    if not _table_exists(db, "profile_view_logs"):
        return

    cutoff = datetime.now(UTC) - timedelta(hours=24)
    query_failed = object()
    recent = _db_fallback(
        db,
        "profile_view_logs.recent",
        query_failed,
        lambda: (
            db.query(ProfileViewLog)
            .filter(
                ProfileViewLog.profile_user_id == profile_id,
                ProfileViewLog.viewer_user_id  == viewer_id,
                ProfileViewLog.viewed_at       >= cutoff,
            )
            .first()
        ),
    )
    if recent is query_failed or recent:
        return

    log = ProfileViewLog(profile_user_id=profile_id, viewer_user_id=viewer_id)
    db.add(log)
    try:
        db.commit()
    except Exception:
        db.rollback()  # non-critical — don't fail the whole request


# ── Shared profile serialiser ─────────────────────────────────────────────────

def _serialize_profile_user(p: Profile) -> dict:
    focus_min = p.total_focus_minutes or 0
    return {
        "id":                p.telegram_id,
        "name":              p.first_name or "",
        "username":          p.site_username,
        "headline":          getattr(p, "headline", None),
        "bio":               p.bio,
        "avatar_url":        p.photo_url,
        "cover_image_url":   getattr(p, "cover_image_url", None),
        "location_city":     getattr(p, "location_city", None),
        "website_url":       getattr(p, "website_url", None),
        "level":             p.level or 1,
        "level_name":        _level_name(p.level or 1),
        "xp":                p.total_xp or 0,
        "next_level_xp":     _next_level_xp(p.level or 1),
        "focus_hours":       round(focus_min / 60, 1),
        "tests_completed":   p.quizzes_completed or 0,
        "profile_views_week": getattr(p, "profile_views_week", 0) or 0,
        "is_verified":       getattr(p, "is_verified", False) or False,
        "account_type":      getattr(p, "account_type", "student") or "student",
        "role":              getattr(p, "role", "student") or "student",
        "joined_at":         p.app_created_at.isoformat() if p.app_created_at else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PROFILE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

def _db_fallback(db: Session, label: str, default, fn):
    """Run a DB block and fall back cleanly if optional profile data is unavailable."""
    try:
        return fn()
    except Exception as exc:
        db.rollback()
        logger.warning("Public profile fallback for %s: %s", label, exc)
        return default


def _table_exists(db: Session, table_name: str) -> bool:
    return bool(_db_fallback(
        db,
        f"table_exists:{table_name}",
        False,
        lambda: db.execute(
            text("SELECT to_regclass(:table_name) IS NOT NULL"),
            {"table_name": f"public.{table_name}"},
        ).scalar(),
    ))


def _column_exists(db: Session, table_name: str, column_name: str) -> bool:
    return bool(_db_fallback(
        db,
        f"column_exists:{table_name}.{column_name}",
        False,
        lambda: db.execute(text("""
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = :table_name
                  AND column_name = :column_name
            )
        """), {
            "table_name": table_name,
            "column_name": column_name,
        }).scalar(),
    ))


@profile_router.get("/me/views")
def get_my_views(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Returns profile view analytics for the authenticated user.
    Response: { weekly_count, total_count, recent_viewers }
    """
    viewer_id = _require_viewer(authorization)
    profile = db.query(Profile).filter(Profile.telegram_id == viewer_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil topilmadi")

    week_ago = datetime.now(UTC) - timedelta(days=7)
    has_profile_view_logs = _table_exists(db, "profile_view_logs")

    # Weekly count from view log (source of truth)
    weekly_count = 0
    if has_profile_view_logs:
        weekly_count = _db_fallback(
            db,
            "profile_views.weekly_count",
            0,
            lambda: (
                db.query(func.count(ProfileViewLog.id))
                .filter(
                    ProfileViewLog.profile_user_id == viewer_id,
                    ProfileViewLog.viewed_at >= week_ago,
                )
                .scalar()
            ) or 0,
        )

    # Total stored on profile (kept in sync by trigger)
    total_count = getattr(profile, "profile_views", 0) or 0

    # Recent unique viewers (max 20)
    recent_rows = []
    if has_profile_view_logs:
        recent_rows = _db_fallback(
            db,
            "profile_views.recent_rows",
            [],
            lambda: (
                db.query(ProfileViewLog)
                .filter(
                    ProfileViewLog.profile_user_id == viewer_id,
                    ProfileViewLog.viewer_user_id.isnot(None),
                )
                .order_by(ProfileViewLog.viewed_at.desc())
                .limit(20)
                .all()
            ),
        )
    viewer_ids = list({r.viewer_user_id for r in recent_rows})
    viewer_profiles = (
        db.query(Profile).filter(Profile.telegram_id.in_(viewer_ids)).all()
        if viewer_ids else []
    )
    vp_map = {vp.telegram_id: vp for vp in viewer_profiles}

    recent_viewers = []
    seen = set()
    for row in recent_rows:
        vid = row.viewer_user_id
        if vid in seen or vid not in vp_map:
            continue
        seen.add(vid)
        vp = vp_map[vid]
        recent_viewers.append({
            "id":         vp.telegram_id,
            "name":       vp.first_name or "",
            "username":   vp.site_username,
            "avatar_url": vp.photo_url,
            "viewed_at":  row.viewed_at.isoformat(),
        })

    return {
        "weekly_count":   weekly_count,
        "total_count":    total_count,
        "recent_viewers": recent_viewers,
    }


@profile_router.get("/me")
def get_my_profile(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Return the authenticated user's own full profile (same shape as /{username})."""
    viewer_id = _require_viewer(authorization)
    profile = db.query(Profile).filter(Profile.telegram_id == viewer_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil topilmadi")
    identifier = profile.site_username or str(profile.telegram_id)
    return get_public_profile(username=identifier, authorization=authorization, db=db)


@profile_router.put("/me")
def update_my_profile(
    body: ProfileUpdateRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Update own profile fields: headline, bio, location_city,
    cover_image_url, website_url.
    """
    viewer_id = _require_viewer(authorization)
    profile = db.query(Profile).filter(Profile.telegram_id == viewer_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profil topilmadi")

    updated: dict = {}
    if body.first_name is not None:
        v = body.first_name.strip()
        if v:
            profile.first_name = v
            updated["first_name"] = v
    if body.headline is not None:
        profile.headline = body.headline.strip() or None
        updated["headline"] = profile.headline
    if body.bio is not None:
        profile.bio = body.bio.strip() or None
        updated["bio"] = profile.bio
    if body.location_city is not None:
        profile.location_city = body.location_city.strip() or None
        updated["location_city"] = profile.location_city
    if body.cover_image_url is not None:
        profile.cover_image_url = body.cover_image_url.strip() or None
        updated["cover_image_url"] = profile.cover_image_url
    if body.website_url is not None:
        profile.website_url = body.website_url.strip() or None
        updated["website_url"] = profile.website_url
    if body.photo_url is not None:
        profile.photo_url = body.photo_url.strip() or None
        updated["photo_url"] = profile.photo_url
    if body.site_username is not None:
        new_su = body.site_username.strip().lower()
        if new_su:
            conflict = (
                db.query(Profile)
                .filter(
                    func.lower(Profile.site_username) == new_su,
                    Profile.telegram_id != viewer_id,
                )
                .first()
            )
            if conflict:
                raise HTTPException(status_code=409, detail="Bu foydalanuvchi nomi band")
            profile.site_username = new_su
            updated["site_username"] = new_su

    if not updated:
        return {"ok": True}

    try:
        db.commit()
        db.refresh(profile)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Profilni saqlashda xatolik")

    return {"ok": True, **updated}


# ── Upload helper ─────────────────────────────────────────────────────────────

_ALLOWED_IMAGE_MIME = {"image/jpeg", "image/png", "image/webp"}
_MAX_PROFILE_IMG_BYTES = 5 * 1024 * 1024  # 5 MB


@profile_router.post("/me/upload")
async def upload_profile_image(
    file: UploadFile = File(...),
    type: str = Form(...),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Upload avatar or cover image for own profile.
    type: "avatar" | "cover"
    Returns: { url: str }
    """
    viewer_id = _require_viewer(authorization)

    if type not in ("avatar", "cover"):
        raise HTTPException(status_code=400, detail="type must be 'avatar' or 'cover'")
    if file.content_type not in _ALLOWED_IMAGE_MIME:
        raise HTTPException(status_code=415, detail="Faqat JPG, PNG yoki WebP formatdagi rasmlar")

    file_bytes = await file.read()
    if len(file_bytes) > _MAX_PROFILE_IMG_BYTES:
        raise HTTPException(status_code=413, detail="Rasm hajmi 5MB dan oshmasligi kerak")

    ext_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    ext = ext_map.get(file.content_type or "", ".jpg")
    unique_name = f"{uuid.uuid4().hex}{ext}"
    folder = "avatars" if type == "avatar" else "covers"
    remote_path = f"profiles/{folder}/{viewer_id}/{unique_name}"

    cdn_url = await _upload_to_bunny(file_bytes, remote_path, file.content_type or "image/jpeg")

    # Persist immediately so the profile reflects the new image
    profile = db.query(Profile).filter(Profile.telegram_id == viewer_id).first()
    if profile:
        if type == "avatar":
            profile.photo_url = cdn_url
        else:
            profile.cover_image_url = cdn_url
        try:
            db.commit()
        except Exception:
            db.rollback()

    return {"url": cdn_url}


@profile_router.get("/{username}")
def get_public_profile(
    username: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Full public profile — all sections in a single response.
    Side effect: logs a profile view if viewer ≠ owner and last view > 24h ago.
    """
    username = username.lstrip("@").strip()
    if not username:
        raise HTTPException(status_code=400, detail="Foydalanuvchi nomi noto'g'ri")

    # Look up by site_username first; fall back to numeric telegram_id.
    profile = (
        db.query(Profile)
        .filter(func.lower(Profile.site_username) == username.lower())
        .first()
    )
    if not profile:
        try:
            profile = (
                db.query(Profile)
                .filter(Profile.telegram_id == int(username))
                .first()
            )
        except ValueError:
            pass
    if not profile:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    tid = profile.telegram_id
    viewer_id = _optional_viewer(authorization)

    has_posts = _table_exists(db, "posts")
    has_skills = _table_exists(db, "skills")
    has_skill_endorsements = _table_exists(db, "skill_endorsements")
    has_connections = _table_exists(db, "connections")
    has_follows = _table_exists(db, "follows")
    has_courses = _table_exists(db, "courses")
    has_course_enrollments = _table_exists(db, "course_enrollments")
    has_course_certificates = _table_exists(db, "course_certificates")
    has_lesson_progress = _table_exists(db, "lesson_progress")
    has_activity_log = _table_exists(db, "activity_log")

    # ── Side effect: log profile view ─────────────────────────────────────────
    _maybe_log_view(db, tid, viewer_id)

    # ── Posts count ───────────────────────────────────────────────────────────
    posts_count = 0
    if has_posts:
        posts_count = _db_fallback(
            db,
            "posts_count",
            0,
            lambda: (
                db.query(func.count(Post.id)).filter(Post.author_id == tid).scalar()
            ) or 0,
        )

    # ── Skills (with viewer endorsement flag) ─────────────────────────────────
    skills_rows = []
    if has_skills:
        skills_rows = _db_fallback(
            db,
            "skills_rows",
            [],
            lambda: (
                db.query(Skill)
                .filter(Skill.user_id == tid)
                .order_by(Skill.display_order.asc(), Skill.endorsement_count.desc())
                .all()
            ),
        )
    endorsed_ids: set[int] = set()
    if viewer_id and skills_rows and has_skill_endorsements:
        endorsed_ids = {
            row.skill_id
            for row in _db_fallback(
                db,
                "skills_endorsed_ids",
                [],
                lambda: db.query(SkillEndorsement.skill_id).filter(
                    SkillEndorsement.endorser_id == viewer_id,
                    SkillEndorsement.skill_id.in_([s.id for s in skills_rows]),
                ).all(),
            )
        }
    skills = [
        {
            "id":                s.id,
            "skill_name":        s.skill_name,
            "is_verified":       s.is_verified,
            "endorsement_count": s.endorsement_count,
            "endorsed_by_viewer": s.id in endorsed_ids,
            "display_order":     s.display_order,
        }
        for s in skills_rows
    ]

    # ── Connection status (viewer ↔ profile owner) ────────────────────────────
    connection_status = "own" if viewer_id == tid else "none"
    connection_id: Optional[int] = None
    is_following    = False
    is_followed_by  = False
    if viewer_id and viewer_id != tid and has_connections:
        conn_row = _db_fallback(
            db,
            "connection_status",
            None,
            lambda: (
                db.query(Connection)
                .filter(
                    or_(
                        and_(Connection.requester_id == viewer_id, Connection.receiver_id == tid),
                        and_(Connection.requester_id == tid,       Connection.receiver_id == viewer_id),
                    )
                )
                .first()
            ),
        )
        if conn_row:
            connection_id = conn_row.id
            if conn_row.status == "accepted":
                connection_status = "accepted"
            elif conn_row.status == "pending" and conn_row.requester_id == viewer_id:
                connection_status = "pending_sent"
            elif conn_row.status == "pending" and conn_row.receiver_id == viewer_id:
                connection_status = "pending_received"

    if viewer_id and viewer_id != tid and has_follows:
        from app.models.social_models import Follow as FollowModel
        is_following = bool(_db_fallback(
            db,
            "is_following",
            False,
            lambda: db.query(
                db.query(FollowModel).filter(
                    FollowModel.follower_id == viewer_id,
                    FollowModel.following_id == tid,
                ).exists()
            ).scalar() or False,
        ))
        is_followed_by = bool(_db_fallback(
            db,
            "is_followed_by",
            False,
            lambda: db.query(
                db.query(FollowModel).filter(
                    FollowModel.follower_id == tid,
                    FollowModel.following_id == viewer_id,
                ).exists()
            ).scalar() or False,
        ))

    # can_message: connected OR teacher-student (either direction)
    can_message = connection_status == "accepted"
    if not can_message and viewer_id and viewer_id != tid and has_course_enrollments and has_courses:
        teacher_student = _db_fallback(
            db,
            "teacher_student_link",
            None,
            lambda: db.execute(text("""
                SELECT 1 FROM course_enrollments ce
                JOIN courses c ON c.id = ce.course_id
                WHERE (ce.student_id = :viewer AND c.teacher_id = :tid)
                   OR (ce.student_id = :tid    AND c.teacher_id = :viewer)
                LIMIT 1
            """), {"viewer": viewer_id, "tid": tid}).first(),
        )
        can_message = teacher_student is not None

    # ── Stats via raw SQL (Supabase tables accessed via direct Postgres) ──────
    connections_count = profile.connections_count or 0
    mutual_connections = 0
    if has_connections:
        connections_count = _db_fallback(
            db,
            "stats.connections_count",
            connections_count,
            lambda: db.execute(text("""
                SELECT COUNT(*) FROM connections
                WHERE (requester_id = :tid OR receiver_id = :tid)
                  AND status = 'accepted'
            """), {"tid": tid}).scalar() or 0,
        )
        if viewer_id:
            mutual_connections = _db_fallback(
                db,
                "stats.mutual_connections",
                0,
                lambda: db.execute(text("""
                    SELECT COUNT(*) FROM (
                        SELECT CASE WHEN c1.requester_id = :tid THEN c1.receiver_id
                                    ELSE c1.requester_id END AS uid
                        FROM connections c1
                        WHERE (c1.requester_id = :tid OR c1.receiver_id = :tid)
                          AND c1.status = 'accepted'
                    ) pc
                    JOIN (
                        SELECT CASE WHEN c2.requester_id = :viewer THEN c2.receiver_id
                                    ELSE c2.requester_id END AS uid
                        FROM connections c2
                        WHERE (c2.requester_id = :viewer OR c2.receiver_id = :viewer)
                          AND c2.status = 'accepted'
                    ) vc ON pc.uid = vc.uid
                """), {"tid": tid, "viewer": viewer_id}).scalar() or 0,
            )

    courses_enrolled = 0
    if has_course_enrollments:
        courses_enrolled = _db_fallback(
            db,
            "stats.courses_enrolled",
            0,
            lambda: db.execute(text("""
                SELECT COUNT(*) FROM course_enrollments WHERE student_id = :tid
            """), {"tid": tid}).scalar() or 0,
        )

    certificates_count = 0
    if has_course_certificates:
        certificates_count = _db_fallback(
            db,
            "stats.certificates_count",
            0,
            lambda: db.execute(text("""
                SELECT COUNT(*) FROM course_certificates WHERE student_id = :tid
            """), {"tid": tid}).scalar() or 0,
        )

    stats = {
        "connections_count":  int(connections_count),
        "mutual_connections": int(mutual_connections),
        "courses_enrolled":   int(courses_enrolled),
        "courses_completed":  int(certificates_count),
        "certificates_count": int(certificates_count),
    }

    # ── Certificates (max 10, most recent first) ──────────────────────────────
    certificates = []
    if has_course_certificates:
        share_token_sql = "cc.share_token" if _column_exists(db, "course_certificates", "share_token") else "NULL AS share_token"
        skill_tags_sql = "cc.skill_tags" if _column_exists(db, "course_certificates", "skill_tags") else "'[]'::jsonb AS skill_tags"
        course_name_sql = "c.title AS course_name" if has_courses else "NULL AS course_name"
        course_join_sql = "LEFT JOIN courses c ON c.id = cc.course_id" if has_courses else ""
        cert_rows = _db_fallback(
            db,
            "certificates",
            [],
            lambda: db.execute(text(f"""
                SELECT
                    cc.id,
                    cc.certificate_id,
                    cc.course_id,
                    {course_name_sql},
                    cc.completed_lessons,
                    cc.total_lessons,
                    cc.issued_at,
                    {share_token_sql},
                    {skill_tags_sql}
                FROM course_certificates cc
                {course_join_sql}
                WHERE cc.student_id = :tid
                ORDER BY cc.issued_at DESC
                LIMIT 10
            """), {"tid": tid}).mappings().fetchall(),
        )

        certificates = [
            {
                "id":             row["id"],
                "certificate_id": row["certificate_id"],
                "course_title":   row["course_name"] or "",
                "score":          (
                    round(row["completed_lessons"] / row["total_lessons"] * 100)
                    if row["total_lessons"] else 100
                ),
                "issued_at":      row["issued_at"].isoformat() if row["issued_at"] else None,
                "share_token":    row["share_token"],
                "skill_tags":     row["skill_tags"] or [],
            }
            for row in cert_rows
        ]

    # ── Active courses (enrolled, not yet completed, max 3) ───────────────────
    active_courses = []
    if has_course_enrollments and has_courses:
        lesson_progress_join = """
            LEFT JOIN (
                SELECT course_id, COUNT(*) AS done_count
                FROM lesson_progress
                WHERE student_id = :tid AND is_completed = TRUE
                GROUP BY course_id
            ) lp ON lp.course_id = ce.course_id
        """ if has_lesson_progress else """
            LEFT JOIN (
                SELECT NULL::integer AS course_id, 0::bigint AS done_count
            ) lp ON 1 = 0
        """
        active_filters = ["ce.student_id = :tid"]
        if _column_exists(db, "course_enrollments", "is_active"):
            active_filters.append("ce.is_active = TRUE")
        if has_course_certificates:
            active_filters.append(
                "ce.course_id NOT IN (SELECT course_id FROM course_certificates WHERE student_id = :tid)"
            )

        active_rows = _db_fallback(
            db,
            "active_courses",
            [],
            lambda: db.execute(text(f"""
                SELECT
                    ce.course_id,
                    c.title AS course_name,
                    c.total_lessons,
                    p.first_name AS teacher_name,
                    COALESCE(lp.done_count, 0) AS lessons_done
                FROM course_enrollments ce
                JOIN courses c ON c.id = ce.course_id
                LEFT JOIN profiles p ON p.telegram_id = c.teacher_id
                {lesson_progress_join}
                WHERE {" AND ".join(active_filters)}
                ORDER BY ce.created_at DESC
                LIMIT 3
            """), {"tid": tid}).mappings().fetchall(),
        )

        active_courses = [
            {
                "id":               row["course_id"],
                "title":            row["course_name"] or "",
                "thumbnail_url":    None,
                "progress_percent": (
                    round(row["lessons_done"] / row["total_lessons"] * 100)
                    if row["total_lessons"] else 0
                ),
                "teacher_name":     row["teacher_name"] or "",
            }
            for row in active_rows
        ]

    # ── Recent activity (last 10 from activity_log) ───────────────────────────
    activity_rows = []
    if has_activity_log:
        activity_rows = _db_fallback(
            db,
            "recent_activity",
            [],
            lambda: (
                db.query(ActivityLog)
                .filter(ActivityLog.user_id == tid)
                .order_by(ActivityLog.created_at.desc())
                .limit(10)
                .all()
            ),
        )
    recent_activity = [
        {
            "id":             a.id,
            "activity_type":  a.activity_type,
            "reference_id":   a.reference_id,
            "reference_type": a.reference_type,
            "metadata":       a.activity_metadata,
            "created_at":     a.created_at.isoformat(),
        }
        for a in activity_rows
    ]

    # ── Experiences & Education (public) ─────────────────────────────────────
    experiences = []
    education = []
    try:
        exp_rows = db.execute(text(
            "SELECT * FROM user_experiences WHERE user_id=:uid ORDER BY is_current DESC, start_date DESC"
        ), {"uid": tid}).mappings().fetchall()
        experiences = [_exp_row(r) for r in exp_rows]
    except Exception:
        pass
    try:
        edu_rows = db.execute(text(
            "SELECT * FROM user_education WHERE user_id=:uid ORDER BY end_year DESC NULLS FIRST, start_year DESC"
        ), {"uid": tid}).mappings().fetchall()
        education = [_edu_row(r) for r in edu_rows]
    except Exception:
        pass

    # ── Profile completeness ──────────────────────────────────────────────────
    completeness = calculate_profile_completeness(db, tid)

    # ── Longest streak (goal-filtered, same CTE as streaks.py) ──────────────
    daily_goal = int(profile.daily_goal_minutes or 20)
    longest_streak = _db_fallback(
        db,
        "longest_streak",
        0,
        lambda: int(db.execute(text("""
            WITH daily AS (
                SELECT session_date
                FROM focus_sessions
                WHERE user_id = :uid
                GROUP BY session_date
                HAVING SUM(minutes) >= :goal
            ),
            gaps AS (
                SELECT session_date,
                       session_date - (ROW_NUMBER() OVER (ORDER BY session_date)
                                       * INTERVAL '1 day')::interval AS grp
                FROM daily
            ),
            streaks AS (
                SELECT COUNT(*) AS streak_len FROM gaps GROUP BY grp
            )
            SELECT COALESCE(MAX(streak_len), 0) AS longest FROM streaks
        """), {"uid": tid, "goal": daily_goal}).scalar() or 0),
    )

    # ── XP percent to next level ──────────────────────────────────────────────
    total_xp = profile.total_xp or 0
    lvl = profile.level or 1
    cur_threshold = math.ceil(100 * lvl ** 2.5) if lvl > 1 else 0
    nxt_threshold = _next_level_xp(lvl)
    if nxt_threshold > cur_threshold:
        xp_pct = max(0, min(100, round((total_xp - cur_threshold) / (nxt_threshold - cur_threshold) * 100)))
    else:
        xp_pct = 100  # max level

    # ── Assemble FLAT response matching frontend ProfileData interface ────────
    return {
        # Identity
        "telegram_id":         tid,
        "username":            profile.site_username,
        "first_name":          profile.first_name or "",
        "photo_url":           profile.photo_url,
        "cover_image_url":     getattr(profile, "cover_image_url", None),
        "headline":            getattr(profile, "headline", None),
        "bio":                 profile.bio,
        "location_city":       getattr(profile, "location_city", None),
        "website_url":         getattr(profile, "website_url", None),
        "account_type":        getattr(profile, "account_type", "student") or "student",
        "is_verified":         getattr(profile, "is_verified", False) or False,
        "joined_at":           profile.app_created_at.isoformat() if profile.app_created_at else None,
        # Gamification
        "level":               lvl,
        "level_name":          _level_name(lvl),
        "total_xp":            total_xp,
        "next_level_xp":       nxt_threshold,
        "xp_percent":          xp_pct,
        # Activity
        "focus_hours":         round((profile.total_focus_minutes or 0) / 60, 1),
        "streak_days":         int(profile.streak_days or 0),
        "longest_streak":      longest_streak,
        "profile_views":       getattr(profile, "profile_views", 0) or 0,
        "profile_views_week":  getattr(profile, "profile_views_week", 0) or 0,
        "posts_count":         posts_count,
        # Stats (from subqueries)
        "connections_count":   stats["connections_count"],
        "mutual_connections":  stats["mutual_connections"],
        "courses_enrolled":    stats["courses_enrolled"],
        "courses_completed":   stats["courses_completed"],
        "certificates_count":  stats["certificates_count"],
        # Follow counts (from denormalized profile columns)
        "followers_count":     profile.followers_count or 0,
        "following_count":     profile.following_count or 0,
        # Relationship with viewer
        "connection_status":   connection_status,
        "connection_id":       connection_id,
        "is_following":        is_following,
        "is_followed_by":      is_followed_by,
        "can_message":         can_message,
        # Sections
        "skills":              skills,
        "active_courses":      active_courses,
        "recent_activity":     recent_activity,
        "certificates":        certificates,
        "experiences":         experiences,
        "education":           education,
        # Meta
        "profile_completeness": completeness,
    }


# ══════════════════════════════════════════════════════════════════════════════
# SKILLS ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@skills_router.get("/{username}")
def get_user_skills(
    username: str,
    db: Session = Depends(get_db),
):
    """List all skills for a user, ordered by display_order then endorsement_count desc."""
    username = username.lstrip("@").strip()
    profile = (
        db.query(Profile)
        .filter(func.lower(Profile.site_username) == username.lower())
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    skills = (
        db.query(Skill)
        .filter(Skill.user_id == profile.telegram_id)
        .order_by(Skill.display_order.asc(), Skill.endorsement_count.desc())
        .all()
    )
    return [
        {
            "id":               s.id,
            "skill_name":       s.skill_name,
            "is_verified":      s.is_verified,
            "verified_by":      s.verified_by,
            "endorsement_count": s.endorsement_count,
            "display_order":    s.display_order,
            "created_at":       s.created_at.isoformat() if s.created_at else None,
        }
        for s in skills
    ]


@skills_router.post("")
def add_skill(
    body: AddSkillRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Add a skill to the authenticated user's profile."""
    viewer_id = _require_viewer(authorization)

    # Duplicate check (case-insensitive)
    existing = (
        db.query(Skill)
        .filter(
            Skill.user_id == viewer_id,
            func.lower(Skill.skill_name) == body.skill_name.lower(),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"'{body.skill_name}' ko'nikmasi allaqachon qo'shilgan",
        )

    # New skill gets the next display_order slot
    max_order = (
        db.query(func.max(Skill.display_order))
        .filter(Skill.user_id == viewer_id)
        .scalar()
    ) or 0

    skill = Skill(
        user_id=viewer_id,
        skill_name=body.skill_name,
        is_verified=False,
        display_order=max_order + 1,
    )
    db.add(skill)
    try:
        db.commit()
        db.refresh(skill)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ko'nikmani saqlashda xatolik")

    return {
        "id":               skill.id,
        "skill_name":       skill.skill_name,
        "is_verified":      skill.is_verified,
        "endorsement_count": skill.endorsement_count,
        "display_order":    skill.display_order,
    }


@skills_router.delete("/{skill_id}")
def delete_skill(
    skill_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Remove a skill from the authenticated user's profile."""
    viewer_id = _require_viewer(authorization)

    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Ko'nikma topilmadi")
    if skill.user_id != viewer_id:
        raise HTTPException(status_code=403, detail="Faqat o'z ko'nikmangizni o'chirishingiz mumkin")

    db.delete(skill)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ko'nikmani o'chirishda xatolik")

    return {"ok": True}


@skills_router.put("/reorder")
def reorder_skills(
    body: ReorderSkillsRequest,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Reorder own skills.  skill_ids is the ordered list of IDs —
    index 0 gets display_order=0, index 1 gets display_order=1, etc.
    Only skills belonging to the authenticated user are updated.
    """
    viewer_id = _require_viewer(authorization)

    if not body.skill_ids:
        return {"ok": True}

    skills = (
        db.query(Skill)
        .filter(Skill.id.in_(body.skill_ids), Skill.user_id == viewer_id)
        .all()
    )
    skill_map = {s.id: s for s in skills}

    for order, sid in enumerate(body.skill_ids):
        if sid in skill_map:
            skill_map[sid].display_order = order

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Tartibni saqlashda xatolik")

    return {"ok": True}


@skills_router.post("/{skill_id}/endorse")
def toggle_endorsement(
    skill_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Toggle an endorsement on a skill.
    - If not yet endorsed → add endorsement (trigger increments count)
    - If already endorsed → remove endorsement (trigger decrements count)
    Cannot endorse own skills.
    """
    viewer_id = _require_viewer(authorization)

    skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not skill:
        raise HTTPException(status_code=404, detail="Ko'nikma topilmadi")
    if skill.user_id == viewer_id:
        raise HTTPException(
            status_code=400,
            detail="O'z ko'nikmangizni tasdiqlay olmaysiz",
        )

    existing_endorsement = (
        db.query(SkillEndorsement)
        .filter(
            SkillEndorsement.skill_id    == skill_id,
            SkillEndorsement.endorser_id == viewer_id,
        )
        .first()
    )

    if existing_endorsement:
        # Remove endorsement — trigger decrements endorsement_count
        db.delete(existing_endorsement)
        endorsed = False
    else:
        # Add endorsement — trigger increments endorsement_count
        db.add(SkillEndorsement(skill_id=skill_id, endorser_id=viewer_id))
        endorsed = True

    try:
        db.commit()
        db.refresh(skill)
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Tasdiqlashda xatolik")

    return {
        "ok":               True,
        "endorsed":         endorsed,
        "endorsement_count": skill.endorsement_count,
    }


# ══════════════════════════════════════════════════════════════════════════════
# EXPERIENCE & EDUCATION ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

class ExperienceBody(BaseModel):
    company:     str
    title:       str
    start_date:  Optional[str] = None   # "YYYY-MM"
    end_date:    Optional[str] = None
    is_current:  bool = False
    description: Optional[str] = None

class EducationBody(BaseModel):
    school:         str
    degree:         Optional[str] = None
    field_of_study: Optional[str] = None
    start_year:     Optional[int] = None
    end_year:       Optional[int] = None
    description:    Optional[str] = None


def _exp_row(row) -> dict:
    return {
        "id":          row["id"],
        "company":     row["company"],
        "title":       row["title"],
        "start_date":  row["start_date"],
        "end_date":    row["end_date"],
        "is_current":  row["is_current"],
        "description": row["description"],
    }

def _edu_row(row) -> dict:
    return {
        "id":             row["id"],
        "school":         row["school"],
        "degree":         row["degree"],
        "field_of_study": row["field_of_study"],
        "start_year":     row["start_year"],
        "end_year":       row["end_year"],
        "description":    row["description"],
    }


# ── Experiences ───────────────────────────────────────────────────────────────

@profile_router.get("/me/experiences")
def list_experiences(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    uid = _require_viewer(authorization)
    rows = db.execute(text(
        "SELECT * FROM user_experiences WHERE user_id = :uid ORDER BY is_current DESC, start_date DESC"
    ), {"uid": uid}).mappings().fetchall()
    return [_exp_row(r) for r in rows]


@profile_router.post("/me/experiences")
def add_experience(
    body: ExperienceBody,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    uid = _require_viewer(authorization)
    if not body.company.strip() or not body.title.strip():
        raise HTTPException(400, "Kompaniya va lavozim talab qilinadi")
    row = db.execute(text("""
        INSERT INTO user_experiences (user_id, company, title, start_date, end_date, is_current, description)
        VALUES (:uid, :company, :title, :start_date, :end_date, :is_current, :description)
        RETURNING *
    """), {
        "uid": uid, "company": body.company.strip(), "title": body.title.strip(),
        "start_date": body.start_date, "end_date": body.end_date,
        "is_current": body.is_current, "description": body.description,
    }).mappings().fetchone()
    db.commit()
    return _exp_row(row)


@profile_router.put("/me/experiences/{exp_id}")
def update_experience(
    exp_id: int,
    body: ExperienceBody,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    uid = _require_viewer(authorization)
    row = db.execute(text("""
        UPDATE user_experiences
        SET company=:company, title=:title, start_date=:start_date,
            end_date=:end_date, is_current=:is_current, description=:description
        WHERE id=:id AND user_id=:uid
        RETURNING *
    """), {
        "id": exp_id, "uid": uid,
        "company": body.company.strip(), "title": body.title.strip(),
        "start_date": body.start_date, "end_date": body.end_date,
        "is_current": body.is_current, "description": body.description,
    }).mappings().fetchone()
    db.commit()
    if not row:
        raise HTTPException(404, "Topilmadi")
    return _exp_row(row)


@profile_router.delete("/me/experiences/{exp_id}")
def delete_experience(
    exp_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    uid = _require_viewer(authorization)
    db.execute(text(
        "DELETE FROM user_experiences WHERE id=:id AND user_id=:uid"
    ), {"id": exp_id, "uid": uid})
    db.commit()
    return {"ok": True}


# ── Education ─────────────────────────────────────────────────────────────────

@profile_router.get("/me/education")
def list_education(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    uid = _require_viewer(authorization)
    rows = db.execute(text(
        "SELECT * FROM user_education WHERE user_id = :uid ORDER BY end_year DESC NULLS FIRST, start_year DESC"
    ), {"uid": uid}).mappings().fetchall()
    return [_edu_row(r) for r in rows]


@profile_router.post("/me/education")
def add_education(
    body: EducationBody,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    uid = _require_viewer(authorization)
    if not body.school.strip():
        raise HTTPException(400, "O'quv muassasa nomi talab qilinadi")
    row = db.execute(text("""
        INSERT INTO user_education (user_id, school, degree, field_of_study, start_year, end_year, description)
        VALUES (:uid, :school, :degree, :field_of_study, :start_year, :end_year, :description)
        RETURNING *
    """), {
        "uid": uid, "school": body.school.strip(),
        "degree": body.degree, "field_of_study": body.field_of_study,
        "start_year": body.start_year, "end_year": body.end_year,
        "description": body.description,
    }).mappings().fetchone()
    db.commit()
    return _edu_row(row)


@profile_router.put("/me/education/{edu_id}")
def update_education(
    edu_id: int,
    body: EducationBody,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    uid = _require_viewer(authorization)
    row = db.execute(text("""
        UPDATE user_education
        SET school=:school, degree=:degree, field_of_study=:field_of_study,
            start_year=:start_year, end_year=:end_year, description=:description
        WHERE id=:id AND user_id=:uid
        RETURNING *
    """), {
        "id": edu_id, "uid": uid,
        "school": body.school.strip(), "degree": body.degree,
        "field_of_study": body.field_of_study,
        "start_year": body.start_year, "end_year": body.end_year,
        "description": body.description,
    }).mappings().fetchone()
    db.commit()
    if not row:
        raise HTTPException(404, "Topilmadi")
    return _edu_row(row)


@profile_router.delete("/me/education/{edu_id}")
def delete_education(
    edu_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    uid = _require_viewer(authorization)
    db.execute(text(
        "DELETE FROM user_education WHERE id=:id AND user_id=:uid"
    ), {"id": edu_id, "uid": uid})
    db.commit()
    return {"ok": True}
