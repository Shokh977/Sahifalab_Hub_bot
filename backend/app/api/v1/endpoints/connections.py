"""
connections.py — Mutual connection system (LinkedIn-style) + follow sync.

All endpoints require authentication.  Connections are bidirectional:
once accepted, either party can see the other in their connections list.

When a request is sent:
  • requester auto-follows receiver (one-way follow, immediately)
When a request is accepted:
  • receiver auto-follows requester (now mutual follows + mutual connection)
When a connection is removed (disconnect):
  • both follow relationships are deleted
When a pending request is cancelled:
  • requester→receiver follow is deleted

Routes (mounted at /api/connections):
  POST   /request              — send a connection request
  POST   /cancel               — cancel a pending request you sent
  PUT    /{id}/accept          — accept a pending request (receiver only)
  PUT    /{id}/decline         — decline a pending request (receiver only)
  DELETE /{id}                 — remove an accepted connection (either party)
  GET    /                     — list my accepted connections (?search=)
  GET    /pending              — { sent: [...], received: [...] }
  GET    /mutual/{user_id}     — mutual connections between me and user_id
  GET    /suggestions          — top-10 smart suggestions
"""

import logging
from datetime import datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, and_, text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import Profile
from app.models.social_models import Connection, Follow, ActivityLog
from app.services.auth_service import decode_token
from app.services.integration_service import hook_connection_accepted

logger = logging.getLogger(__name__)

router = APIRouter(tags=["connections"])


# ── Auth ──────────────────────────────────────────────────────────────────────

