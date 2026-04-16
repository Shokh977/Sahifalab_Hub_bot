"""
search.py — Universal search across people, courses, jobs, and posts.

GET /api/search?q=...&type=all|people|courses|jobs|posts

type=all     → top 5 per category, 4 sections
type=people  → up to 20, ranked by relevance + connection + completeness + xp
type=courses → up to 20, ranked by relevance + rating + enrolled_count
type=jobs    → up to 20, ranked by relevance + recency
type=posts   → up to 20, ranked by relevance + engagement

Authentication is required (prevents unauthenticated scraping of user data).
"""

import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token

logger = logging.getLogger(__name__)

router = APIRouter(tags=["search"])

SearchType = Literal["all", "people", "courses", "jobs", "posts"]

_PER_TYPE_LIMIT = 20
_ALL_LIMIT      = 5   # results per section when type=all


# ── Auth ──────────────────────────────────────────────────────────────────────

def _auth(authorization: Optional[str] = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Avtorizatsiya talab qilinadi")
    tid = decode_token(authorization.split(" ", 1)[1])
    if not tid:
        raise HTTPException(401, "Token noto'g'ri yoki muddati o'tgan")
    return tid


# ── People search ─────────────────────────────────────────────────────────────
# Ranking formula (all normalised to 0–1 where possible):
#   query_relevance  × 10   (1 = name/username exact-prefix, 0.7 = headline,
#                             0.5 = bio/skill match, 0.3 = partial elsewhere)
#   connection_degree × 5   (1 = 1st-degree, 0.5 = 2nd-degree)
#   profile_completeness × 3 (0–100 → divided by 100)
#   xp × 0.001
#
# Profile completeness (max 100):
#   has_avatar(20) + has_headline(20) + has_bio(15) + has_3_skills(15)
#   + has_location(10) + has_certificate(10) + has_cover(10)

def _search_people(db: Session, q: str, viewer_id: int, limit: int) -> list[dict]:
    rows = db.execute(text("""
        WITH
        -- 1st-degree connections of the viewer
        my_1st AS (
            SELECT CASE WHEN requester_id = :vid THEN receiver_id
                        ELSE requester_id END AS uid
            FROM connections
            WHERE (requester_id = :vid OR receiver_id = :vid) AND status = 'accepted'
        ),
        -- 2nd-degree: connections of my connections (excluding self and 1st)
        my_2nd AS (
            SELECT DISTINCT CASE WHEN c.requester_id IN (SELECT uid FROM my_1st)
                                 THEN c.receiver_id
                                 ELSE c.requester_id END AS uid
            FROM connections c
            WHERE (c.requester_id IN (SELECT uid FROM my_1st)
                OR c.receiver_id  IN (SELECT uid FROM my_1st))
              AND c.status = 'accepted'
              AND CASE WHEN c.requester_id IN (SELECT uid FROM my_1st)
                       THEN c.receiver_id ELSE c.requester_id END != :vid
              AND CASE WHEN c.requester_id IN (SELECT uid FROM my_1st)
                       THEN c.receiver_id ELSE c.requester_id END
                   NOT IN (SELECT uid FROM my_1st)
        ),
        -- Skill matches: users who have a skill matching the query
        skill_matches AS (
            SELECT DISTINCT user_id
            FROM skills
            WHERE skill_name ILIKE '%' || :q || '%'
        )
        SELECT
            p.telegram_id,
            p.first_name,
            p.username,
            p.photo_url,
            COALESCE(p.headline,      '')        AS headline,
            COALESCE(p.location_city, '')        AS location_city,
            COALESCE(p.account_type,  'student') AS account_type,
            COALESCE(p.is_verified,   FALSE)     AS is_verified,
            COALESCE(p.level, 1)                 AS level,
            COALESCE(p.total_xp, 0)              AS total_xp,

            -- query_relevance: highest match wins
            CASE
                WHEN p.username   ILIKE :q OR p.first_name ILIKE :q   THEN 1.0
                WHEN p.username   ILIKE :q_pct OR p.first_name ILIKE :q_pct THEN 0.85
                WHEN p.headline   ILIKE :q_pct                         THEN 0.7
                WHEN p.bio        ILIKE :q_pct                         THEN 0.5
                WHEN p.telegram_id IN (SELECT user_id FROM skill_matches) THEN 0.5
                ELSE 0.3
            END AS relevance,

            -- connection_degree
            CASE
                WHEN p.telegram_id IN (SELECT uid FROM my_1st) THEN 1.0
                WHEN p.telegram_id IN (SELECT uid FROM my_2nd) THEN 0.5
                ELSE 0.0
            END AS conn_degree,

            -- profile completeness (0-100)
            (
                CASE WHEN p.photo_url       IS NOT NULL THEN 20 ELSE 0 END
              + CASE WHEN p.headline        IS NOT NULL AND p.headline != '' THEN 20 ELSE 0 END
              + CASE WHEN p.bio             IS NOT NULL AND p.bio     != '' THEN 15 ELSE 0 END
              + CASE WHEN (
                    SELECT COUNT(*) FROM skills s WHERE s.user_id = p.telegram_id
                  ) >= 3 THEN 15 ELSE 0 END
              + CASE WHEN p.location_city   IS NOT NULL AND p.location_city != '' THEN 10 ELSE 0 END
              + CASE WHEN EXISTS (
                    SELECT 1 FROM course_certificates cc WHERE cc.student_id = p.telegram_id
                  ) THEN 10 ELSE 0 END
              + CASE WHEN p.cover_image_url IS NOT NULL THEN 10 ELSE 0 END
            ) AS completeness

        FROM profiles p
        WHERE p.telegram_id != :vid
          AND COALESCE(p.status, 'active') = 'active'
          AND (
               p.first_name    ILIKE :q_pct
            OR p.username      ILIKE :q_pct
            OR p.headline      ILIKE :q_pct
            OR p.bio           ILIKE :q_pct
            OR p.telegram_id IN (SELECT user_id FROM skill_matches)
          )
        ORDER BY
            (relevance * 10 + conn_degree * 5 + completeness::float / 100.0 * 3
             + COALESCE(p.total_xp, 0) * 0.001) DESC
        LIMIT :lim
    """), {
        "q":     q,
        "q_pct": f"%{q}%",
        "vid":   viewer_id,
        "lim":   limit,
    }).mappings().fetchall()

    return [
        {
            "id":            r["telegram_id"],
            "name":          r["first_name"] or "",
            "username":      r["username"],
            "avatar_url":    r["photo_url"],
            "headline":      r["headline"],
            "location_city": r["location_city"],
            "account_type":  r["account_type"],
            "is_verified":   r["is_verified"],
            "level":         r["level"],
            "total_xp":      r["total_xp"],
            "completeness":  r["completeness"],
        }
        for r in rows
    ]


# ── Courses search ────────────────────────────────────────────────────────────

def _search_courses(db: Session, q: str, limit: int) -> list[dict]:
    rows = db.execute(text("""
        SELECT
            c.id,
            c.title,
            c.description,
            c.thumbnail_url,
            c.price,
            c.is_paid,
            c.level,
            c.rating,
            c.enrolled_count,
            p.first_name AS teacher_name,
            p.username   AS teacher_username,
            CASE
                WHEN c.title       ILIKE :q      THEN 1.0
                WHEN c.title       ILIKE :q_pct  THEN 0.8
                WHEN c.description ILIKE :q_pct  THEN 0.5
                WHEN p.first_name  ILIKE :q_pct  THEN 0.4
                ELSE 0.3
            END AS relevance
        FROM courses c
        LEFT JOIN profiles p ON p.telegram_id = c.teacher_id
        WHERE c.is_published = TRUE
          AND (
               c.title       ILIKE :q_pct
            OR c.description ILIKE :q_pct
            OR p.first_name  ILIKE :q_pct
          )
        ORDER BY (relevance * 10 + c.rating + c.enrolled_count * 0.01) DESC
        LIMIT :lim
    """), {"q": q, "q_pct": f"%{q}%", "lim": limit}).mappings().fetchall()

    return [
        {
            "id":              r["id"],
            "title":           r["title"],
            "description":     (r["description"] or "")[:200],
            "thumbnail_url":   r["thumbnail_url"],
            "price":           float(r["price"]) if r["price"] is not None else 0.0,
            "is_paid":         r["is_paid"],
            "level":           r["level"],
            "rating":          float(r["rating"]) if r["rating"] else 0.0,
            "enrolled_count":  r["enrolled_count"],
            "teacher_name":    r["teacher_name"] or "",
            "teacher_username": r["teacher_username"],
        }
        for r in rows
    ]


# ── Jobs search ───────────────────────────────────────────────────────────────

def _search_jobs(db: Session, q: str, limit: int) -> list[dict]:
    rows = db.execute(text("""
        SELECT
            j.id,
            j.title,
            j.company_name,
            j.location,
            j.job_type,
            j.salary_min,
            j.salary_max,
            j.salary_currency,
            j.required_skills,
            j.created_at,
            j.expires_at,
            p.first_name AS poster_name,
            p.username   AS poster_username
        FROM jobs j
        LEFT JOIN profiles p ON p.telegram_id = j.posted_by
        WHERE j.is_active = TRUE
          AND (j.expires_at IS NULL OR j.expires_at > NOW())
          AND (
               j.title        ILIKE :q_pct
            OR j.company_name ILIKE :q_pct
            OR j.location     ILIKE :q_pct
            OR j.description  ILIKE :q_pct
            OR j.required_skills::text ILIKE :q_pct
          )
        ORDER BY
            CASE WHEN j.title ILIKE :q_pct THEN 1 ELSE 0 END DESC,
            j.created_at DESC
        LIMIT :lim
    """), {"q_pct": f"%{q}%", "lim": limit}).mappings().fetchall()

    return [
        {
            "id":               r["id"],
            "title":            r["title"],
            "company_name":     r["company_name"],
            "location":         r["location"],
            "job_type":         r["job_type"],
            "salary_min":       r["salary_min"],
            "salary_max":       r["salary_max"],
            "salary_currency":  r["salary_currency"],
            "required_skills":  r["required_skills"] or [],
            "created_at":       r["created_at"].isoformat() if r["created_at"] else None,
            "expires_at":       r["expires_at"].isoformat() if r["expires_at"] else None,
            "poster_name":      r["poster_name"] or "",
            "poster_username":  r["poster_username"],
        }
        for r in rows
    ]


# ── Posts search ──────────────────────────────────────────────────────────────

def _search_posts(db: Session, q: str, limit: int) -> list[dict]:
    rows = db.execute(text("""
        SELECT
            po.id,
            po.content,
            po.image_url,
            po.likes_count,
            po.comments_count,
            po.views_count,
            po.created_at,
            p.telegram_id AS author_id,
            p.first_name  AS author_name,
            p.username    AS author_username,
            p.photo_url   AS author_avatar
        FROM posts po
        JOIN profiles p ON p.telegram_id = po.author_id
        WHERE po.content ILIKE :q_pct
        ORDER BY
            (po.likes_count * 1 + po.comments_count * 3 + po.views_count * 0.1) DESC,
            po.created_at DESC
        LIMIT :lim
    """), {"q_pct": f"%{q}%", "lim": limit}).mappings().fetchall()

    return [
        {
            "id":             r["id"],
            "content":        (r["content"] or "")[:300],
            "image_url":      r["image_url"],
            "likes_count":    r["likes_count"],
            "comments_count": r["comments_count"],
            "views_count":    r["views_count"],
            "created_at":     r["created_at"].isoformat() if r["created_at"] else None,
            "author": {
                "id":         r["author_id"],
                "name":       r["author_name"] or "",
                "username":   r["author_username"],
                "avatar_url": r["author_avatar"],
            },
        }
        for r in rows
    ]


# ══════════════════════════════════════════════════════════════════════════════
# ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

@router.get("")
def universal_search(
    q:    str         = Query(..., min_length=1, max_length=100),
    type: SearchType  = Query("all"),
    viewer_id: int    = Depends(_auth),
    db:   Session     = Depends(get_db),
):
    """
    Universal search endpoint.

    type=all     → { people, courses, jobs, posts } — top 5 each
    type=people  → { people } — up to 20, ranked
    type=courses → { courses } — up to 20
    type=jobs    → { jobs } — up to 20
    type=posts   → { posts } — up to 20
    """
    q = q.strip()
    if not q:
        raise HTTPException(400, "Qidiruv so'rovi bo'sh bo'lmasligi kerak")

    limit   = _PER_TYPE_LIMIT
    a_limit = _ALL_LIMIT

    if type == "people":
        return {"people": _search_people(db, q, viewer_id, limit)}

    if type == "courses":
        return {"courses": _search_courses(db, q, limit)}

    if type == "jobs":
        return {"jobs": _search_jobs(db, q, limit)}

    if type == "posts":
        return {"posts": _search_posts(db, q, limit)}

    # type == "all"
    return {
        "people":  _search_people(db, q, viewer_id, a_limit),
        "courses": _search_courses(db, q, a_limit),
        "jobs":    _search_jobs(db, q, a_limit),
        "posts":   _search_posts(db, q, a_limit),
        "query":   q,
    }
