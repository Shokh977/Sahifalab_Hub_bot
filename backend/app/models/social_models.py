"""
SQLAlchemy models for the Social Learning Ecosystem.

Tables: posts, post_likes, post_comments, follows, conversations, direct_messages,
        skills, skill_endorsements, connections
"""

from sqlalchemy import (
    Column, Integer, BigInteger, Text, String, Boolean, DateTime, ForeignKey,
    UniqueConstraint, CheckConstraint, Index,
)
from sqlalchemy.dialects.postgresql import JSONB
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
    views_count         = Column(Integer, nullable=False, default=0)
    reposts_count       = Column(Integer, nullable=False, default=0)
    shares_count        = Column(Integer, nullable=False, default=0)
    saves_count         = Column(Integer, nullable=False, default=0)          # migration 047
    target_base_views   = Column(Integer, nullable=False, default=0)
    base_views_added    = Column(Integer, nullable=False, default=0)
    # Post types: 'text' | 'course_announcement' | 'achievement' | 'poll'     migration 047
    post_type      = Column(Text, nullable=False, default="text")
    post_metadata  = Column(JSONB, nullable=True)                              # type-specific data
    created_at          = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at     = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_posts_created", "created_at"),
        Index("ix_posts_post_type", "post_type"),
    )


class PostSave(Base):
    """migration 047 — bookmark/save a post."""
    __tablename__ = "post_saves"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    post_id    = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    user_id    = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_post_save"),
        Index("ix_post_saves_post", "post_id"),
        Index("ix_post_saves_user", "user_id"),
    )


class PollVote(Base):
    """migration 047 — vote on a poll post."""
    __tablename__ = "poll_votes"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    post_id    = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    user_id    = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    option_idx = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("post_id", "user_id", name="uq_poll_vote"),
        Index("ix_poll_votes_post", "post_id"),
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

    id          = Column(Integer, primary_key=True, autoincrement=True)
    post_id     = Column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False)
    author_id   = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    content     = Column(Text, nullable=False)
    parent_id   = Column(Integer, ForeignKey("post_comments.id", ondelete="SET NULL"), nullable=True)  # migration 055
    likes_count = Column(Integer, nullable=False, default=0)                                            # migration 055
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_post_comments_post",   "post_id"),
        Index("ix_post_comments_parent", "parent_id"),
    )


class CommentLike(Base):
    """migration 055 — like/heart on a comment."""
    __tablename__ = "comment_likes"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    comment_id = Column(Integer, ForeignKey("post_comments.id", ondelete="CASCADE"), nullable=False)
    user_id    = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("comment_id", "user_id", name="uq_comment_like"),
        Index("ix_comment_likes_comment", "comment_id"),
        Index("ix_comment_likes_user",    "user_id"),
    )


class UserBlock(Base):
    """One user blocking another — blocks messaging in both directions and
    hides the blocked user's posts/reposts from the blocker's feed."""
    __tablename__ = "user_blocks"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    blocker_id  = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    blocked_id  = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("blocker_id", "blocked_id", name="uq_user_block"),
        CheckConstraint("blocker_id != blocked_id", name="chk_no_self_block"),
        Index("ix_user_blocks_blocker", "blocker_id"),
        Index("ix_user_blocks_blocked", "blocked_id"),
    )


