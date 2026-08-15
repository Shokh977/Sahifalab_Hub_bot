from datetime import datetime, UTC
from sqlalchemy import Column, Integer, BigInteger, String, Text, Float, Numeric, DateTime, Date, ForeignKey, Table, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, ARRAY, UUID as PGUUID
from sqlalchemy.orm import relationship
from app.db.session import Base


# ── Platform-identity models (mirror existing Supabase Postgres tables) ────────
# These models use SQLAlchemy's direct Postgres connection, which bypasses
# the Supabase REST API and is NOT subject to cached-egress quota limits.

class Profile(Base):
    """
    User profiles — mirrors the Supabase 'profiles' table.
    Stores gamification state (XP, level, focus) and auth identity.
    """
    __tablename__ = "profiles"

    telegram_id       = Column(BigInteger, primary_key=True)
    first_name        = Column(String(255), nullable=True)
    username          = Column(String(255), nullable=True)   # Telegram username — internal only, never exposed publicly
    site_username     = Column(String(50),  nullable=True, index=True)  # Public handle used in profile URLs
    photo_url         = Column(String(1000), nullable=True)
    role              = Column(String(50), default='student')   # student | teacher | admin
    status            = Column(String(50), default='active')    # active | pending | suspended
    suspension_reason = Column(Text, nullable=True)  # set by admin.py's suspend action (084_admin_suspension_reason)
    total_xp          = Column(Integer, default=0)
    focus_seconds     = Column(Integer, default=0)
    level             = Column(Integer, default=1)
    quizzes_completed = Column(Integer, default=0)
    password_hash     = Column(Text, nullable=True)
    email             = Column(String(255), nullable=True, index=True)
    app_created_at    = Column(DateTime(timezone=True), nullable=True)
    # How this account first signed up — stamped once at creation and never
    # overwritten by later logins. One of 'mobile' | 'web' | 'telegram_miniapp'
    # | 'unknown' (rows created before this column existed). Feeds the admin
    # dashboard's registration-source breakdown.
    registered_via    = Column(String(30), nullable=True)
    app_last_login    = Column(DateTime(timezone=True), nullable=True)
    app_online_at     = Column(DateTime(timezone=True), nullable=True)
    # Social ecosystem columns
    followers_count         = Column(Integer, default=0)
    following_count         = Column(Integer, default=0)
    connections_count       = Column(Integer, default=0)
    bio                     = Column(Text, nullable=True)
    about_me                = Column(Text, nullable=True)
    # New gamification columns (038_xp_gamification)
    total_focus_minutes     = Column(Integer, default=0)
    daily_quiz_xp           = Column(Integer, default=0)
    daily_quiz_xp_reset_at  = Column(DateTime(timezone=True), nullable=True)
    # Profile extension columns (043_profile_extension)
    headline           = Column(String(120), nullable=True)
    location_city      = Column(String(255), nullable=True)
    cover_image_url    = Column(String(1000), nullable=True)
    website_url        = Column(String(500), nullable=True)
    profile_views      = Column(Integer, default=0)
    profile_views_week = Column(Integer, default=0)
    is_verified        = Column(Boolean, default=False)
    account_type       = Column(String(50), default='student')   # student | teacher | company | admin
    user_settings      = Column(JSONB, nullable=True)
    # Email verification & password management (049_auth_tokens_email_verification)
    email_verified      = Column(Boolean, nullable=True, default=None)
    password_changed_at = Column(DateTime(timezone=True), nullable=True)
    # Focus / streak tracking (055_focus_sessions)
    daily_goal_minutes  = Column(Integer, default=20, nullable=True)
    streak_days         = Column(Integer, default=0,  nullable=True)
    streak_last_date    = Column(Date, nullable=True)
    # Public deck publishing (066_public_flashcard_decks) — admin can revoke via "Muallifni bloklash"
    can_publish         = Column(Boolean, default=True, nullable=False)
    # Streak freeze (061_streak_freeze) — was previously accessed only via
    # raw text() SQL everywhere; declared here now so the ORM model matches
    # the live table (step-20 Phase 4D).
    freeze_count        = Column(Integer, default=0, nullable=False)
    freeze_used_dates   = Column(ARRAY(Date), default=list, nullable=False)
    # Active-study heartbeat (059_streak_challenges_heartbeat)
    study_pulse_at      = Column(DateTime(timezone=True), nullable=True)
    # Per-user IANA timezone + cron dedup/guard columns (061->085 streak-freeze
    # rework) — see app/services/user_time.py and app/services/freeze_service.py.
    # timezone is validated in the endpoint (zoneinfo.ZoneInfo), not by a DB CHECK.
    timezone                  = Column(String(64), default='Asia/Tashkent', nullable=False)
    last_reminder_date        = Column(Date, nullable=True)
    last_at_risk_push_date    = Column(Date, nullable=True)
    last_freeze_milestone_days = Column(Integer, default=0, nullable=False)


