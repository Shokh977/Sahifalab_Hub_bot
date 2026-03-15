from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool, StaticPool
from app.core.config import settings

def _build_db_url(url: str) -> str:
    """Ensure the correct SQLAlchemy dialect prefix.
    Vercel serverless uses pg8000 (pure Python); psycopg2 is not reliable there.
    """
    if url.startswith("postgresql://") or url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+pg8000://", 1).replace(
            "postgresql://", "postgresql+pg8000://", 1
        )
    return url  # already has dialect (e.g. postgresql+pg8000://)

_db_url = _build_db_url(settings.DATABASE_URL)

# Use NullPool for serverless (no persistent connection pool between invocations)
_is_sqlite = "sqlite" in _db_url
engine = create_engine(
    _db_url,
    echo=settings.DATABASE_ECHO,
    poolclass=StaticPool if _is_sqlite else NullPool,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

# Create session factory
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

# Base class for models
Base = declarative_base()

def get_db():
    """Database session dependency"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Initialize database tables
def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
