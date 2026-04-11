"""
Messenger API routes — conversations + direct messages (text/link only).
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Header
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.schemas.social_schemas import MessageCreate
from app.services import messenger_service as msvc

router = APIRouter(prefix="/messenger", tags=["messenger"])


def get_current_user_id(authorization: str = Header(None)) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authentication required")
    payload = decode_token(authorization.split(" ", 1)[1])
    if not payload or "sub" not in payload:
        raise HTTPException(401, "Invalid token")
    return int(payload["sub"])


# ── Conversations ────────────────────────────────────────────────────────────

@router.get("/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return msvc.list_conversations(db, user_id)


@router.post("/conversations/{other_user_id}")
def get_or_create_conversation(
    other_user_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    if user_id == other_user_id:
        raise HTTPException(400, "Cannot message yourself")
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
        return msvc.send_message(db, conversation_id, user_id, body.content)
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


# ── Unread count ─────────────────────────────────────────────────────────────

@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
):
    return {"count": msvc.get_total_unread(db, user_id)}
