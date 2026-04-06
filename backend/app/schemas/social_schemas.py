"""
Pydantic schemas for the Social Learning Ecosystem.
"""

from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ── Author / User identity ──────────────────────────────────────────────────

class AuthorBrief(BaseModel):
    telegram_id: int
    full_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None
    role: str = "student"
    level: int = 1
    xp: int = 0

    class Config:
        from_attributes = True


class PublicProfile(AuthorBrief):
    bio: Optional[str] = None
    followers_count: int = 0
    following_count: int = 0
    is_following: bool = False   # populated at query time

    class Config:
        from_attributes = True


# ── Posts ────────────────────────────────────────────────────────────────────

class PostCreate(BaseModel):
    content: str = Field("", max_length=2000)
    image_url: Optional[str] = None


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=1000)


class CommentOut(BaseModel):
    id: int
    post_id: int
    author: AuthorBrief
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class PostOut(BaseModel):
    id: int
    author: AuthorBrief
    content: str
    image_url: Optional[str] = None
    likes_count: int = 0
    comments_count: int = 0
    is_liked: bool = False       # populated at query time
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Follows ──────────────────────────────────────────────────────────────────

class FollowOut(BaseModel):
    user: AuthorBrief
    created_at: datetime

    class Config:
        from_attributes = True


# ── Conversations & Messages ────────────────────────────────────────────────

class MessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int
    content: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ConversationOut(BaseModel):
    id: int
    other_user: AuthorBrief
    last_message: Optional[MessageOut] = None
    unread_count: int = 0
    last_message_at: datetime

    class Config:
        from_attributes = True


# ── Discovery ───────────────────────────────────────────────────────────────

class UserSearchResult(BaseModel):
    users: List[AuthorBrief]
    total: int


# ── Pagination wrapper ──────────────────────────────────────────────────────

class PaginatedPosts(BaseModel):
    posts: List[PostOut]
    total: int
    page: int
    page_size: int
