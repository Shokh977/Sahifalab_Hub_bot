# Import all models so SQLAlchemy Base.metadata knows about them for init_db()
from app.models.models import User, Product, Order, Cart, Quote, Quiz, QuizQuestion, Book, BookPurchase, BookRating, Resource  # noqa: F401
from app.models.admin_models import AdminUser, HeroContent, PaymentConfig, BookAuditLog, QuizAuditLog, AmbientSound, EnrollmentAuditLog  # noqa: F401
from app.models.social_models import (  # noqa: F401
    Post, PostLike, PostComment, Follow, Repost, Conversation, DirectMessage,
    # 044: professional network
    Skill, SkillEndorsement, Connection,
    # 045: activity & profile views
    ActivityLog, ProfileViewLog,
)
from app.models.job_models import Job, JobApplication  # noqa: F401  (045)
