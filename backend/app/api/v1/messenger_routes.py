"""
Messenger API routes — conversations + direct messages (text/link only).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy import or_, and_, text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.schemas.social_schemas import MessageCreate, ReactionCreate
from app.services import messenger_service as msvc
from app.models.social_models import Connection
from app.models.models import Profile

router = APIRouter(prefix="/messenger", tags=["messenger"])


def get_current_user_id(authorization: str = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    tid = decode_token(authorization.split(" ", 1)[1])
    if not tid:
        raise HTTPException(401, "Invalid token")
    return tid


# ── Conversations ────────────────────────────────────────────────────────────

@router.get("/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return msvc.list_conversations(db, user_id)


def _can_message(db: Session, sender_id: int, receiver_id: int) -> bool:
    """
    Returns True when sender_id may open a DM with receiver_id:
      1. Either party is an admin (admins can message anyone), OR
      2. They have an accepted connection, OR
      3. One is enrolled in a course the other teaches.
    """
    admin = db.query(Profile).filter(
        Profile.telegram_id.in_([sender_id, receiver_id]),
        Profile.role == "admin",
    ).first()
    if admin:
        return True

    connected = db.query(Connection).filter(
        or_(
            and_(Connection.requester_id == sender_id,   Connection.receiver_id == receiver_id),
            and_(Connection.requester_id == receiver_id, Connection.receiver_id == sender_id),
        ),
        Connection.status == "accepted",
    ).first()
    if connected:
        return True

    teacher_student = db.execute(text("""
        SELECT 1 FROM course_enrollments ce
        JOIN courses c ON c.id = ce.course_id
        WHERE (ce.student_id = :sender AND c.teacher_id = :recv)
           OR (ce.student_id = :recv   AND c.teacher_id = :sender)
        LIMIT 1
    """), {"sender": sender_id, "recv": receiver_id}).first()
    return teacher_student is not None


@router.post("/conversations/{other_user_id}")
def get_or_create_conversation(
    other_user_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if user_id == other_user_id:
        raise HTTPException(400, "Cannot message yourself")
    if not _can_message(db, user_id, other_user_id):
        raise HTTPException(
            403,
            detail="Xabar yuborish uchun avval bog'laning",
        )
    return msvc.get_or_create_conversation(db, user_id, other_user_id)


# ── Messages ─────────────────────────────────────────────────────────────────

@router.get("/conversations/{conversation_id}/messages")
def get_messages(
    conversation_id: int,
    before_id: int = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return msvc.get_messages(db, conversation_id, user_id, before_id, limit)


@router.post("/conversations/{conversation_id}/messages")
def send_message(
    conversation_id: int,
    body: MessageCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    try:
        return msvc.send_message(db, conversation_id, user_id, body.content, body.reply_to_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/conversations/{conversation_id}/delivered")
def mark_delivered(
    conversation_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    """Mark messages as delivered when the recipient opens the conversation."""
    count = msvc.mark_delivered(db, conversation_id, user_id)
    return {"ok": True, "marked": count}


@router.patch("/conversations/{conversation_id}/read")
def mark_read(
    conversation_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    count = msvc.mark_read(db, conversation_id, user_id)
    return {"ok": True, "marked": count}


# ── Delete conversation ───────────────────────────────────────────────────────

@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    from app.models.social_models import Conversation
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    if conv.participant_a != user_id and conv.participant_b != user_id:
        raise HTTPException(403, "Not your conversation")
    db.delete(conv)
    db.commit()
    return {"ok": True}


# ── Delete message ───────────────────────────────────────────────────────────

@router.delete("/messages/{message_id}")
def delete_message(
    message_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if not msvc.delete_message(db, message_id, user_id):
        raise HTTPException(404, "Message not found or not yours")
    return {"ok": True}


# ── Reactions ────────────────────────────────────────────────────────────────

@router.post("/messages/{message_id}/react")
def react_to_message(
    message_id: int,
    body: ReactionCreate,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return msvc.toggle_reaction(db, message_id, user_id, body.emoji)


# ── Unread count ─────────────────────────────────────────────────────────────

@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return {"count": msvc.get_total_unread(db, user_id)}
