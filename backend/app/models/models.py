from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Table, Boolean
from sqlalchemy.orm import relationship
from app.db.session import Base

# Association table for cart items
cart_items = Table(
    'cart_items',
    Base.metadata,
    Column('cart_id', Integer, ForeignKey('cart.id'), primary_key=True),
    Column('product_id', Integer, ForeignKey('product.id'), primary_key=True),
    Column('quantity', Integer, default=1),
)

class User(Base):
    __tablename__ = "user"
    
    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(Integer, unique=True, index=True)
    username = Column(String(255), unique=True, index=True, nullable=True)
    first_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    phone = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    orders = relationship("Order", back_populates="user", cascade="all, delete-orphan")
    cart = relationship("Cart", back_populates="user", uselist=False, cascade="all, delete-orphan")
    addresses = relationship("Address", back_populates="user", cascade="all, delete-orphan")

class Product(Base):
    __tablename__ = "product"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), index=True)
    slug = Column(String(255), unique=True, index=True)
    description = Column(Text)
    price = Column(Float, index=True)
    discount_price = Column(Float, nullable=True)
    image_url = Column(String(500), nullable=True)
    category = Column(String(100), index=True)
    stock = Column(Integer, default=0)
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    order_items = relationship("OrderItem", back_populates="product", cascade="all, delete-orphan")

class Order(Base):
    __tablename__ = "order"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), index=True)
    order_number = Column(String(50), unique=True, index=True)
    status = Column(String(20), default="pending", index=True)  # pending, processing, shipped, delivered, cancelled
    total_amount = Column(Float)
    tax_amount = Column(Float, default=0)
    shipping_cost = Column(Float, default=0)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    delivered_at = Column(DateTime, nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")

class OrderItem(Base):
    __tablename__ = "order_item"
    
    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("order.id"), index=True)
    product_id = Column(Integer, ForeignKey("product.id"), index=True)
    quantity = Column(Integer)
    price = Column(Float)  # Price at time of order
    
    # Relationships
    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")

class Cart(Base):
    __tablename__ = "cart"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="cart")
    items = relationship(
        "Product",
        secondary=cart_items,
        backref="cart_rel"
    )

class Address(Base):
    __tablename__ = "address"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), index=True)
    label = Column(String(100))  # Home, Work, etc
    street = Column(String(255))
    city = Column(String(100))
    state = Column(String(100))
    postal_code = Column(String(20))
    country = Column(String(100))
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="addresses")

class Notification(Base):
    __tablename__ = "notification"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), index=True)
    title = Column(String(255))
    message = Column(Text)
    notification_type = Column(String(50))  # order_update, promotion, etc
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class Quote(Base):
    __tablename__ = "quote"
    
    id = Column(Integer, primary_key=True, index=True)
    text = Column(Text)
    author = Column(String(255))
    quote_type = Column(String(50), default='quote')  # quote or announcement
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Quiz(Base):
    __tablename__ = "quiz"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255))
    book_title = Column(String(255))
    description = Column(Text, nullable=True)
    difficulty = Column(String(20), default='medium')  # easy, medium, hard
    category = Column(String(100))
    total_questions = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    questions = relationship("QuizQuestion", back_populates="quiz", cascade="all, delete-orphan")

class QuizQuestion(Base):
    __tablename__ = "quiz_question"
    
    id = Column(Integer, primary_key=True, index=True)
    quiz_id = Column(Integer, ForeignKey("quiz.id"), index=True)
    question = Column(Text)
    options = Column(Text)  # JSON array as string
    correct_answer = Column(Integer)
    explanation = Column(Text, nullable=True)
    order = Column(Integer, default=0)
    
    # Relationships
    quiz = relationship("Quiz", back_populates="questions")

class Book(Base):
    __tablename__ = "book"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    author = Column(String(255))
    description = Column(Text)
    price = Column(Float, default=0)  # 0 for free
    is_paid = Column(Boolean, default=False)
    file_url = Column(String(500))
    thumbnail_url = Column(String(500), nullable=True)
    category = Column(String(100))
    downloads = Column(Integer, default=0)
    rating = Column(Float, default=0)
    is_available = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Resource(Base):
    __tablename__ = "resource"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True)
    description = Column(Text)
    url = Column(String(500))
    resource_type = Column(String(50))  # youtube, link, course
    category = Column(String(100), index=True)
    thumbnail_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
