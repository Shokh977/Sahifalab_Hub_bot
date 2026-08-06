"""
Messenger service — conversations + direct messages (text/links only).
"""

from __future__ import annotations
from typing import Optional, List
from sqlalchemy import desc, func, and_, or_
from sqlalchemy.orm import Session

from app.models.social_models import Conversation, DirectMessage, MessageReaction
from app.models.models import Profile
from app.services.social_service import is_blocked
from app.core.config import settings
from app.core.admin_check import is_role_admin


def _is_admin(db: Session, telegram_id: int) -> bool:
    """Mirrors messenger_routes._is_admin — admin authority to keep
    messaging a user even across a block must hold for every message in
    the conversation, not just the one that opens it."""
    return telegram_id in settings.ADMIN_TELEGRAM_IDS or is_role_admin(db, telegram_id)


def _profile_brief(p: Profile) -> dict:
    return {
        "telegram_id": p.telegram_id,
        "full_name": getattr(p, "full_name", None) or getattr(p, "first_name", None),
        "username": p.site_username,
        "photo_url": p.photo_url,
        "role": p.role or "student",
        "level": p.level or 1,
        "xp": p.total_xp or 0,
    }


def _ordered_pair(a: int, b: int):
    return (min(a, b), max(a, b))


def _msg_dict(m: DirectMessage) -> dict:
    return {
        "id": m.id,
        "conversation_id": m.conversation_id,
        "sender_id": m.sender_id,
        "content": m.content,
        "is_delivered": m.is_delivered,
        "is_read": m.is_read,
        "reply_to_id": m.reply_to_id,
        "reply_to_content": None,
        "reply_to_sender_id": None,
        "reactions": [],
        "created_at": m.created_at,
    }


def _enrich_messages(db: Session, msgs: List[DirectMessage]) -> List[dict]:
    """Batch-fetch reply content and reactions, return enriched dicts."""
    if not msgs:
        return []

    result = [_msg_dict(m) for m in msgs]

    # Batch fetch reply parents
    reply_ids = [m.reply_to_id for m in msgs if m.reply_to_id]
    if reply_ids:
        parents = db.query(DirectMessage).filter(DirectMessage.id.in_(reply_ids)).all()
        parent_map = {p.id: p for p in parents}
        for d, m in zip(result, msgs):
            if m.reply_to_id and m.reply_to_id in parent_map:
                p = parent_map[m.reply_to_id]
                d["reply_to_content"] = p.content
                d["reply_to_sender_id"] = p.sender_id

    # Batch fetch reactions
    msg_ids = [m.id for m in msgs]
    reactions = db.query(MessageReaction).filter(
        MessageReaction.message_id.in_(msg_ids)
    ).all()
    reaction_map: dict = {}
    for r in reactions:
        bucket = reaction_map.setdefault(r.message_id, {})
        entry = bucket.setdefault(r.emoji, {"emoji": r.emoji, "count": 0, "user_ids": []})
        entry["count"] += 1
        entry["user_ids"].append(r.user_id)
    for d in result:
        d["reactions"] = list(reaction_map.get(d["id"], {}).values())

    return result


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
        "last_message": last_msg.content if last_msg else None,
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
            "last_message": last_msg.content if last_msg else None,
            "unread_count": unread,
            "last_message_at": conv.last_message_at,
        })
    return result


# ── Messages ─────────────────────────────────────────────────────────────────

def send_message(
    db: Session,
    conversation_id: int,
    sender_id: int,
    content: str,
    reply_to_id: Optional[int] = None,
) -> dict:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv:
        raise ValueError("Conversation not found")
    if sender_id not in (conv.participant_a, conv.participant_b):
        raise ValueError("Not a participant")

    other_id = conv.participant_b if sender_id == conv.participant_a else conv.participant_a
    if not _is_admin(db, sender_id) and is_blocked(db, sender_id, other_id):
        raise ValueError("Xabar yuborib bo'lmaydi")

    msg = DirectMessage(
        conversation_id=conversation_id,
        sender_id=sender_id,
        content=content.strip(),
        reply_to_id=reply_to_id,
    )
    db.add(msg)

    # Update conversation timestamp
    conv.last_message_at = func.now()
    db.commit()
    db.refresh(msg)

    enriched = _enrich_messages(db, [msg])
    return enriched[0]


def get_messages(
    db: Session,
    conversation_id: int,
    user_id: int,
    before_id: Optional[int] = None,
    limit: int = 40,
) -> List[dict]:
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conv or user_id not in (conv.participant_a, conv.participant_b):
        return []

    q = db.query(DirectMessage).filter(DirectMessage.conversation_id == conversation_id)
    if before_id:
        q = q.filter(DirectMessage.id < before_id)
    msgs = q.order_by(desc(DirectMessage.created_at)).limit(limit).all()
    msgs = list(reversed(msgs))

    return _enrich_messages(db, msgs)


def mark_delivered(db: Session, conversation_id: int, user_id: int) -> int:
    count = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.conversation_id == conversation_id,
            DirectMessage.sender_id != user_id,
            DirectMessage.is_delivered == False,
        )
        .update({"is_delivered": True})
    )
    db.commit()
    return count


def mark_read(db: Session, conversation_id: int, user_id: int) -> int:
    count = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.conversation_id == conversation_id,
            DirectMessage.sender_id != user_id,
            DirectMessage.is_read == False,
        )
        .update({"is_delivered": True, "is_read": True})
    )
    db.commit()
    return count


def get_total_unread(db: Session, user_id: int) -> int:
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


def delete_message(db: Session, message_id: int, user_id: int) -> bool:
    msg = db.query(DirectMessage).filter(
        DirectMessage.id == message_id,
        DirectMessage.sender_id == user_id,
    ).first()
    if not msg:
        return False
    db.delete(msg)
    db.commit()
    return True


# ── Reactions ────────────────────────────────────────────────────────────────

def toggle_reaction(db: Session, message_id: int, user_id: int, emoji: str) -> dict:
    """Add or remove a reaction. Returns {action, emoji, user_id}."""
    existing = db.query(MessageReaction).filter(
        MessageReaction.message_id == message_id,
        MessageReaction.user_id == user_id,
        MessageReaction.emoji == emoji,
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return {"action": "removed", "emoji": emoji, "user_id": user_id, "message_id": message_id}
    else:
        r = MessageReaction(message_id=message_id, user_id=user_id, emoji=emoji)
        db.add(r)
        db.commit()
        return {"action": "added", "emoji": emoji, "user_id": user_id, "message_id": message_id}
