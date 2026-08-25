"""
app/services/ai/circuit_breaker.py — a minimal circuit breaker so a Gemini
outage degrades gracefully instead of every request paying a full
timeout+retry cost against a provider that's already down (spec Part 4).

Module-level state, not Redis-backed: no Redis in this stack and Railway
runs this app as a single process, so per-process state is the right scope
for "the process talking to Gemini right now knows Gemini is down" — it
doesn't need to be shared across instances to do its job.
"""
import time
from dataclasses import dataclass, field

_FAILURE_THRESHOLD = 5      # consecutive failures before opening
_OPEN_SECONDS = 60          # how long the circuit stays open before a probe


@dataclass
class _CircuitState:
    consecutive_failures: int = 0
    opened_at: float = 0.0


_state = _CircuitState()


def is_open() -> bool:
    if _state.consecutive_failures < _FAILURE_THRESHOLD:
        return False
    if time.monotonic() - _state.opened_at >= _OPEN_SECONDS:
        return False  # half-open: let the next call through as a probe
    return True


def record_success() -> None:
    _state.consecutive_failures = 0


def record_failure() -> None:
    _state.consecutive_failures += 1
    if _state.consecutive_failures == _FAILURE_THRESHOLD:
        _state.opened_at = time.monotonic()
    elif _state.consecutive_failures > _FAILURE_THRESHOLD:
        # still failing during the half-open probe — reopen the window
        _state.opened_at = time.monotonic()
