"""
app/services/ai/cache.py — hash-normalised-input -> output cache
(089_ai_infrastructure). Flashcard generation from the same textbook page,
or the same explanation asked twice, should never hit the provider twice
(spec Part 4).

No Redis in this stack, so ai_response_cache is a plain Postgres table.
Expiry is lazy (checked on read, not swept by a background job) — a stale
row just sits there until it's naturally overwritten or the table is
vacuumed by a future admin job; that's an acceptable trade for not needing
another cron entry right now.
"""
import hashlib
import logging
from datetime import datetime, timedelta, UTC
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

DEFAULT_TTL_HOURS = 24 * 30  # 30 days — textbook pages don't change


def make_cache_key(feature: str, normalized_input: str, language: str = "") -> str:
    # language is folded into the hashed content (not appended to the key
    # string) so a caller that never passes it produces the exact same key
    # as before — existing cache rows for language-less features stay valid.
    composite = f"{language}\x1f{normalized_input}" if language else normalized_input
    input_hash = hashlib.sha256(composite.encode("utf-8")).hexdigest()
    return f"{feature}:{input_hash}"


def get_cached(db: Session, feature: str, normalized_input: str, language: str = "") -> Optional[dict]:
    cache_key = make_cache_key(feature, normalized_input, language)
    row = db.execute(
        text("""
            SELECT output FROM ai_response_cache
            WHERE cache_key = :key AND expires_at > NOW()
        """),
        {"key": cache_key},
    ).fetchone()
    if row is None:
        return None
    db.execute(
        text("UPDATE ai_response_cache SET hit_count = hit_count + 1 WHERE cache_key = :key"),
        {"key": cache_key},
    )
    db.commit()
    return row.output


def store_cached(
    db: Session, feature: str, normalized_input: str, output: dict,
    ttl_hours: int = DEFAULT_TTL_HOURS, language: str = "",
) -> None:
    cache_key = make_cache_key(feature, normalized_input, language)
    input_hash = cache_key.split(":", 1)[1]
    expires_at = datetime.now(UTC) + timedelta(hours=ttl_hours)
    try:
        db.execute(
            text("""
                INSERT INTO ai_response_cache (cache_key, feature, input_hash, output, expires_at)
                VALUES (:key, :feature, :hash, CAST(:output AS jsonb), :expires)
                ON CONFLICT (cache_key) DO UPDATE
                    SET output = EXCLUDED.output, expires_at = EXCLUDED.expires_at, hit_count = 0
            """),
            {"key": cache_key, "feature": feature, "hash": input_hash,
             "output": _to_json(output), "expires": expires_at},
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Failed to write AI response cache entry (feature=%s)", feature, exc_info=True)


def _to_json(output: dict) -> str:
    import json
    return json.dumps(output)
