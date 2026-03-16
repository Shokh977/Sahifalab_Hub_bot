from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool, StaticPool
from app.core.config import settings
import ssl
import re

def _build_db_url(url: str) -> str:
    """Ensure the correct SQLAlchemy dialect prefix for pg8000.
    Also strips ?sslmode=... because pg8000 doesn't accept it in the URL.
    """
    # Strip sslmode query param — pg8000 uses ssl_context in connect_args instead
    url = re.sub(r'[?&]sslmode=[^&]*', '', url).rstrip('?').rstrip('&')

    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+pg8000://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+pg8000://", 1)
    return url

_db_url = _build_db_url(settings.DATABASE_URL)
_is_sqlite = "sqlite" in _db_url

def _build_connect_args():
    if _is_sqlite:
        return {"check_same_thread": False}
    # For Supabase / any remote Postgres: enable SSL via ssl_context
    if "localhost" not in _db_url and "127.0.0.1" not in _db_url:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return {"ssl_context": ctx}
    return {}

engine = create_engine(
    _db_url,
    echo=settings.DATABASE_ECHO,
    poolclass=StaticPool if _is_sqlite else NullPool,
    connect_args=_build_connect_args(),
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
