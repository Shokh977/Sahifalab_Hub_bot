import hashlib
import hmac
from datetime import datetime, UTC, timedelta
from typing import Optional
import jwt
from pydantic import BaseModel

from app.core.config import settings

# Single source of truth — always reads from Settings (env → default)
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_DAYS = 30

class TelegramAuthData(BaseModel):
    """Data from Telegram login widget"""
    id: int
    first_name: str
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str

def verify_telegram_auth(data: TelegramAuthData, bot_token: str) -> bool:
    """
    Verify that the login data really came from Telegram.
    
    Telegram signs the data with your bot token.
    """
    # Create the data check string in alphabetical order
    data_dict = data.dict(exclude={"hash"})
    check_string = "\n".join(
        f"{key}={value}" 
        for key, value in sorted(data_dict.items())
    )
    
    # Create the secret key hash
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    
    # Compute HMAC-SHA256
    computed_hash = hmac.new(
        secret_key,
        check_string.encode(),
        hashlib.sha256
    ).hexdigest()
    
    # Verify the hash matches
    if computed_hash != data.hash:
        return False
    
    # Check auth date (not older than 24 hours)
    current_time = datetime.now(UTC).timestamp()
    if current_time - data.auth_date > 86400:
        return False
    
    return True

def create_access_token(telegram_id: int, role: str = "student") -> dict:
    """
    Create JWT token for user.
    role is embedded so upload/teacher-gated endpoints can verify without a DB round-trip.
    """
    expire = datetime.now(UTC) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)

    payload = {
        "sub":  str(telegram_id),
        "role": role,
        "exp":  expire,
        "iat":  datetime.now(UTC),
    }

    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return {
        "access_token": token,
        "token_type":   "bearer",
        "expires_in":   ACCESS_TOKEN_EXPIRE_DAYS * 86400,
    }

def decode_token(token: str) -> Optional[int]:
    """
    Decode JWT token and return telegram_id (int).
    Kept for backward-compat with auth.py helpers.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload.get("sub"))
    except Exception:
        return None


def decode_token_payload(token: str) -> Optional[dict]:
    """
    Decode JWT and return {"telegram_id": int, "role": str}.
    Returns None on any error.
    Falls back to role="student" if the field is absent (old tokens).
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {
            "telegram_id": int(payload.get("sub")),
            "role":        payload.get("role", "student"),
        }
    except Exception:
        return None
