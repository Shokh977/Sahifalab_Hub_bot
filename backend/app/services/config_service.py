"""
config_service.py — reads app_config (088_tanga_currency), the key/value
table that lets TANGA_MIRROR_MODE and the AI dual-gate limits/prices change
without a Railway redeploy. No such mechanism existed before this: every
other toggle in this codebase (CRON_SECRET, GEMINI_API_KEY, ...) is an env
var baked in at deploy time.

Caching: no Redis in this stack and Railway runs this app as a single
process, so a short-TTL module-level dict is enough — each config read costs
one extra roundtrip at most once per _CACHE_TTL_SECONDS per key, not once
per request.
"""
import json
import time
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

_CACHE_TTL_SECONDS = 30
_cache: dict[str, tuple[float, Any]] = {}


def _coerce(value: Any) -> Any:
    """pg8000 returns JSONB already decoded in most setups, but defend
    against the string case rather than assume the driver's behavior."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except (ValueError, TypeError):
            return value
    return value


def get_config(db: Session, key: str, default: Any = None) -> Any:
    now = time.monotonic()
    cached = _cache.get(key)
    if cached is not None and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    row = db.execute(text("SELECT value FROM app_config WHERE key = :key"), {"key": key}).fetchone()
    value = _coerce(row.value) if row is not None else default
    _cache[key] = (now, value)
    return value


def invalidate_config_cache(key: Optional[str] = None) -> None:
    """Call after an admin writes to app_config so the new value is picked up
    immediately instead of waiting out the TTL."""
    if key is None:
        _cache.clear()
    else:
        _cache.pop(key, None)
