"""
test_sponsor_service.py — the SAHIFALAB homiylari channel (111_sponsor_channel):
the price from app_config with a safe default, and the buyer label written
on a new request. Pure logic, no database.
"""
import app.services.sponsor_service as sponsor
from app.services.sponsor_service import DEFAULT_PRICE, buyer_label, price_from_config


def test_price_from_config():
    assert price_from_config({"price": 75000}) == 75000
    assert price_from_config({"price": 75000.0}) == 75000


def test_bad_config_falls_back_to_default():
    for raw in (None, "x", {}, {"price": 0}, {"price": -5}, {"price": "50000"}, {"price": True}):
        assert price_from_config(raw) == DEFAULT_PRICE


def test_current_price_reads_app_config(monkeypatch):
    monkeypatch.setattr(sponsor, "get_config", lambda db, key, default=None: {"price": 30000} if key == "sponsor_channel" else None)
    assert sponsor.current_price(None) == 30000


def test_buyer_label():
    assert buyer_label("Ali", "ali_uz") == "Ali (@ali_uz)"
    assert buyer_label("Ali", None) == "Ali"
    assert buyer_label(None, "ali_uz") == "(@ali_uz)"
    assert buyer_label(None, None) == ""
