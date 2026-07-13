from datetime import datetime
from sqlalchemy import Column, Integer, BigInteger, String, Text, Float, DateTime, Boolean, JSON, UniqueConstraint
from app.db.session import Base


class EnrollmentAuditLog(Base):
    """Audit trail for all admin enrollment actions."""
    __tablename__ = "enrollment_audit_log"

    id                = Column(Integer, primary_key=True, index=True)
    action            = Column(String(50), nullable=False)
    # enrollment_granted | enrollment_cancelled | direct_enrollment
    target_id         = Column(Integer, nullable=True, index=True)   # pending_enrollment id
    admin_telegram_id = Column(BigInteger, nullable=True, index=True)
    user_telegram_id  = Column(BigInteger, nullable=True, index=True)
    course_id         = Column(Integer, nullable=True, index=True)
    details           = Column(JSON, nullable=True)
    created_at        = Column(DateTime, default=datetime.utcnow, index=True)

class DeckAuditLog(Base):
    """Audit trail for admin moderation actions on public flashcard decks (step-14)."""
    __tablename__ = "deck_audit_log"

    id         = Column(BigInteger, primary_key=True, index=True)
    deck_id    = Column(BigInteger, nullable=True, index=True)
    action     = Column(String(50), nullable=False)
    # deck_approved | deck_removed | creator_banned | official_deck_created |
    # deck_verified | deck_badge_set | deck_featured_toggled
    admin_telegram_id = Column(BigInteger, nullable=True, index=True)
    details    = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ChallengeAuditLog(Base):
    """Audit trail for admin actions on Musobaqalar cohort challenges (step-21)."""
    __tablename__ = "challenge_audit_log"

    id            = Column(BigInteger, primary_key=True, index=True)
    challenge_id  = Column(String(36), nullable=True, index=True)  # challenges.id (UUID) as text
    action        = Column(String(50), nullable=False)
    # challenge_created | challenge_updated | challenge_cancelled
    admin_telegram_id = Column(BigInteger, nullable=True, index=True)
    details       = Column(JSON, nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow, index=True)


class AdminUser(Base):
    __tablename__ = "admin_user"
    
    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(Integer, unique=True, index=True)
    username = Column(String(255), nullable=True)
    role = Column(String(50), default="editor")  # editor, manager, admin
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class HeroContent(Base):
    __tablename__ = "hero_content"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=True)
    subtitle = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    image_url = Column(String(500), nullable=True)
    cta_text = Column(String(100), nullable=True)
    cta_link = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    display_order = Column(Integer, default=0)
    created_by = Column(Integer, nullable=True)  # admin_user.id
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class PaymentConfig(Base):
    __tablename__ = "payment_config"
    
    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(50))  # click, payme
    api_key = Column(String(500), nullable=True)
    merchant_id = Column(String(500), nullable=True)
    is_enabled = Column(Boolean, default=False)
    config_data = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BookAuditLog(Base):
    __tablename__ = "book_audit_log"
    
    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, nullable=True)
    action = Column(String(50))  # created, updated, deleted
    old_values = Column(JSON, nullable=True)
    new_values = Column(JSON, nullable=True)
    admin_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class QuizAuditLog(Base):
    __tablename__ = "quiz_audit_log"
    
    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, nullable=True)
    action = Column(String(50))  # created, updated, deleted
    changes = Column(JSON, nullable=True)
    admin_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Announcement(Base):
    __tablename__ = "announcements"

    id         = Column(Integer, primary_key=True, index=True)
    title      = Column(String(300), nullable=False)
    body       = Column(Text, nullable=False)
    image_url  = Column(String(1000), nullable=True)
    cta_text   = Column(String(100), nullable=True)
    cta_link   = Column(String(1000), nullable=True)
    starts_at  = Column(DateTime, nullable=True)   # null = show immediately
    expires_at = Column(DateTime, nullable=True)   # null = never expires
    is_active  = Column(Boolean, default=True)
    created_by = Column(BigInteger, nullable=True) # admin telegram_id
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AnnouncementView(Base):
    __tablename__ = "announcement_views"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id", name="uq_ann_view"),)

    id              = Column(Integer, primary_key=True, index=True)
    announcement_id = Column(Integer, nullable=False, index=True)
    user_id         = Column(BigInteger, nullable=False, index=True)
    seen_at         = Column(DateTime, default=datetime.utcnow)


class AmbientSound(Base):
    __tablename__ = "ambient_sound"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    emoji = Column(String(20), nullable=False, default="🎵")
    url = Column(String(1000), nullable=False)       # direct or Google Drive share URL
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, nullable=True)      # admin telegram_id
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