def _auth(authorization: Optional[str] = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Avtorizatsiya talab qilinadi")
    tid = decode_token(authorization.split(" ", 1)[1])
    if not tid:
        raise HTTPException(401, "Token noto'g'ri yoki muddati o'tgan")
    return tid


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mini(p: Profile) -> dict:
    return {
        "id":           p.telegram_id,
        "name":         p.first_name or "",
        "username":     p.username,
        "avatar_url":   p.photo_url,
        "headline":     getattr(p, "headline", None),
        "level":        p.level or 1,
        "account_type": getattr(p, "account_type", "student") or "student",
        "is_verified":  getattr(p, "is_verified", False) or False,
    }


def _log_activity(db: Session, user_id: int, other_id: int) -> None:
    """Log connection_made for both parties. Idempotent via ON CONFLICT."""
    db.execute(text("""
        INSERT INTO activity_log
            (user_id, activity_type, reference_id, reference_type,
             metadata, created_at)
        VALUES
            (:uid1, 'connection_made', :ref1, 'connection',
             jsonb_build_object('with_user_id', :ref1_int), NOW()),
            (:uid2, 'connection_made', :ref2, 'connection',
             jsonb_build_object('with_user_id', :ref2_int), NOW())
        ON CONFLICT (user_id, activity_type, reference_id, reference_type)
        DO NOTHING
    """), {
        "uid1": user_id,        "ref1": str(other_id), "ref1_int": other_id,
        "uid2": other_id,       "ref2": str(user_id),  "ref2_int": user_id,
    })


def _get_conn(db: Session, conn_id: int) -> Connection:
    conn = db.query(Connection).filter(Connection.id == conn_id).first()
    if not conn:
        raise HTTPException(404, "Ulanish topilmadi")
    return conn


def _ensure_follow(db: Session, follower_id: int, following_id: int) -> bool:
    """Insert follow if not already present; update counts. Returns True if inserted."""
    if follower_id == following_id:
        return False
    existing = db.query(Follow).filter(
        Follow.follower_id == follower_id,
        Follow.following_id == following_id,
    ).first()
    if existing:
        return False
    db.add(Follow(follower_id=follower_id, following_id=following_id))
    db.query(Profile).filter(Profile.telegram_id == follower_id).update(
        {Profile.following_count: Profile.following_count + 1}, synchronize_session=False
    )
    db.query(Profile).filter(Profile.telegram_id == following_id).update(
        {Profile.followers_count: Profile.followers_count + 1}, synchronize_session=False
    )
    return True


def _remove_follow(db: Session, follower_id: int, following_id: int) -> bool:
    """Delete follow if present; update counts. Returns True if deleted."""
    follow = db.query(Follow).filter(
        Follow.follower_id == follower_id,
        Follow.following_id == following_id,
    ).first()
    if not follow:
        return False
    db.delete(follow)
    db.query(Profile).filter(Profile.telegram_id == follower_id).update(
        {Profile.following_count: func.greatest(Profile.following_count - 1, 0)},
        synchronize_session=False,
    )
    db.query(Profile).filter(Profile.telegram_id == following_id).update(
        {Profile.followers_count: func.greatest(Profile.followers_count - 1, 0)},
        synchronize_session=False,
    )
    return True


# ══════════════════════════════════════════════════════════════════════════════
# REQUEST / CANCEL / ACCEPT / DECLINE / REMOVE
# ══════════════════════════════════════════════════════════════════════════════

class ConnectionRequestBody(BaseModel):
    receiver_id: int


class CancelRequestBody(BaseModel):
    connection_id: int


@router.post("/request")
def send_request(
    body: ConnectionRequestBody,
    viewer_id: int = Depends(_auth),
    db: Session = Depends(get_db),
):
    """
    Send a connection request. Fails if already connected or pending.
    Auto-follows: requester immediately starts following receiver.
    """
    if body.receiver_id == viewer_id:
        raise HTTPException(400, "O'zingizga ulanish so'rovi yubora olmaysiz")

    if not db.query(Profile).filter(Profile.telegram_id == body.receiver_id).first():
        raise HTTPException(404, "Foydalanuvchi topilmadi")

    existing = db.query(Connection).filter(
        or_(
            and_(Connection.requester_id == viewer_id,        Connection.receiver_id == body.receiver_id),
            and_(Connection.requester_id == body.receiver_id, Connection.receiver_id == viewer_id),
        )
    ).first()

    if existing:
        if existing.status == "accepted":
            raise HTTPException(409, "Siz allaqachon ulangandirsiz")
        if existing.status == "pending":
            raise HTTPException(409, "So'rov allaqachon yuborilgan yoki qabul kutilmoqda")
        if existing.status == "declined":
            existing.status       = "pending"
            existing.requester_id = viewer_id
            existing.receiver_id  = body.receiver_id
            existing.accepted_at  = None
            # Re-establish auto-follow
            _ensure_follow(db, viewer_id, body.receiver_id)
            db.commit()
            db.refresh(existing)
            return {"ok": True, "id": existing.id, "status": "pending"}

    conn = Connection(requester_id=viewer_id, receiver_id=body.receiver_id, status="pending")
    db.add(conn)

    # Auto-follow: requester → receiver
    _ensure_follow(db, viewer_id, body.receiver_id)

    try:
        db.commit()
        db.refresh(conn)
    except Exception:
        db.rollback()
        raise HTTPException(500, "So'rovni saqlashda xatolik")

    return {"ok": True, "id": conn.id, "status": "pending"}


@router.post("/cancel")
def cancel_request(
    body: CancelRequestBody,
    viewer_id: int = Depends(_auth),
    db: Session = Depends(get_db),
):
    """Cancel a pending connection request that YOU sent."""
    conn = _get_conn(db, body.connection_id)

    if conn.requester_id != viewer_id:
        raise HTTPException(403, "Faqat so'rov yuborgan foydalanuvchi bekor qila oladi")
    if conn.status != "pending":
        raise HTTPException(400, f"So'rov holati: {conn.status} — bekor qilib bo'lmaydi")

    receiver_id = conn.receiver_id
    db.delete(conn)

    # Remove auto-follow that was added on request
    _remove_follow(db, viewer_id, receiver_id)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(500, "Bekor qilishda xatolik")

    return {"ok": True}


@router.put("/{conn_id}/accept")
def accept_request(
    conn_id: int,
    viewer_id: int = Depends(_auth),
    db: Session = Depends(get_db),
):
    """
    Accept a pending connection request (receiver only).
    Auto-follows: receiver now follows requester (mutual follows established).
    Both users' connections_count incremented.
    """
    conn = _get_conn(db, conn_id)

    if conn.receiver_id != viewer_id:
        raise HTTPException(403, "Faqat qabul qiluvchi qabul qila oladi")
    if conn.status != "pending":
        raise HTTPException(400, f"So'rov holati: {conn.status} — qabul qilib bo'lmaydi")

    conn.status = "accepted"
    conn.accepted_at = datetime.now(UTC)

    requester_id = conn.requester_id

    # ── Critical: status + mutual follow ─────────────────────────────────────
    try:
        _ensure_follow(db, viewer_id, requester_id)
        db.commit()
        db.refresh(conn)
    except Exception as exc:
        db.rollback()
        logger.exception("accept_request(%s) failed: %s", conn_id, exc)
        raise HTTPException(500, "Qabul qilishda xatolik")

    # ── Best-effort: connections_count (skipped if column not yet migrated) ──
    try:
        db.query(Profile).filter(Profile.telegram_id.in_([viewer_id, requester_id])).update(
            {Profile.connections_count: Profile.connections_count + 1}, synchronize_session=False
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("accept_request(%s): connections_count update skipped: %s", conn_id, exc)

    # ── Best-effort: activity log (skipped if constraint not yet migrated) ───
    try:
        _log_activity(db, viewer_id, requester_id)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("accept_request(%s): activity log skipped: %s", conn_id, exc)

    # HOOK 6: notify the requester that their request was accepted
    hook_connection_accepted(db, acceptor_id=viewer_id, requester_id=requester_id)

    requester = db.query(Profile).filter(Profile.telegram_id == requester_id).first()
    return {
        "ok":          True,
        "id":          conn.id,
        "status":      conn.status,
        "accepted_at": conn.accepted_at.isoformat() if conn.accepted_at else None,
        "user":        _mini(requester) if requester else None,
    }


@router.put("/{conn_id}/decline")
def decline_request(
    conn_id: int,
    viewer_id: int = Depends(_auth),
    db: Session = Depends(get_db),
):
    """
    Decline a pending connection request (receiver only).
    The requester's auto-follow stays (matches LinkedIn behavior).
    """
    conn = _get_conn(db, conn_id)

    if conn.receiver_id != viewer_id:
        raise HTTPException(403, "Faqat qabul qiluvchi rad eta oladi")
    if conn.status != "pending":
        raise HTTPException(400, f"So'rov holati: {conn.status} — rad etib bo'lmaydi")

    conn.status = "declined"
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(500, "Rad etishda xatolik")

    return {"ok": True, "id": conn_id, "status": "declined"}


@router.delete("/{conn_id}")
def remove_connection(
    conn_id: int,
    viewer_id: int = Depends(_auth),
    db: Session = Depends(get_db),
):
    """
    Remove an accepted connection (either party).
    Both follow relationships are deleted and counts are decremented.
    """
    conn = _get_conn(db, conn_id)

    is_party = conn.requester_id == viewer_id or conn.receiver_id == viewer_id
    if not is_party:
        raise HTTPException(403, "Bu ulanishga ruxsatingiz yo'q")

    if conn.status == "pending" and conn.receiver_id == viewer_id:
        raise HTTPException(400, "Kiruvchi so'rovni rad etish uchun /decline dan foydalaning")

    user_a = conn.requester_id
    user_b = conn.receiver_id
    was_accepted = conn.status == "accepted"

    db.delete(conn)
    _remove_follow(db, user_a, user_b)
    _remove_follow(db, user_b, user_a)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(500, "Ulanishni o'chirishda xatolik")

    if was_accepted:
        try:
            db.query(Profile).filter(Profile.telegram_id.in_([user_a, user_b])).update(
                {Profile.connections_count: func.greatest(Profile.connections_count - 1, 0)},
                synchronize_session=False,
            )
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("remove_connection: connections_count update skipped: %s", exc)

    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
# LIST ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/pending")
def get_pending(
    viewer_id: int = Depends(_auth),
    db: Session = Depends(get_db),
):
    """Returns { sent: [...], received: [...] } pending connection requests."""
    sent_rows = (
        db.query(Connection, Profile)
        .join(Profile, Profile.telegram_id == Connection.receiver_id)
        .filter(Connection.requester_id == viewer_id, Connection.status == "pending")
        .order_by(Connection.created_at.desc())
        .all()
    )
    received_rows = (
        db.query(Connection, Profile)
        .join(Profile, Profile.telegram_id == Connection.requester_id)
        .filter(Connection.receiver_id == viewer_id, Connection.status == "pending")
        .order_by(Connection.created_at.desc())
        .all()
    )

    def _fmt(conn: Connection, profile: Profile) -> dict:
        return {
            "connection_id": conn.id,
            "created_at":    conn.created_at.isoformat() if conn.created_at else None,
            "user":          _mini(profile),
        }

    return {
        "sent":     [_fmt(c, p) for c, p in sent_rows],
        "received": [_fmt(c, p) for c, p in received_rows],
    }


@router.get("/mutual/{user_id}")
def get_mutual(
    user_id: int,
    viewer_id: int = Depends(_auth),
    db: Session = Depends(get_db),
):
    """List mutual accepted connections between the viewer and another user."""
    rows = db.execute(text("""
        WITH my_conns AS (
            SELECT CASE WHEN requester_id = :vid THEN receiver_id
                        ELSE requester_id END AS uid
            FROM connections
            WHERE (requester_id = :vid OR receiver_id = :vid)
              AND status = 'accepted'
        ),
        their_conns AS (
            SELECT CASE WHEN requester_id = :tid THEN receiver_id
                        ELSE requester_id END AS uid
            FROM connections
            WHERE (requester_id = :tid OR receiver_id = :tid)
              AND status = 'accepted'
        )
        SELECT p.telegram_id, p.first_name, p.username, p.photo_url,
               p.level, p.total_xp,
               COALESCE(p.headline, '')     AS headline,
               COALESCE(p.account_type, 'student') AS account_type,
               COALESCE(p.is_verified, FALSE)       AS is_verified
        FROM my_conns m
        JOIN their_conns t ON t.uid = m.uid
        JOIN profiles p    ON p.telegram_id = m.uid
        ORDER BY p.first_name
    """), {"vid": viewer_id, "tid": user_id}).mappings().fetchall()

    return {
        "count": len(rows),
        "users": [
            {
                "id":           r["telegram_id"],
                "name":         r["first_name"] or "",
                "username":     r["username"],
                "avatar_url":   r["photo_url"],
                "headline":     r["headline"],
                "level":        r["level"] or 1,
                "account_type": r["account_type"],
                "is_verified":  r["is_verified"],
            }
            for r in rows
        ],
    }


@router.get("/suggestions")
def get_suggestions(
    viewer_id: int = Depends(_auth),
    db: Session = Depends(get_db),
):
    """
    Top-10 suggested users to connect with.

    Score per candidate =
      mutual_connections × 3
      + shared_courses   × 2
      + same_city        × 2
      + shared_skills    × 1
      + similar_level    × 1   (within ±1 level)

    Excludes users already connected or with any pending request.
    """
    rows = db.execute(text("""
        WITH viewer_connections AS (
            SELECT CASE WHEN requester_id = :vid THEN receiver_id
                        ELSE requester_id END AS uid
            FROM connections
            WHERE requester_id = :vid OR receiver_id = :vid
        ),
        viewer_courses AS (
            SELECT course_id FROM course_enrollments WHERE student_id = :vid
        ),
        viewer_skills AS (
            SELECT lower(skill_name) AS sname FROM skills WHERE user_id = :vid
        ),
        viewer_profile AS (
            SELECT COALESCE(location_city, '') AS city,
                   COALESCE(level, 1)          AS lvl
            FROM profiles WHERE telegram_id = :vid
        ),
        candidates AS (
            SELECT p.telegram_id AS tid
            FROM profiles p
            WHERE p.telegram_id != :vid
              AND COALESCE(p.status, 'active') = 'active'
              AND p.telegram_id NOT IN (SELECT uid FROM viewer_connections)
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

            (SELECT COUNT(*)
             FROM (
                 SELECT CASE WHEN c.requester_id = p.telegram_id
                             THEN c.receiver_id ELSE c.requester_id END AS uid
                 FROM connections c
                 WHERE (c.requester_id = p.telegram_id OR c.receiver_id = p.telegram_id)
                   AND c.status = 'accepted'
             ) tc
             WHERE tc.uid IN (SELECT uid FROM viewer_connections)
            ) AS mutual,

            (SELECT COUNT(*)
             FROM course_enrollments ce
             WHERE ce.student_id = p.telegram_id
               AND ce.course_id IN (SELECT course_id FROM viewer_courses)
            ) AS shared_courses,

            CASE WHEN p.location_city IS NOT NULL
                  AND p.location_city = (SELECT city FROM viewer_profile)
                  AND p.location_city != ''
                 THEN 1 ELSE 0 END AS same_city,

            (SELECT COUNT(*)
             FROM skills s
             WHERE s.user_id = p.telegram_id
               AND lower(s.skill_name) IN (SELECT sname FROM viewer_skills)
            ) AS shared_skills,

            CASE WHEN ABS(COALESCE(p.level, 1) -
                          (SELECT lvl FROM viewer_profile)) <= 1
                 THEN 1 ELSE 0 END AS similar_level

        FROM candidates ca
        JOIN profiles p ON p.telegram_id = ca.tid
        ORDER BY
            (
                (SELECT COUNT(*)
                 FROM (SELECT CASE WHEN c.requester_id = p.telegram_id THEN c.receiver_id ELSE c.requester_id END AS uid
                       FROM connections c
                       WHERE (c.requester_id = p.telegram_id OR c.receiver_id = p.telegram_id) AND c.status = 'accepted') tc
                 WHERE tc.uid IN (SELECT uid FROM viewer_connections)
                ) * 3
              + (SELECT COUNT(*) FROM course_enrollments ce
                 WHERE ce.student_id = p.telegram_id
                   AND ce.course_id IN (SELECT course_id FROM viewer_courses)) * 2
              + CASE WHEN p.location_city IS NOT NULL
                      AND p.location_city = (SELECT city FROM viewer_profile)
                      AND p.location_city != ''
                     THEN 2 ELSE 0 END
              + (SELECT COUNT(*) FROM skills s
                 WHERE s.user_id = p.telegram_id
                   AND lower(s.skill_name) IN (SELECT sname FROM viewer_skills))
              + CASE WHEN ABS(COALESCE(p.level,1) - (SELECT lvl FROM viewer_profile)) <= 1
                     THEN 1 ELSE 0 END
            ) DESC,
            p.total_xp DESC
        LIMIT 10
    """), {"vid": viewer_id}).mappings().fetchall()

    return [
        {
            "id":             r["telegram_id"],
            "name":           r["first_name"] or "",
            "username":       r["username"],
            "avatar_url":     r["photo_url"],
            "headline":       r["headline"],
            "location_city":  r["location_city"],
            "account_type":   r["account_type"],
            "is_verified":    r["is_verified"],
            "level":          r["level"],
            "total_xp":       r["total_xp"],
            "score_breakdown": {
                "mutual_connections": int(r["mutual"]),
                "shared_courses":     int(r["shared_courses"]),
                "same_city":          int(r["same_city"]),
                "shared_skills":      int(r["shared_skills"]),
                "similar_level":      int(r["similar_level"]),
            },
        }
        for r in rows
    ]


@router.get("/")
@router.get("")
def list_connections(
    search: Optional[str] = Query(None),
    viewer_id: int = Depends(_auth),
    db: Session = Depends(get_db),
):
    """List accepted connections for the current user. Optional ?search= filter."""
    q = db.execute(text("""
        SELECT
            c.id            AS conn_id,
            c.accepted_at,
            p.telegram_id,
            p.first_name,
            p.username,
            p.photo_url,
            COALESCE(p.headline,      '')        AS headline,
            COALESCE(p.location_city, '')        AS location_city,
            COALESCE(p.account_type,  'student') AS account_type,
            COALESCE(p.is_verified,   FALSE)     AS is_verified,
            COALESCE(p.level, 1)                 AS level
        FROM connections c
        JOIN profiles p
          ON p.telegram_id = CASE
               WHEN c.requester_id = :vid THEN c.receiver_id
               ELSE c.requester_id
             END
        WHERE (c.requester_id = :vid OR c.receiver_id = :vid)
          AND c.status = 'accepted'
          AND (
               CAST(:search AS text) IS NULL
               OR p.first_name ILIKE '%' || CAST(:search AS text) || '%'
               OR p.username   ILIKE '%' || CAST(:search AS text) || '%'
          )
        ORDER BY c.accepted_at DESC
    """), {"vid": viewer_id, "search": search or None}).mappings().fetchall()

    return [
        {
            "connection_id": r["conn_id"],
            "accepted_at":   r["accepted_at"].isoformat() if r["accepted_at"] else None,
            "user": {
                "id":            r["telegram_id"],
                "name":          r["first_name"] or "",
                "username":      r["username"],
                "avatar_url":    r["photo_url"],
                "headline":      r["headline"],
                "location_city": r["location_city"],
                "account_type":  r["account_type"],
                "is_verified":   r["is_verified"],
                "level":         r["level"],
            },
        }
        for r in q
    ]
