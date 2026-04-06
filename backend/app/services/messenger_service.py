"""
Messenger service — conversations + direct messages (text/links only).
"""

from __future__ import annotations
from typing import Optional, List
from sqlalchemy import desc, func, and_, or_, case
from sqlalchemy.orm import Session

from app.models.social_models import Conversation, DirectMessage
from app.models.models import Profile


def _profile_brief(p: Profile) -> dict:
    return {
        "telegram_id": p.telegram_id,
        "full_name": p.full_name,
        "username": p.username,
        "photo_url": p.photo_url,
        "role": p.role or "student",
        "level": p.level or 1,
        "xp": p.xp or 0,
    }


def _ordered_pair(a: int, b: int):
    """Ensure participant_a < participant_b for the unique constraint."""
    return (min(a, b), max(a, b))


# ── Conversations ────────────────────────────────────────────────────────────

def get_or_create_conversation(db: Session, user_a: int, user_b: int) -> dict:
    pa, pb = _ordered_pair(user_a, user_b)
    conv = db.query(Conversation).filter(
        Conversation.participant_a == pa,
        Conversation.participant_b == pb,
    ).first()
    if not conv:
        conv = Conversation(participant_a=pa, participant_b=pb)
        db.add(conv)
        db.commit()
        db.refresh(conv)

    other_id = user_b if user_a != user_b else user_a
    other = db.query(Profile).filter(Profile.telegram_id == other_id).first()

    last_msg = (
        db.query(DirectMessage)
        .filter(DirectMessage.conversation_id == conv.id)
        .order_by(desc(DirectMessage.created_at))
        .first()
    )
    unread = (
        db.query(func.count(DirectMessage.id))
        .filter(
            DirectMessage.conversation_id == conv.id,
            DirectMessage.sender_id != user_a,
            DirectMessage.is_read == False,
        )
        .scalar()
    ) or 0

    return {
        "id": conv.id,
        "other_user": _profile_brief(other) if other else None,
        "last_message": _msg_dict(last_msg) if last_msg else None,
        "unread_count": unread,
        "last_message_at": conv.last_message_at,
    }


def list_conversations(db: Session, user_id: int) -> List[dict]:
    convs = (
        db.query(Conversation)
        .filter(or_(
            Conversation.participant_a == user_id,
            Conversation.participant_b == user_id,
        ))
        .order_by(desc(Conversation.last_message_at))
        .all()
    )
    result = []
    for conv in convs:
        other_id = conv.participant_b if conv.participant_a == user_id else conv.participant_a
        other = db.query(Profile).filter(Profile.telegram_id == other_id).first()
        last_msg = (
            db.query(DirectMessage)
            .filter(DirectMessage.conversation_id == conv.id)
            .order_by(desc(DirectMessage.created_at))
            .first()
        )
        unread = (
            db.query(func.count(DirectMessage.id))
            .filter(
                DirectMessage.conversation_id == conv.id,
                DirectMessage.sender_id != user_id,
                DirectMessage.is_read == False,
            )
            .scalar()
        ) or 0
        result.append({
            "id": conv.id,
            "other_user": _profile_brief(other) if other else None,
            "last_message": _msg_dict(last_msg) if last_msg else None,
            "unread_count": unread,
            "last_message_at": conv.last_message_at,
        })
    return result


# ── Messages ─────────────────────────────────────────────────────────────────

def _msg_dict(m: DirectMessage) -> dict:
    return {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "sender_id": m.sender_id,
        "content": m.content,
        "is_read": m.is_read,
        "created_at": m.created_at,
    }


def send_message(db: Session, conversation_id: int, sender_id: int, content: str) -> dict:
    # Verify sender is a participant
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise ValueError("Conversation not found")
    if sender_id not in (conv.participant_a, conv.participant_b):
        raise ValueError("Not a participant")

    msg = DirectMessage(
        conversation_id=conversation_id,
        sender_id=sender_id,
        content=content.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _msg_dict(msg)


def get_messages(
    db: Session,
    conversation_id: int,
    user_id: int,
    before_id: Optional[int] = None,
    limit: int = 50,
) -> List[dict]:
    # Verify participant
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv or user_id not in (conv.participant_a, conv.participant_b):
        return []

    q = db.query(DirectMessage).filter(DirectMessage.conversation_id == conversation_id)
    if before_id:
        q = q.filter(DirectMessage.id < before_id)
    msgs = q.order_by(desc(DirectMessage.created_at)).limit(limit).all()
    return [_msg_dict(m) for m in reversed(msgs)]


def mark_read(db: Session, conversation_id: int, user_id: int) -> int:
    """Mark all unread messages in a conversation as read (messages NOT sent by user_id)."""
    count = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.conversation_id == conversation_id,
            DirectMessage.sender_id != user_id,
            DirectMessage.is_read == False,
        )
        .update({"is_read": True})
    )
    db.commit()
    return count


def get_total_unread(db: Session, user_id: int) -> int:
    # Get all conversations the user is in
    conv_ids = (
        db.query(Conversation.id)
        .filter(or_(
            Conversation.participant_a == user_id,
            Conversation.participant_b == user_id,
        ))
        .subquery()
    )
    count = (
        db.query(func.count(DirectMessage.id))
        .filter(
            DirectMessage.conversation_id.in_(conv_ids),
            DirectMessage.sender_id != user_id,
            DirectMessage.is_read == False,
        )
        .scalar()
    )
    return count or 0
