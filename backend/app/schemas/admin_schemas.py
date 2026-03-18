from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

# Admin User Schemas
class AdminUserBase(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    role: str = "editor"

class AdminUserCreate(AdminUserBase):
    pass

class AdminUserResponse(AdminUserBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Hero Content Schemas
class HeroContentBase(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    cta_text: Optional[str] = None
    cta_link: Optional[str] = None
    display_order: int = 0

class HeroContentCreate(HeroContentBase):
    pass

class HeroContentUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    description: Optional[str] = None
    image_url: Optional[str] = None
    cta_text: Optional[str] = None
    cta_link: Optional[str] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None

class HeroContentResponse(HeroContentBase):
    id: int
    is_active: bool
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Payment Config Schemas
class PaymentConfigBase(BaseModel):
    provider: str
    api_key: Optional[str] = None
    merchant_id: Optional[str] = None
    is_enabled: bool = False
    config_data: Optional[Dict[str, Any]] = None

class PaymentConfigCreate(PaymentConfigBase):
    pass

class PaymentConfigUpdate(BaseModel):
    api_key: Optional[str] = None
    merchant_id: Optional[str] = None
    is_enabled: Optional[bool] = None
    config_data: Optional[Dict[str, Any]] = None

class PaymentConfigResponse(PaymentConfigBase):
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Quiz Upload Schemas
class QuizQuestionUpload(BaseModel):
    question: str
    options: List[str]
    correct_answer: int
    explanation: Optional[str] = None

class QuizUpload(BaseModel):
    title: str
    book_title: str
    description: Optional[str] = None
    difficulty: str = "medium"
    category: str
    questions: List[QuizQuestionUpload]

class QuizUploadResponse(BaseModel):
    id: int
    title: str
    total_questions: int
    status: str = "created"
    
    class Config:
        from_attributes = True


class QuizManagementResponse(BaseModel):
    id: int
    title: str
    book_title: str
    difficulty: str
    category: str
    total_questions: int
    created_at: datetime

    class Config:
        from_attributes = True

# Book Management Schemas
class BookManagementCreate(BaseModel):
    title: str
    author: str
    description: str
    price: float = 0
    is_paid: bool = False
    file_url: str
    thumbnail_url: Optional[str] = None
    category: str

class BookManagementUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    is_paid: Optional[bool] = None
    file_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    category: Optional[str] = None
    is_available: Optional[bool] = None

class BookManagementResponse(BaseModel):
    id: int
    title: str
    author: str
    description: str
    price: float
    is_paid: bool
    file_url: str
    thumbnail_url: Optional[str] = None
    category: str
    downloads: int
    rating: float
    is_available: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Audit Log Schemas
class AuditLogResponse(BaseModel):
    id: int
    action: str
    old_values: Optional[Dict[str, Any]] = None
    new_values: Optional[Dict[str, Any]] = None
    admin_id: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# Admin Dashboard Stats
class AdminStats(BaseModel):
    total_users: int
    total_quizzes: int
    total_books: int
    total_resources: int
    active_payments: int
    recent_uploads: List[str]

class AdminPanelAuthRequest(BaseModel):
    telegram_id: int
    init_data: str  # Telegram Web App init data


# ─── Ambient Sound Schemas ─────────────────────────────────────────────────────

class AmbientSoundResponse(BaseModel):
    id: int
    name: str
    emoji: str
    url: str
    display_order: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