class AuthCode(Base):
    """One-time login codes for the Telegram bot auth flow."""
    __tablename__ = "auth_codes"

    # PK is the code itself (matches migration 005 — `code text PRIMARY KEY`)
    code        = Column(String(64), primary_key=True)
    telegram_id = Column(BigInteger, nullable=True)
    first_name  = Column(String(255), nullable=True)
    username    = Column(String(255), nullable=True)
    photo_url   = Column(String(1000), nullable=True)
    used        = Column(Boolean, default=False, nullable=False)
    expires_at  = Column(DateTime(timezone=True), nullable=False)
    created_at  = Column(DateTime(timezone=True), nullable=True)


class AuthToken(Base):
    """Tokens for email verification and password reset (one-time use, expiring)."""
    __tablename__ = "auth_tokens"

    id         = Column(String(64), primary_key=True)  # random hex
    user_id    = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False, index=True)
    token      = Column(String(64), unique=True, nullable=False)
    type       = Column(String(30), nullable=False)   # 'email_verification' | 'password_reset'
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at    = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class XpLog(Base):
    """XP audit trail — every XP award is logged here for anti-cheat tracking."""
    __tablename__ = "xp_logs"

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id      = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False, index=True)
    amount       = Column(Integer, nullable=False)
    source       = Column(String(20), nullable=False)    # DEEP_WORK | QUIZ | COURSE
    reference_id = Column(BigInteger, nullable=True)     # course_id for COURSE
    created_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class UserBadge(Base):
    """Earned badges — unique per (user_id, badge_key)."""
    __tablename__ = "user_badges"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id    = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False, index=True)
    badge_key  = Column(String(100), nullable=False)
    granted_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (UniqueConstraint("user_id", "badge_key", name="uq_user_badge"),)


class PlannerTask(Base):
    """Kanban task card — per-user workspace planner."""
    __tablename__ = "planner_tasks"

    id               = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id          = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False, index=True)
    title            = Column(Text, nullable=False)
    description      = Column(Text, nullable=True)
    status           = Column(String(20), default="todo")       # todo | in_progress | done
    priority         = Column(String(10), default="medium")     # low | medium | high
    sort_order       = Column(Integer, default=0)
    linked_course_id = Column(Integer, nullable=True)
    linked_lesson_id = Column(Integer, nullable=True)
    xp_claimed       = Column(Boolean, default=False)   # prevents done→todo→done XP farming
    scheduled_at     = Column(DateTime(timezone=True), nullable=True)
    duration_minutes = Column(Integer, default=30)
    created_at       = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at       = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class PlannerNote(Base):
    """Simple markdown note — per-user workspace planner."""
    __tablename__ = "planner_notes"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id    = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False, index=True)
    title      = Column(Text, default="")
    content    = Column(Text, default="")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))


class FlashcardDeck(Base):
    """User-created flashcard deck — groups cards by topic."""
    __tablename__ = "flashcard_decks"

    id             = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id        = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False, index=True)
    title          = Column(String(200), nullable=False)
    description    = Column(Text, nullable=True)
    color          = Column(String(7), default='#F5A623')
    icon           = Column(String(50), nullable=True)
    card_count     = Column(Integer, default=0)
    mastered_count = Column(Integer, default=0)
    is_public      = Column(Boolean, default=False)
    course_id      = Column(Integer, nullable=True)
    created_at     = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at     = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    # Public deck library (066_public_flashcard_decks)
    published_at        = Column(DateTime(timezone=True), nullable=True)
    is_anonymous         = Column(Boolean, default=False, nullable=False)
    category             = Column(String(50), nullable=True)
    badge_type           = Column(String(20), default='none', nullable=False)   # none | official | verified_creator
    is_featured          = Column(Boolean, default=False, nullable=False)
    is_verified          = Column(Boolean, default=False, nullable=False)       # admin checked accuracy (required for 'official' badge)
    clone_count          = Column(Integer, default=0, nullable=False)
    rating_avg           = Column(Float, default=0.0, nullable=False)
    rating_count          = Column(Integer, default=0, nullable=False)
    cloned_from_deck_id  = Column(BigInteger, ForeignKey("flashcard_decks.id", ondelete="SET NULL"), nullable=True)
    moderation_status    = Column(String(20), default='approved', nullable=False)  # approved | pending_review | removed
    removed_reason       = Column(Text, nullable=True)

    cards = relationship("Flashcard", back_populates="deck", cascade="all, delete-orphan")


