from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

# User Schemas
class UserBase(BaseModel):
    telegram_id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

class UserCreate(UserBase):
    pass

class UserUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Product Schemas
class ProductBase(BaseModel):
    name: str
    slug: str
    description: str
    price: float
    category: str
    image_url: Optional[str] = None
    discount_price: Optional[float] = None
    stock: int = 0

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    discount_price: Optional[float] = None
    stock: Optional[int] = None
    is_available: Optional[bool] = None

class ProductResponse(ProductBase):
    id: int
    is_available: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# Order Schemas
class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int

class OrderCreate(BaseModel):
    items: List[OrderItemCreate]
    notes: Optional[str] = None

class OrderItemResponse(BaseModel):
    id: int
    product_id: int
    quantity: int
    price: float
    
    class Config:
        from_attributes = True

class OrderResponse(BaseModel):
    id: int
    order_number: str
    status: str
    total_amount: float
    tax_amount: float
    shipping_cost: float
    created_at: datetime
    updated_at: datetime
    delivered_at: Optional[datetime] = None
    items: List[OrderItemResponse]
    
    class Config:
        from_attributes = True

# Cart Schemas
class CartItemCreate(BaseModel):
    product_id: int
    quantity: int

class CartItemResponse(BaseModel):
    product_id: int
    quantity: int
    product: ProductResponse

class CartResponse(BaseModel):
    id: int
    items: List[CartItemResponse]
    created_at: datetime
    
    class Config:
        from_attributes = True

# Address Schemas
class AddressCreate(BaseModel):
    label: str
    street: str
    city: str
    state: str
    postal_code: str
    country: str
    is_default: bool = False

class AddressResponse(AddressCreate):
    id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

# Notification Schemas
class NotificationResponse(BaseModel):
    id: int
    title: str
    message: str
    notification_type: str
    is_read: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

# Quote Schemas
class QuoteResponse(BaseModel):
    id: int
    text: str
    author: str
    quote_type: str
    
    class Config:
        from_attributes = True

# Quiz Schemas
class QuizQuestionCreate(BaseModel):
    question: str
    options: List[str]
    correct_answer: int
    explanation: Optional[str] = None

class QuizQuestionResponse(BaseModel):
    id: int
    question: str
    options: List[str]
    correct_answer: int
    explanation: Optional[str]
    
    class Config:
        from_attributes = True

class QuizCreate(BaseModel):
    title: str
    book_title: str
    description: Optional[str] = None
    difficulty: str = "medium"
    category: str
    questions: List[QuizQuestionCreate]

class QuizResponse(BaseModel):
    id: int
    title: str
    book_title: str
    difficulty: str
    category: str
    total_questions: int
    
    class Config:
        from_attributes = True

class QuizDetailResponse(QuizResponse):
    questions: List[QuizQuestionResponse]

# ── Public schemas (correct_answer omitted to prevent cheating) ──────────────

class QuizQuestionPublic(BaseModel):
    """Question data sent to the browser — correct_answer deliberately excluded."""
    id: int
    question: str
    options: List[str]
    explanation: Optional[str] = None

    class Config:
        from_attributes = True

class QuizDetailPublic(BaseModel):
    id: int
    title: str
    book_title: str
    description: Optional[str] = None
    difficulty: str
    category: str
    total_questions: int
    questions: List[QuizQuestionPublic]

    class Config:
        from_attributes = True

# ── Server-side verification ──────────────────────────────────────────────────

class QuizVerifyRequest(BaseModel):
    telegram_id: int
    telegram_name: str = "Foydalanuvchi"
    answers: List[int]  # list of selected option indices, ordered by question.order

class QuizVerifyResponse(BaseModel):
    quiz_id: int
    score: int
    total: int
    percentage: float
    passed: bool               # >= 80%
    certificate_eligible: bool # >= 80%
    result_token: str          # HMAC-signed — prevents forged certificates
    is_first_attempt: bool     # True if first passing completion (XP awarded)
    already_passed: bool = False  # True if user already passed this quiz before

# AI Schemas
class BookSummarizerRequest(BaseModel):
    text: str
    question: Optional[str] = None
    max_sentences: int = 4

class BookSummarizerResponse(BaseModel):
    summary: str
    assistant_reply: str
    key_points: List[str]
    word_count: int
    sentence_count: int

# Book Schemas
class BookCreate(BaseModel):
    title: str
    author: str
    description: str
    price: float = 0
    is_paid: bool = False
    file_url: str
    category: str
    thumbnail_url: Optional[str] = None

class BookRateRequest(BaseModel):
    telegram_id: int
    rating: int  # 1-5

class BookResponse(BaseModel):
    id: int
    title: str
    author: str
    description: str
    price: float
    is_paid: bool
    file_url: Optional[str] = None
    category: str
    downloads: int
    rating: float
    thumbnail_url: Optional[str] = None

    class Config:
        from_attributes = True

# Resource Schemas
class ResourceCreate(BaseModel):
    title: str
    description: str
    url: str
    resource_type: str  # youtube, link, course
    category: str
    thumbnail_url: Optional[str] = None

class ResourceResponse(BaseModel):
    id: int
    title: str
    description: str
    url: str
    resource_type: str
    category: str
    thumbnail_url: Optional[str]
    
    class Config:
        from_attributes = True
