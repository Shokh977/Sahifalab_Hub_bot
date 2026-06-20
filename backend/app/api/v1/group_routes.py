"""
Group chat routes — course-linked group conversations.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token

router = APIRouter(prefix="/groups", tags=["groups"])


def get_uid(authorization: str = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    tid = decode_token(authorization.split(" ", 1)[1])
    if not tid:
        raise HTTPException(401, "Invalid token")
    return tid


# ── List user's groups ───────────────────────────────────────────────────────

@router.get("")
def list_groups(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_uid),
):
    rows = db.execute(text("""
        SELECT
            g.id,
            g.name,
            g.cover_url,
            g.course_id,
            g.created_by,
            (SELECT content    FROM group_messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) AS last_message,
            (SELECT created_at FROM group_messages WHERE group_id = g.id ORDER BY created_at DESC LIMIT 1) AS last_message_at,
            (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
            0 AS unread_count
        FROM group_chats g
        JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = :uid
        ORDER BY last_message_at DESC NULLS LAST
    """), {"uid": user_id}).fetchall()

    return [dict(r._mapping) for r in rows]


# ── Create group for a course (teacher only) ─────────────────────────────────

class CreateGroupBody(BaseModel):
    course_id: int
    name: str
    cover_url: Optional[str] = None


@router.post("")
def create_group(
    body: CreateGroupBody,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_uid),
):
    # Verify caller is the course teacher
    course = db.execute(
        text("SELECT teacher_id, thumbnail_url FROM courses WHERE id = :cid"),
        {"cid": body.course_id},
    ).fetchone()
    if not course:
        raise HTTPException(404, "Course not found")
    if course.teacher_id != user_id:
        raise HTTPException(403, "Only the course teacher can create a group")

    # Insert group (unique constraint prevents duplicates)
    try:
        row = db.execute(text("""
            INSERT INTO group_chats (course_id, name, cover_url, created_by)
            VALUES (:cid, :name, :cover, :uid)
            ON CONFLICT (course_id) DO UPDATE
                SET name = EXCLUDED.name, cover_url = EXCLUDED.cover_url
            RETURNING id, course_id, name, cover_url, created_by, created_at
        """), {
            "cid":   body.course_id,
            "name":  body.name,
            "cover": body.cover_url or course.thumbnail_url,
            "uid":   user_id,
        }).fetchone()
        group_id = row.id

        # Add teacher as admin
        db.execute(text("""
            INSERT INTO group_members (group_id, user_id, role)
            VALUES (:gid, :uid, 'admin')
            ON CONFLICT DO NOTHING
        """), {"gid": group_id, "uid": user_id})

        # Back-fill all existing enrolled students
        db.execute(text("""
            INSERT INTO group_members (group_id, user_id, role)
            SELECT :gid, e.student_id, 'member'
            FROM   course_enrollments e
            WHERE  e.course_id = :cid
            ON CONFLICT DO NOTHING
        """), {"gid": group_id, "cid": body.course_id})

        db.commit()
        return dict(row._mapping)
    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))


# ── Messages ─────────────────────────────────────────────────────────────────

@router.get("/{group_id}/messages")
def list_messages(
    group_id: int,
    before_id: Optional[int] = None,
    limit: int = 40,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_uid),
):
    # Must be a member
    member = db.execute(text(
        "SELECT 1 FROM group_members WHERE group_id=:gid AND user_id=:uid"
    ), {"gid": group_id, "uid": user_id}).fetchone()
    if not member:
        raise HTTPException(403, "Not a member of this group")

    q = """
        SELECT m.id, m.group_id, m.sender_id, m.content, m.created_at,
               p.first_name AS sender_name, p.photo_url AS sender_photo
        FROM   group_messages m
        LEFT JOIN profiles p ON p.telegram_id = m.sender_id
        WHERE  m.group_id = :gid
    """
    params: dict = {"gid": group_id, "lim": limit}
    if before_id:
        q += " AND m.id < :bid"
        params["bid"] = before_id
    q += " ORDER BY m.id DESC LIMIT :lim"

    rows = db.execute(text(q), params).fetchall()
    rows = list(reversed(rows))
    return [dict(r._mapping) for r in rows]


class SendGroupMsg(BaseModel):
    content: str


@router.post("/{group_id}/messages")
def send_message(
    group_id: int,
    body: SendGroupMsg,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_uid),
):
    member = db.execute(text(
        "SELECT 1 FROM group_members WHERE group_id=:gid AND user_id=:uid"
    ), {"gid": group_id, "uid": user_id}).fetchone()
    if not member:
        raise HTTPException(403, "Not a member of this group")

    row = db.execute(text("""
        INSERT INTO group_messages (group_id, sender_id, content)
        VALUES (:gid, :uid, :content)
        RETURNING id, group_id, sender_id, content, created_at
    """), {"gid": group_id, "uid": user_id, "content": body.content}).fetchone()
    db.commit()

    profile = db.execute(text(
        "SELECT first_name, photo_url FROM profiles WHERE telegram_id=:uid"
    ), {"uid": user_id}).fetchone()

    return {
        **dict(row._mapping),
        "sender_name":  profile.first_name if profile else "",
        "sender_photo": profile.photo_url  if profile else None,
    }


# ── Group info ────────────────────────────────────────────────────────────────

@router.get("/{group_id}")
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_uid),
):
    member = db.execute(text(
        "SELECT role FROM group_members WHERE group_id=:gid AND user_id=:uid"
    ), {"gid": group_id, "uid": user_id}).fetchone()
    if not member:
        raise HTTPException(403, "Not a member")

    row = db.execute(text("""
        SELECT g.id, g.name, g.cover_url, g.course_id, g.created_by,
               (SELECT COUNT(*) FROM group_members WHERE group_id=g.id) AS member_count
        FROM group_chats g WHERE g.id=:gid
    """), {"gid": group_id}).fetchone()
    if not row:
        raise HTTPException(404, "Group not found")

    members = db.execute(text("""
        SELECT gm.user_id, gm.role, p.first_name, p.photo_url
        FROM   group_members gm
        LEFT JOIN profiles p ON p.telegram_id = gm.user_id
        WHERE  gm.group_id = :gid
        ORDER BY gm.role DESC, p.first_name
    """), {"gid": group_id}).fetchall()

    return {
        **dict(row._mapping),
        "my_role": member.role,
        "members": [dict(m._mapping) for m in members],
    }