class Flashcard(Base):
    """Individual flashcard — belongs to a deck, stores SM-2 spaced repetition state."""
    __tablename__ = "flashcards"

    id            = Column(BigInteger, primary_key=True, autoincrement=True)
    deck_id       = Column(BigInteger, ForeignKey("flashcard_decks.id", ondelete="CASCADE"), nullable=False, index=True)
    front_text    = Column(Text, nullable=False)
    back_text     = Column(Text, nullable=False)
    front_image   = Column(String(500), nullable=True)
    back_image    = Column(String(500), nullable=True)
    position      = Column(Integer, default=0)
    ease_factor   = Column(Float, default=2.5)
    interval_days = Column(Integer, default=0)
    repetitions   = Column(Integer, default=0)
    next_review   = Column(DateTime(timezone=True), nullable=True)
    last_reviewed = Column(DateTime(timezone=True), nullable=True)
    status        = Column(String(20), default='new')  # new|learning|reviewing|mastered
    created_at    = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    deck = relationship("FlashcardDeck", back_populates="cards")


class FlashcardReview(Base):
    """Audit log of every card review — used for session stats and XP verification."""
    __tablename__ = "flashcard_reviews"

    id           = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id      = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False, index=True)
    card_id      = Column(BigInteger, ForeignKey("flashcards.id", ondelete="CASCADE"), nullable=False)
    deck_id      = Column(BigInteger, ForeignKey("flashcard_decks.id", ondelete="CASCADE"), nullable=False, index=True)
    rating       = Column(Integer, nullable=False)   # 1=forgot 2=hard 3=good 4=easy
    reviewed_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    time_spent_ms = Column(Integer, nullable=True)


class DeckClone(Base):
    """Tracks who cloned which public deck — enforces one clone per user per deck."""
    __tablename__ = "deck_clones"

    id               = Column(BigInteger, primary_key=True, autoincrement=True)
    original_deck_id = Column(BigInteger, ForeignKey("flashcard_decks.id", ondelete="CASCADE"), nullable=False, index=True)
    cloned_deck_id   = Column(BigInteger, ForeignKey("flashcard_decks.id", ondelete="CASCADE"), nullable=False)
    cloned_by        = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False, index=True)
    created_at       = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (UniqueConstraint("original_deck_id", "cloned_by", name="uq_deck_clone_user"),)


