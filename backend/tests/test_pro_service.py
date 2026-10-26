"""
test_pro_service.py — Sahifalab Pro passes (107_pro_orders): month
arithmetic, stacking a pass on an active one, and plan prices from
app_config with safe defaults. Pure logic, no database.
"""
from datetime import datetime, timedelta, timezone

import app.services.pro_service as pro
from app.services.pro_service import DEFAULT_PRICES, add_months, extended_until

UTC = timezone.utc


def test_add_months_clamps_to_month_end():
    assert add_months(datetime(2027, 1, 31, tzinfo=UTC), 1) == datetime(2027, 2, 28, tzinfo=UTC)
    assert add_months(datetime(2028, 1, 31, tzinfo=UTC), 1) == datetime(2028, 2, 29, tzinfo=UTC)
    assert add_months(datetime(2026, 11, 15, tzinfo=UTC), 3) == datetime(2027, 2, 15, tzinfo=UTC)
    assert add_months(datetime(2026, 10, 26, tzinfo=UTC), 12) == datetime(2027, 10, 26, tzinfo=UTC)


def test_new_pass_starts_now():
    now = datetime(2026, 10, 26, 12, tzinfo=UTC)
    assert extended_until(None, 1, now) == datetime(2026, 11, 26, 12, tzinfo=UTC)
    expired = now - timedelta(days=3)
    assert extended_until(expired, 3, now) == datetime(2027, 1, 26, 12, tzinfo=UTC)


def test_pass_stacks_on_active_pro():
    now = datetime(2026, 10, 26, tzinfo=UTC)
    active = datetime(2026, 11, 10, tzinfo=UTC)
    assert extended_until(active, 1, now) == datetime(2026, 12, 10, tzinfo=UTC)
    # Naive timestamps from the DB are treated as UTC.
    assert extended_until(active.replace(tzinfo=None), 1, now) == datetime(2026, 12, 10, tzinfo=UTC)


def test_plan_prices_from_config(monkeypatch):
    monkeypatch.setattr(pro, "get_config", lambda db, key, default=None: {"1": 30000, "3": 75000, "12": "bad"})
    assert pro.plan_prices(None) == {1: 30000, 3: 75000, 12: DEFAULT_PRICES[12]}


def test_plan_prices_default_when_missing(monkeypatch):
    monkeypatch.setattr(pro, "get_config", lambda db, key, default=None: None)
    assert pro.plan_prices(None) == DEFAULT_PRICES


def test_plans_payload_savings(monkeypatch):
    monkeypatch.setattr(pro, "get_config", lambda db, key, default=None: {"1": 30000, "3": 75000, "12": 240000})
    plans = {p["months"]: p for p in pro.plans_payload(None)}
    assert plans[1]["saving_percent"] == 0
    assert plans[3]["per_month"] == 25000 and plans[3]["saving_percent"] == 17
    assert plans[12]["per_month"] == 20000 and plans[12]["saving_percent"] == 33
