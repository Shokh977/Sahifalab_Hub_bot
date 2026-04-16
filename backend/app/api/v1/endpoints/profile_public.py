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

import httpx
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, field_validator
from sqlalchemy import func, or_, and_, text
from sqlalchemy.orm import Session

from app.core.config import settings

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
    1:  "Yangi boshlash",
    2:  "O'rganuvchi",
    3:  "O'rganuvchi",
    4:  "Rivojlanuvchi",
    5:  "Rivojlanuvchi",
    6:  "Rivojlanuvchi",
    7:  "Faol",
    8:  "Faol",
    9:  "Faol",
    10: "Mutaxassis",
    11: "Mutaxassis",
    12: "Mutaxassis",
    13: "Tajribali",
    14: "Tajribali",
    15: "Tajribali",
    16: "Tajribali",
    17: "Senior",
    18: "Senior",
    19: "Senior",
    20: "Senior",
    21: "Ekspert",
    22: "Ekspert",
    23: "Ekspert",
    24: "Ekspert",
    25: "Usta",
    26: "Usta",
    27: "Grandmaster",
}


def _level_name(level: int) -> str:
    return _LEVEL_NAMES.get(level, "Grandmaster")


def _next_level_xp(level: int) -> int:
    """XP required to reach the next level (mirrors SQL formula)."""
    if level >= 27:
        return 0  # already max level
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

    cutoff = datetime.now(UTC) - timedelta(hours=24)
    recent = (
        db.query(ProfileViewLog)
        .filter(
            ProfileViewLog.profile_user_id == profile_id,
            ProfileViewLog.viewer_user_id  == viewer_id,
            ProfileViewLog.viewed_at       >= cutoff,
        )
        .first()
    )
    if recent:
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
        "username":          p.username,
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
        "joined_at":         p.app_created_at.isoformat() if p.app_created_at else None,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PROFILE ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

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

    # Weekly count from view log (source of truth)
    weekly_count = (
        db.query(func.count(ProfileViewLog.id))
        .filter(
            ProfileViewLog.profile_user_id == viewer_id,
            ProfileViewLog.viewed_at >= week_ago,
        )
        .scalar()
    ) or 0

    # Total stored on profile (kept in sync by trigger)
    total_count = getattr(profile, "profile_views", 0) or 0

    # Recent unique viewers (max 20)
    recent_rows = (
        db.query(ProfileViewLog)
        .filter(
            ProfileViewLog.profile_user_id == viewer_id,
            ProfileViewLog.viewer_user_id.isnot(None),
        )
        .order_by(ProfileViewLog.viewed_at.desc())
        .limit(20)
        .all()
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
            "username":   vp.username,
            "avatar_url": vp.photo_url,
            "viewed_at":  row.viewed_at.isoformat(),
        })

    return {
        "weekly_count":   weekly_count,
        "total_count":    total_count,
        "recent_viewers": recent_viewers,
    }


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