class DeckRating(Base):
    """1-5 star rating + optional comment on a public deck. Only cloners may rate (enforced in API)."""
    __tablename__ = "deck_ratings"

    id         = Column(BigInteger, primary_key=True, autoincrement=True)
    deck_id    = Column(BigInteger, ForeignKey("flashcard_decks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id    = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    rating     = Column(Integer, nullable=False)   # 1-5
    comment    = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (UniqueConstraint("deck_id", "user_id", name="uq_deck_rating_user"),)


class DeckReport(Base):
    """User report on a public deck — 3+ pending reports auto-hides the deck for admin review."""
    __tablename__ = "deck_reports"

    id          = Column(BigInteger, primary_key=True, autoincrement=True)
    deck_id     = Column(BigInteger, ForeignKey("flashcard_decks.id", ondelete="CASCADE"), nullable=False, index=True)
    reported_by = Column(BigInteger, ForeignKey("profiles.telegram_id", ondelete="CASCADE"), nullable=False)
    reason      = Column(String(30), nullable=False)   # spam | errors | inappropriate | offensive | copyright | other
    details     = Column(Text, nullable=True)
    status      = Column(String(20), default='pending', nullable=False)  # pending | reviewed | dismissed | actioned
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    reviewed_by = Column(BigInteger, ForeignKey("profiles.telegram_id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("deck_id", "reported_by", name="uq_deck_report_user"),)


class TeacherProfile(Base):
    """Teacher application data — mirrors the Supabase 'teacher_profiles' table."""
    __tablename__ = "teacher_profiles"

    id               = Column(PGUUID(as_uuid=True), primary_key=True, server_default="gen_random_uuid()")
    telegram_id      = Column(BigInteger, unique=True, index=True)
    specialization   = Column(String(255), nullable=True)
    experience_years = Column(Integer, nullable=True)
    bio              = Column(Text, nullable=True)
    course_idea      = Column(Text, nullable=True)
    motivation       = Column(Text, nullable=True)
    contact          = Column(String(255), nullable=True)
    applied_at       = Column(DateTime(timezone=True), nullable=True)
    # Per-teacher revenue share (fraction 0.0-1.0, e.g. 0.70 = teacher keeps 70%).
    # Column already exists in Postgres (migration 006_teacher_profiles.sql) —
    # this was previously undeclared here (ORM/DB drift), not a missing column.
    commission_rate  = Column(Numeric(4, 2), nullable=False, server_default="0.70")

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
    telegram_id = Column(BigInteger, unique=True, index=True)  # 087_fix_telegram_id_integer_overflow
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
    # Optional FK linking quiz to a specific book
    book_id = Column(Integer, ForeignKey("book.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    questions = relationship("QuizQuestion", back_populates="quiz", cascade="all, delete-orphan")
    linked_book = relationship("Book", foreign_keys=[book_id])

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
    is_downloadable = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class BookPurchase(Base):
    """Tracks paid book purchases across all payment providers."""
    __tablename__ = "book_purchase"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("book.id"), index=True)
    telegram_id = Column(BigInteger, index=True)                # buyer — 087_fix_telegram_id_integer_overflow
    provider = Column(String(30), index=True)                   # click | payme
    provider_transaction_id = Column(String(255), nullable=True) # external tx id
    order_id = Column(String(100), unique=True, index=True)     # our internal ref
    amount = Column(Float)
    currency = Column(String(10), default="UZS")                # UZS | XTR
    status = Column(String(20), default="pending", index=True)  # pending | completed | cancelled | refunded
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class BookRating(Base):
    """Stores individual user ratings and text reviews for books."""
    __tablename__ = "book_rating"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("book.id"), index=True)
    telegram_id = Column(BigInteger, index=True)  # 087_fix_telegram_id_integer_overflow
    rating = Column(Integer)  # 1-5
    review = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BookReadProgress(Base):
    """Tracks per-user reading position for the in-app book reader."""
    __tablename__ = "book_read_progress"

    id          = Column(BigInteger, primary_key=True, autoincrement=True)
    book_id     = Column(Integer, ForeignKey("book.id", ondelete="CASCADE"), nullable=False, index=True)
    telegram_id = Column(BigInteger, nullable=False, index=True)
    page_number = Column(Integer, default=1)      # PDF: last read page number
    cfi         = Column(Text, nullable=True)      # EPUB: epub.js CFI string
    percent     = Column(Float, default=0)         # 0–100
    updated_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    __table_args__ = (UniqueConstraint("book_id", "telegram_id", name="uq_book_read_progress"),)


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

class UserQuizCompletion(Base):
    """Tracks which quizzes each user has completed to prevent XP farming from retakes."""
    __tablename__ = "user_quiz_completion"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("user.id"), index=True, nullable=True)
    quiz_id = Column(Integer, ForeignKey("quiz.id"), index=True)
    telegram_id = Column(BigInteger, index=True)  # denormalize for speed — 087_fix_telegram_id_integer_overflow
    score = Column(Integer)
    total = Column(Integer)
    percentage = Column(Float)
    completed_at = Column(DateTime, default=datetime.utcnow)
    
    # Unique constraint: each user completes each quiz only once (for XP purposes)
    __table_args__ = (UniqueConstraint("telegram_id", "quiz_id", name="uq_user_quiz_completion"),)


class LessonQuiz(Base):
    """Quiz questions attached to a course lesson (lesson_type = 'quiz')."""
    __tablename__ = "lesson_quiz"

    id             = Column(Integer, primary_key=True, index=True)
    lesson_id      = Column(Integer, unique=True, index=True)  # Supabase lesson id
    title          = Column(String(255), default="Test")
    questions      = Column(JSONB)   # [{id, text, explanation, options, type}]
    time_limit_min = Column(Integer, nullable=True)
    passing_score  = Column(Integer, default=70)
    is_final       = Column(Boolean, default=False)
    created_at     = Column(DateTime, default=datetime.utcnow)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LessonQuizAttempt(Base):
    """One attempt by a user at a lesson quiz."""
    __tablename__ = "lesson_quiz_attempt"

    id           = Column(Integer, primary_key=True, index=True)
    lesson_id    = Column(Integer, index=True)
    telegram_id  = Column(BigInteger, index=True)
    started_at   = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    answers      = Column(JSONB, nullable=True)
    score_pct    = Column(Float, nullable=True)
    passed       = Column(Boolean, nullable=True)
    xp_awarded   = Column(Integer, default=0)