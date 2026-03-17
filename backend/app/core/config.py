from pydantic_settings import BaseSettings
from pydantic import field_validator
from typing import List
from functools import lru_cache

class Settings(BaseSettings):
    """Application settings"""
    
    # App
    APP_NAME: str = "SAHIFALAB Telegram Mini App"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    
    # API
    API_V1_PREFIX: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "postgresql://user:password@localhost/sahifalab_db"
    DATABASE_ECHO: bool = False
    
    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_BOT_USERNAME: str = "sahifalab_bot"
    # Chat ID where bot stores audio files (can be admin's own ID)
    STORAGE_CHAT_ID: int = 0
    # Comma-separated Telegram IDs of admins, e.g. "123456789,987654321"
    ADMIN_TELEGRAM_IDS: List[int] = []

    # Payment — Click.uz
    CLICK_MERCHANT_ID: str = ""
    CLICK_SERVICE_ID: str = ""
    CLICK_SECRET_KEY: str = ""

    # Payment — Payme.uz
    PAYME_MERCHANT_ID: str = ""
    PAYME_SECRET_KEY: str = ""

    @field_validator('ADMIN_TELEGRAM_IDS', mode='before')
    @classmethod
    def parse_admin_ids(cls, v):
        if isinstance(v, list):
            return v
        if isinstance(v, int):
            return [v]
        if isinstance(v, str):
            v = v.strip()
            if v.startswith('['):
                import json
                return json.loads(v)
            return [int(x.strip()) for x in v.split(',') if x.strip()]
        return v
    
    # JWT
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS — override via CORS_ORIGINS env var (comma-separated)
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "https://sahifalab-hub-bot.vercel.app",
    ]
    
    # Security — '*' allows Railway's internal hostnames
    ALLOWED_HOSTS: List[str] = ["*"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