async def _upload_profile_image_to_bunny(file_bytes: bytes, remote_path: str, content_type: str) -> str:
    """Upload bytes to Bunny.net storage, return CDN URL."""
    if not getattr(settings, "BUNNY_STORAGE_ZONE", None) or not getattr(settings, "BUNNY_API_KEY", None):
        raise HTTPException(status_code=503, detail="Fayl saqlash xizmati sozlanmagan")
    region = getattr(settings, "BUNNY_STORAGE_REGION", "de") or "de"
    region_hosts = {
        "de": "storage.bunnycdn.com", "ny": "ny.storage.bunnycdn.com",
        "la": "la.storage.bunnycdn.com", "sg": "sg.storage.bunnycdn.com",
    }
    host = region_hosts.get(region, "storage.bunnycdn.com")
    put_url = f"https://{host}/{settings.BUNNY_STORAGE_ZONE}/{remote_path}"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.put(
            put_url, content=file_bytes,
            headers={"AccessKey": settings.BUNNY_API_KEY, "Content-Type": content_type, "Content-Length": str(len(file_bytes))},
        )
    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Yuklashda xatolik: {resp.status_code}")
    hostname = getattr(settings, "BUNNY_CDN_HOSTNAME", "").rstrip("/")
    return f"https://{hostname}/{remote_path}"


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

    cdn_url = await _upload_profile_image_to_bunny(file_bytes, remote_path, file.content_type or "image/jpeg")

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

    # Try username lookup first; fall back to numeric telegram_id so that
    # /profile/me → /profile/12345 works for users with no username.
    profile = (
        db.query(Profile)
        .filter(func.lower(Profile.username) == username.lower())
        .first()
    )
    if not profile and username.isdigit():
        profile = (
            db.query(Profile)
            .filter(Profile.telegram_id == int(username))
            .first()
        )
    if not profile:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    tid = profile.telegram_id
    viewer_id = _optional_viewer(authorization)

    # ── Side effect: log profile view ─────────────────────────────────────────
    _maybe_log_view(db, tid, viewer_id)

    # ── Posts count ───────────────────────────────────────────────────────────
    posts_count = (
        db.query(func.count(Post.id)).filter(Post.author_id == tid).scalar()
    ) or 0

    # ── Skills (with viewer endorsement flag) ─────────────────────────────────
    skills_rows = (
        db.query(Skill)
        .filter(Skill.user_id == tid)
        .order_by(Skill.display_order.asc(), Skill.endorsement_count.desc())
        .all()
    )
    endorsed_ids: set[int] = set()
    if viewer_id and skills_rows:
        endorsed_ids = {
            row.skill_id
            for row in db.query(SkillEndorsement.skill_id).filter(
                SkillEndorsement.endorser_id == viewer_id,
                SkillEndorsement.skill_id.in_([s.id for s in skills_rows]),
            ).all()
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
    if viewer_id and viewer_id != tid:
        conn_row = (
            db.query(Connection)
            .filter(
                or_(
                    and_(Connection.requester_id == viewer_id, Connection.receiver_id == tid),
                    and_(Connection.requester_id == tid,       Connection.receiver_id == viewer_id),
                )
            )
            .first()
        )
        if conn_row:
            connection_id = conn_row.id
            if conn_row.status == "accepted":
                connection_status = "accepted"
            elif conn_row.status == "pending" and conn_row.requester_id == viewer_id:
                connection_status = "pending_sent"
            elif conn_row.status == "pending" and conn_row.receiver_id == viewer_id:
                connection_status = "pending_received"

        from app.models.social_models import Follow as FollowModel
        is_following = db.query(
            db.query(FollowModel).filter(
                FollowModel.follower_id == viewer_id,
                FollowModel.following_id == tid,
            ).exists()
        ).scalar() or False
        is_followed_by = db.query(
            db.query(FollowModel).filter(
                FollowModel.follower_id == tid,
                FollowModel.following_id == viewer_id,
            ).exists()
        ).scalar() or False

    # can_message: connected OR teacher-student (either direction)
    can_message = connection_status == "accepted"
    if not can_message and viewer_id and viewer_id != tid:
        teacher_student = db.execute(text("""
            SELECT 1 FROM course_enrollments ce
            JOIN courses c ON c.id = ce.course_id
            WHERE (ce.student_id = :viewer AND c.teacher_id = :tid)
               OR (ce.student_id = :tid    AND c.teacher_id = :viewer)
            LIMIT 1
        """), {"viewer": viewer_id, "tid": tid}).first()
        can_message = teacher_student is not None

    # ── Stats via raw SQL (Supabase tables accessed via direct Postgres) ──────
    stats_row = db.execute(text("""
        SELECT
            -- accepted connections count for this user
            (
                SELECT COUNT(*) FROM connections
                WHERE (requester_id = :tid OR receiver_id = :tid) AND status = 'accepted'
            ) AS connections_count,

            -- mutual connections with viewer (0 if not logged in)
            (
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
            ) AS mutual_connections,

            -- courses enrolled
            (SELECT COUNT(*) FROM course_enrollments WHERE student_id = :tid)
                AS courses_enrolled,

            -- courses completed (has a certificate)
            (SELECT COUNT(*) FROM course_certificates WHERE student_id = :tid)
                AS courses_completed,

            -- certificates count
            (SELECT COUNT(*) FROM course_certificates WHERE student_id = :tid)
                AS certificates_count
    """), {"tid": tid, "viewer": viewer_id or 0}).mappings().first()

    stats = {
        "connections_count":  int(stats_row["connections_count"]),
        "mutual_connections": int(stats_row["mutual_connections"]),
        "courses_enrolled":   int(stats_row["courses_enrolled"]),
        "courses_completed":  int(stats_row["courses_completed"]),
        "certificates_count": int(stats_row["certificates_count"]),
    }

    # ── Certificates (max 10, most recent first) ──────────────────────────────
    cert_rows = db.execute(text("""
        SELECT
            cc.id,
            cc.certificate_id,
            cc.course_id,
            c.title AS course_name,
            cc.completed_lessons,
            cc.total_lessons,
            cc.issued_at,
            cc.share_token,
            cc.skill_tags
        FROM course_certificates cc
        LEFT JOIN courses c ON c.id = cc.course_id
        WHERE cc.student_id = :tid
        ORDER BY cc.issued_at DESC
        LIMIT 10
    """), {"tid": tid}).mappings().fetchall()

    certificates = [
        {
            "id":           row["id"],
            "certificate_id": row["certificate_id"],
            "course_title": row["course_name"] or "",
            "score":        (
                round(row["completed_lessons"] / row["total_lessons"] * 100)
                if row["total_lessons"] else 100
            ),
            "issued_at":    row["issued_at"].isoformat() if row["issued_at"] else None,
            "share_token":  row["share_token"],
            "skill_tags":   row["skill_tags"] or [],
        }
        for row in cert_rows
    ]

    # ── Active courses (enrolled, not yet completed, max 3) ───────────────────
    active_rows = db.execute(text("""
        SELECT
            ce.course_id,
            c.title AS course_name,
            c.total_lessons,
            p.first_name AS teacher_name,
            COALESCE(lp.done_count, 0) AS lessons_done
        FROM course_enrollments ce
        JOIN courses c ON c.id = ce.course_id
        LEFT JOIN profiles p ON p.telegram_id = c.teacher_id
        LEFT JOIN (
            SELECT course_id, COUNT(*) AS done_count
            FROM lesson_progress
            WHERE student_id = :tid AND is_completed = TRUE
            GROUP BY course_id
        ) lp ON lp.course_id = ce.course_id
        WHERE ce.student_id = :tid
          AND ce.is_active = TRUE
          -- exclude already-certificated courses
          AND ce.course_id NOT IN (
              SELECT course_id FROM course_certificates WHERE student_id = :tid
          )
        ORDER BY ce.created_at DESC
        LIMIT 3
    """), {"tid": tid}).mappings().fetchall()

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
    activity_rows = (
        db.query(ActivityLog)
        .filter(ActivityLog.user_id == tid)
        .order_by(ActivityLog.created_at.desc())
        .limit(10)
        .all()
    )
    recent_activity = [
        {
            "id":             a.id,
            "activity_type":  a.activity_type,
            "reference_id":   a.reference_id,
            "reference_type": a.reference_type,
            "metadata":       a.metadata,
            "created_at":     a.created_at.isoformat(),
        }
        for a in activity_rows
    ]

    # ── Profile completeness ──────────────────────────────────────────────────
    completeness = calculate_profile_completeness(db, tid)

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
        "username":            profile.username,
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
        .filter(func.lower(Profile.username) == username.lower())
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
