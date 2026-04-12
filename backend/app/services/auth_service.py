import hashlib
import hmac
import json
import logging
import urllib.parse
from datetime import datetime, UTC, timedelta
from typing import Optional
import jwt
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)

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
    Verify Telegram Login Widget data (NOT Mini App initData).
    Secret key = SHA256(bot_token)  — Widget-specific algorithm.
    """
    data_dict = data.dict(exclude={"hash"})
    check_string = "\n".join(
        f"{key}={value}"
        for key, value in sorted(data_dict.items())
    )
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    computed_hash = hmac.new(secret_key, check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, data.hash):
        logger.warning("verify_telegram_auth: hash mismatch")
        return False

    current_time = datetime.now(UTC).timestamp()
    age = current_time - data.auth_date
    if age > 86400:
        logger.warning("verify_telegram_auth: auth_date too old (age=%.0fs)", age)
        return False

    return True


def validate_tma_init_data(init_data: str, bot_token: str, max_age_seconds: int = 86400) -> Optional[dict]:
    """
    Validate Telegram Mini App (TMA) initData string.

    Key derivation for Mini App is different from the Login Widget:
        secret_key = HMAC-SHA256(key=b"WebAppData", msg=bot_token.encode())

    Returns the parsed user dict on success, None on any failure.
    Logs the specific failure reason for debugging.
    """
    if not init_data:
        logger.warning("validate_tma_init_data: empty initData")
        return None

    # Parse the URL-encoded initData
    try:
        params = dict(urllib.parse.parse_qsl(init_data, keep_blank_values=True))
    except Exception as exc:
        logger.warning("validate_tma_init_data: failed to parse initData – %s", exc)
        return None

    received_hash = params.pop("hash", None)
    if not received_hash:
        logger.warning("validate_tma_init_data: missing hash field")
        return None

    # Build the data-check string: alphabetically sorted key=value pairs joined by \n
    data_check_string = "\n".join(
        f"{k}={v}" for k, v in sorted(params.items())
    )

    # Derive the secret key: HMAC-SHA256("WebAppData", bot_token)
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()

    # Compute expected hash
    computed_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(computed_hash, received_hash):
        logger.warning(
            "validate_tma_init_data: hash mismatch\n"
            "  data_check_string=%r\n"
            "  received =%s\n"
            "  computed =%s",
            data_check_string, received_hash, computed_hash,
        )
        return None

    # Validate auth_date freshness
    try:
        auth_date = int(params.get("auth_date", 0))
    except (ValueError, TypeError):
        logger.warning("validate_tma_init_data: invalid auth_date value")
        return None

    age = datetime.now(UTC).timestamp() - auth_date
    if age > max_age_seconds:
        logger.warning(
            "validate_tma_init_data: auth_date too old (age=%.0fs, max=%ds)",
            age, max_age_seconds,
        )
        return None

    # Parse the embedded user JSON
    user_json = params.get("user")
    if not user_json:
        logger.warning("validate_tma_init_data: missing user field in initData")
        return None

    try:
        user = json.loads(user_json)
    except json.JSONDecodeError as exc:
        logger.warning("validate_tma_init_data: invalid user JSON – %s", exc)
        return None

    logger.info("validate_tma_init_data: OK for user_id=%s", user.get("id"))
    return user

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
