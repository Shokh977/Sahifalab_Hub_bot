from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean, JSON
from app.db.session import Base

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
    provider = Column(String(50))  # telegram_stars, click, payme
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