class ContentReport(Base):
    """A user report against a post or another user, for moderator review."""
    __tablename__ = "content_reports"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    reporter_id = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    target_type = Column(String(20), nullable=False)   # 'post' | 'user'
    target_id   = Column(BigInteger, nullable=False)    # posts.id or profiles.telegram_id, depending on target_type
    reason      = Column(String(50), nullable=False)    # short reason code, e.g. 'spam' | 'harassment' | 'other'
    details     = Column(Text, nullable=True)           # optional free-text from the reporter
    status      = Column(String(20), nullable=False, server_default="pending")  # 'pending' | 'reviewed' | 'dismissed'
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # 086_content_report_review_columns — set by GET/POST /api/admin/reports
    reviewed_by = Column(BigInteger, ForeignKey("profiles.telegram_id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("target_type IN ('post', 'user')", name="chk_report_target_type"),
        Index("ix_content_reports_reporter", "reporter_id"),
        Index("ix_content_reports_target", "target_type", "target_id"),
        Index("ix_content_reports_status", "status"),
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
    is_delivered    = Column(Boolean, nullable=False, default=False)
    is_read         = Column(Boolean, nullable=False, default=False)
    reply_to_id     = Column(Integer, ForeignKey("direct_messages.id", ondelete="SET NULL"), nullable=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_dm_conv", "conversation_id", "created_at"),
        Index("ix_dm_sender", "sender_id"),
    )


class MessageReaction(Base):
    __tablename__ = "message_reactions"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(Integer, ForeignKey("direct_messages.id", ondelete="CASCADE"), nullable=False)
    user_id    = Column(BigInteger, nullable=False)
    emoji      = Column(String(10), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("message_id", "user_id", "emoji", name="uq_msg_reaction"),
        Index("ix_msg_reactions_message", "message_id"),
    )


# ── Professional network tables (044_skills_and_connections) ──────────────────

class Skill(Base):
    """
    A skill belonging to a user. Can be self-added or auto-verified by
    course/test completion. endorsement_count is kept in sync by a DB trigger.
    """
    __tablename__ = "skills"

    id                = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id           = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    skill_name        = Column(Text, nullable=False)
    is_verified       = Column(Boolean, nullable=False, default=False)
    verified_by       = Column(Text, nullable=True)   # e.g. 'course:42' or 'test:7'
    endorsement_count = Column(Integer, nullable=False, default=0)
    display_order     = Column(Integer, nullable=False, default=0)
    created_at        = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "skill_name", name="uq_user_skill"),
        Index("ix_skills_user_id", "user_id"),
        Index("ix_skills_user_endorsements", "user_id", "endorsement_count"),
    )


class SkillEndorsement(Base):
    """One endorsement = one person endorsing one skill. One per (skill, endorser)."""
    __tablename__ = "skill_endorsements"

    id          = Column(BigInteger, primary_key=True, autoincrement=True)
    skill_id    = Column(BigInteger, ForeignKey("skills.id", ondelete="CASCADE"), nullable=False)
    endorser_id = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    created_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("skill_id", "endorser_id", name="uq_skill_endorsement"),
        Index("ix_skill_endorsements_skill", "skill_id"),
        Index("ix_skill_endorsements_endorser", "endorser_id"),
    )


class Connection(Base):
    """
    Mutual connection request between two users (LinkedIn-style, NOT follow).
    Status: pending → accepted | declined.
    accepted_at is set automatically by a DB trigger when status = 'accepted'.
    Use get_connection_status(a, b) DB function for direction-agnostic lookups.
    """
    __tablename__ = "connections"

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    requester_id = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    receiver_id  = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    status       = Column(String(20), nullable=False, default="pending")   # pending | accepted | declined
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    accepted_at  = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("requester_id", "receiver_id", name="uq_connection"),
        CheckConstraint("requester_id != receiver_id", name="chk_no_self_connect"),
        Index("ix_connections_requester", "requester_id", "status"),
        Index("ix_connections_receiver", "receiver_id", "status"),
    )


# ── Profile activity & view tables (045_activity_log_views_jobs) ──────────────

class ActivityLog(Base):
    """
    Append-only log of every significant user action.
    Drives the profile timeline (fetch ORDER BY created_at DESC).
    UNIQUE on (user_id, activity_type, reference_id, reference_type) prevents
    duplicate backfill entries; NULL reference_id rows are unconstrained by SQL.
    """
    __tablename__ = "activity_log"

    id             = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id        = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    activity_type  = Column(Text, nullable=False)   # see CHECK constraint in migration
    reference_id   = Column(Text, nullable=True)    # ID of related entity cast to text
    reference_type = Column(Text, nullable=True)    # 'course' | 'post' | 'certificate' | …

    activity_metadata = Column("metadata", JSONB, nullable=True)   # DB column is "metadata"
    created_at     = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "user_id", "activity_type", "reference_id", "reference_type",
            name="uq_activity_log_source",
        ),
        Index("ix_activity_log_user_created", "user_id", "created_at"),
    )


class ProfileViewLog(Base):
    """
    Per-visit log for profile view tracking.
    Named profile_view_logs (not profile_views) to avoid confusion with the
    profiles.profile_views integer counter column (migration 043).
    A DB trigger keeps profiles.profile_views / profile_views_week in sync.
    viewer_user_id = None means an anonymous visitor.
    """
    __tablename__ = "profile_view_logs"

    id              = Column(BigInteger, primary_key=True, autoincrement=True)
    profile_user_id = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    viewer_user_id  = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="SET NULL"), nullable=True)
    viewed_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_pvl_profile_viewed", "profile_user_id", "viewed_at"),
    )
