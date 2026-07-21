from sqlalchemy import Column, Integer, BigInteger, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.sql import func
from app.db.session import Base


class CourseView(Base):
    """One row per (course_id, viewer_id) — repeat opens increment view_count
    rather than creating duplicate rows, so a plain COUNT(*) is always a
    unique-viewer count. Lets a teacher see exact click-through and
    click-to-enrollment conversion for their own courses."""
    __tablename__ = "course_views"

    id              = Column(Integer, primary_key=True, autoincrement=True)
    course_id       = Column(Integer, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False)
    viewer_id       = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    view_count      = Column(Integer, nullable=False, default=1)
    first_viewed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_viewed_at  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("course_id", "viewer_id", name="uq_course_view"),
        Index("ix_course_views_course", "course_id"),
        Index("ix_course_views_viewer", "viewer_id"),
    )
