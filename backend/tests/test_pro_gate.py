"""
test_pro_gate.py — the Sahifalab Pro rules apply only to Pro-aware apps
(X-Client-Version >= pro_min_client_version), so the backend can ship
before the app. Pure logic, no database.
"""
import app.services.client_version as cv
from app.services.ai.limiter import effective_free_tier

GATE = {"free_daily_allowance": 3, "hard_daily_cap": 20, "pro_client_free_daily_allowance": 1, "free_paid_daily_limit": 1}


def test_legacy_client_keeps_todays_free_tier():
    assert effective_free_tier(GATE, is_pro=False, pro_client=False) == (3, None)


def test_pro_client_gets_one_free_and_one_paid():
    assert effective_free_tier(GATE, is_pro=False, pro_client=True) == (1, 1)


def test_pro_user_is_free_up_to_the_cap_on_any_client():
    assert effective_free_tier(GATE, is_pro=True, pro_client=False) == (20, None)
    assert effective_free_tier(GATE, is_pro=True, pro_client=True) == (20, None)


def test_pro_client_version_gate(monkeypatch):
    monkeypatch.setattr(cv, "get_config", lambda db, key, default=None: default)
    assert cv.is_pro_client(None, "1.7.0")
    assert cv.is_pro_client(None, "1.8")
    assert not cv.is_pro_client(None, "1.6.0")
    assert not cv.is_pro_client(None, None)
    assert not cv.is_pro_client(None, "dev")
