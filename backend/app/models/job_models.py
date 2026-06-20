"""
SQLAlchemy models for the Jobs feature (Ish joyi nav item).

Tables: jobs, job_applications
"""

from sqlalchemy import (
    Column, BigInteger, Text, String, Integer, Boolean, DateTime,
    ForeignKey, UniqueConstraint, CheckConstraint, Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from app.db.session import Base


class Job(Base):
    """
    Job posting. posted_by references the user/company who created the listing.
    required_skills is a JSONB array of skill name strings — indexed with GIN
    for fast containment queries (required_skills @> '["Python"]').
    """
    __tablename__ = "jobs"

    id              = Column(BigInteger, primary_key=True, autoincrement=True)
    posted_by       = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    company_name    = Column(Text, nullable=False)
    title           = Column(Text, nullable=False)
    description     = Column(Text, nullable=False)
    location        = Column(Text, nullable=True)
    job_type        = Column(String(20), nullable=False, default="full_time")
                      # full_time | part_time | remote | freelance | internship
    salary_min      = Column(Integer, nullable=True)
    salary_max      = Column(Integer, nullable=True)
    salary_currency = Column(String(10), nullable=False, default="UZS")
    required_skills = Column(JSONB, nullable=False, default=list)
    is_active       = Column(Boolean, nullable=False, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at      = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        CheckConstraint("salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min",
                        name="chk_salary_range"),
        Index("ix_jobs_posted_by", "posted_by"),
        Index("ix_jobs_active_created", "is_active", "created_at"),
    )


class JobApplication(Base):
    """
    One row per (applicant, job). Status tracks the recruiter pipeline.
    Unique on (job_id, applicant_id) — a user can only apply once per job.
    """
    __tablename__ = "job_applications"

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    job_id       = Column(BigInteger, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    applicant_id = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    message      = Column(Text, nullable=True)
    status       = Column(String(20), nullable=False, default="applied")
                   # applied | viewed | shortlisted | rejected
    created_at   = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("job_id", "applicant_id", name="uq_job_application"),
        Index("ix_job_applications_job", "job_id", "status"),
        Index("ix_job_applications_applicant", "applicant_id"),
    )
