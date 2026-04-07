"""
SQLAlchemy models for the Social Learning Ecosystem.

Tables: posts, post_likes, post_comments, follows, conversations, direct_messages
"""

from sqlalchemy import (
    Column, Integer, BigInteger, Text, String, Boolean, DateTime, ForeignKey,
    UniqueConstraint, CheckConstraint, Index,
)
from sqlalchemy.sql import func
from app.db.session import Base


class Post(Base):
    __tablename__ = "posts"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    author_id      = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False, index=True)
    content        = Column(Text, nullable=False, default="")
    image_url      = Column(Text, nullable=True)
    likes_count    = Column(Integer, nullable=False, default=0)
    comments_count = Column(Integer, nullable=False, default=0)
    views_count         = Column(Integer, nullable=False, default=0)   # real unique-ish view counter
    reposts_count       = Column(Integer, nullable=False, default=0)
    shares_count        = Column(Integer, nullable=False, default=0)
    target_base_views   = Column(Integer, nullable=False, default=0)   # randomised on insert (10-50)
    base_views_added    = Column(Integer, nullable=False, default=0)   # organic simulation budget used
    created_at          = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at     = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_posts_created", "created_at"),
    )


class PostLike(Base):
    __tablename__ = "post_likes"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    post_id    = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    user_id    = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_post_like"),
        Index("ix_post_likes_post", "post_id"),
        Index("ix_post_likes_user", "user_id"),
    )


class PostComment(Base):
    __tablename__ = "post_comments"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    post_id    = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    author_id  = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    content    = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_post_comments_post", "post_id"),
    )


class Follow(Base):
    __tablename__ = "follows"

    id           = Column(Integer, primary_key=True, autoincrement=True)
    follower_id  = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    following_id = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="uq_follow"),
        CheckConstraint("follower_id != following_id", name="chk_no_self_follow"),
        Index("ix_follows_follower", "follower_id"),
        Index("ix_follows_following", "following_id"),
    )


class Repost(Base):
    """User reposts of posts — mirrors the 'reposts' table."""
    __tablename__ = "reposts"

    id               = Column(Integer, primary_key=True, autoincrement=True)
    user_id          = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    original_post_id = Column(Integer,    ForeignKey("posts.id",             ondelete="CASCADE"), nullable=False)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "original_post_id", name="uq_repost"),
        Index("ix_reposts_user", "user_id"),
        Index("ix_reposts_post", "original_post_id"),
    )


class Conversation(Base):
    __tablename__ = "conversations"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    participant_a   = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    participant_b   = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    last_message_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("participant_a", "participant_b", name="uq_conversation"),
        CheckConstraint("participant_a < participant_b", name="chk_participant_order"),
        Index("ix_conv_a", "participant_a"),
        Index("ix_conv_b", "participant_b"),
    )


class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    sender_id       = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    content         = Column(Text, nullable=False)
    is_read         = Column(Boolean, nullable=False, default=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_dm_conv", "conversation_id", "created_at"),
        Index("ix_dm_sender", "sender_id"),
    )
