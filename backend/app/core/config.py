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
    TELEGRAM_BOT_USERNAME: str = "sahifalab_hub_bot"
    # Chat ID where bot stores audio files (can be admin's own ID)
    STORAGE_CHAT_ID: int = 0
    # Comma-separated Telegram IDs of admins, e.g. "123456789,987654321"
    ADMIN_TELEGRAM_IDS: List[int] = []

    # Payment — BotFather provider tokens (kept for backwards compat, unused in v2)
    # CLICK_PROVIDER_TOKEN: str = ""
    # PAYME_PROVIDER_TOKEN: str = ""

    # Payment — Direct merchant credentials (for webhooks + browser checkout)
    # Click: get from Click.uz merchant dashboard
    CLICK_MERCHANT_ID:  str = ""
    CLICK_SERVICE_ID:   str = ""
    CLICK_SECRET_KEY:   str = ""
    # Payme: get from Payme merchant dashboard
    PAYME_MERCHANT_ID:  str = ""
    PAYME_MERCHANT_KEY: str = ""
    # Frontend URL for return after payment
    PAYMENT_RETURN_URL: str = "https://sahifalab-hub-bot.vercel.app"

    # Bunny.net CDN — video storage (Step 10)
    # BUNNY_STORAGE_ZONE   → Storage zone name in Bunny.net panel
    # BUNNY_API_KEY        → Storage zone FTP / API password (Read/Write)
    # BUNNY_CDN_HOSTNAME   → Pull-zone hostname, e.g. sahifalab.b-cdn.net
    # BUNNY_STORAGE_REGION → Storage endpoint region (default = de/Frankfurt)
    #   Options: de (default) | ny | la | sg | syd | br | jh
    BUNNY_STORAGE_ZONE:   str = ""
    BUNNY_API_KEY:        str = ""
    BUNNY_CDN_HOSTNAME:   str = ""
    BUNNY_STORAGE_REGION: str = "de"

    # Google OAuth — Web Client ID (same value the frontend sends tokens against)
    GOOGLE_CLIENT_ID:     str = ""
    GOOGLE_CLIENT_SECRET: str = ""

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
    
    # JWT — MUST override SECRET_KEY in production via env var
    SECRET_KEY: str = "CHANGE-ME-IN-PRODUCTION-SET-SECRET_KEY-ENV"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS — override via CORS_ORIGINS env var (comma-separated)
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8000",
        "https://sahifalab-hub-bot.vercel.app",
        # Allow any Vercel preview/production URL for this project
        "https://sahifalab-hub-bot-*.vercel.app",
        # Railway backend talking to itself (health checks etc.)
        "https://*.up.railway.app",
    ]

    @field_validator('CORS_ORIGINS', mode='before')
    @classmethod
    def parse_cors_origins(cls, v):
        """Also accept CORS_ORIGINS as a comma-separated env var string."""
        if isinstance(v, str):
            return [o.strip() for o in v.split(',') if o.strip()]
        return v
    
    # Security — '*' allows Railway's internal hostnames
    ALLOWED_HOSTS: List[str] = ["*"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
