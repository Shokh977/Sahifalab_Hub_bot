"""
test_enrollments_pending_mine.py — GET /api/enrollments/pending-mine (redesign
Phase 7b). Calls the endpoint function directly with Supabase REST faked at
the httpx layer, so no database or network is needed.
"""
import asyncio

import pytest

from app.api.v1.endpoints import enrollments as ep

CALLER = 424242


class _Res:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _FakeClient:
    """Records the one GET and answers with the canned response."""
    calls: list = []
    response = _Res(200, [])

    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url, params=None, headers=None):
        _FakeClient.calls.append((url, params))
        return _FakeClient.response


@pytest.fixture
def fake(monkeypatch):
    _FakeClient.calls = []
    monkeypatch.setattr(ep.httpx, "AsyncClient", _FakeClient)
    monkeypatch.setattr(ep, "SUPABASE_URL", "https://sb.test")
    monkeypatch.setattr(ep, "SUPABASE_KEY", "key")

    async def _caller(_auth):
        return CALLER
    monkeypatch.setattr(ep, "_resolve_caller", _caller)
    return _FakeClient


def _run(**kw):
    return asyncio.run(ep.my_pending_enrollments(authorization="Bearer x", **kw))


def test_filters_to_callers_active_rows(fake):
    _run()
    url, params = fake.calls[0]
    assert url == "https://sb.test/rest/v1/pending_enrollments"
    assert params["user_id"] == f"eq.{CALLER}"
    assert params["status"] == "in.(awaiting_payment,paid)"
    assert params["expires_at"].startswith("gt.")
    assert "course_id" in params["select"]


def test_returns_newest_row_per_course(fake):
    fake.response = _Res(200, [
        {"course_id": 7, "reference_code": "PAY-AAAA-BBBB", "status": "paid", "expires_at": "2026-10-19T10:00:00+00:00"},
        {"course_id": 9, "reference_code": "PAY-CCCC-DDDD", "status": "awaiting_payment", "expires_at": "2026-10-19T11:00:00+00:00"},
        {"course_id": 7, "reference_code": "PAY-OLD0-OLD0", "status": "awaiting_payment", "expires_at": "2026-10-19T09:00:00+00:00"},
    ])
    out = _run()
    assert [r["course_id"] for r in out] == [7, 9]
    assert out[0]["reference_code"] == "PAY-AAAA-BBBB"
    assert out[0]["status"] == "paid"


def test_supabase_error_returns_empty(fake):
    fake.response = _Res(500, {"message": "boom"})
    assert _run() == []
