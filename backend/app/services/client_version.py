"""
client_version.py — version gate (tanga-economy-rework Part 6), replaces
TANGA_MIRROR_MODE for deciding old-vs-new client behaviour.

"This backend has already broken a shipped client once. The safest posture
is that the old build's behaviour is frozen, not migrated." (spec) — so the
gate is deliberately fail-closed toward the OLD/legacy path: a missing
header, an unparseable version string, or any other ambiguity all resolve to
is_tanga_client() == False. The currently-live Play Store build has never
heard of X-Client-Version and will never send it, so it always lands on the
legacy branch automatically — no explicit allowlist of old versions needed.

Only streaks.py's purchase_freeze() consults this today (spec Part 6 is
explicit that freeze pricing is the one path with real pre-Tanga callers to
protect). AI features (explanation/flashcard_gen/tutor_session) never
existed on the old client, so they have no legacy behaviour to preserve and
are not gated here.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.services.config_service import get_config


def _parse_version(v: str) -> tuple[int, ...]:
    """'1.2.0' -> (1, 2, 0). Raises ValueError on anything else — callers
    must catch it, never let a malformed header silently mean "new"."""
    parts = v.strip().split(".")
    if not parts or not all(p.isdigit() for p in parts):
        raise ValueError(f"not a dotted-integer version: {v!r}")
    return tuple(int(p) for p in parts)


def is_tanga_client(db: Session, x_client_version: Optional[str]) -> bool:
    """True only for a request that positively identifies itself as running
    the Tanga-aware build at/above app_config's tanga_min_client_version.
    Anything else (no header, unparseable header, below the minimum) is the
    legacy client — the safe default."""
    if not x_client_version:
        return False
    try:
        current = _parse_version(x_client_version)
        minimum = _parse_version(str(get_config(db, "tanga_min_client_version", default="1.2.0")))
    except ValueError:
        return False
    # Compare element-wise, padding the shorter tuple with zeros (so "1.2" >= "1.2.0").
    length = max(len(current), len(minimum))
    current  = current  + (0,) * (length - len(current))
    minimum  = minimum  + (0,) * (length - len(minimum))
    return current >= minimum
