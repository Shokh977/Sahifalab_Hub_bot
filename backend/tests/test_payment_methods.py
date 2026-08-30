"""
test_payment_methods.py — Qo'llab-quvvatlash (donation, 095). Calls the
endpoint functions directly (same pattern as test_daily_quiz_service.py/
test_focus_endpoints.py), bypassing FastAPI's dependency injection —
`admin` is a plain in-memory AdminUser stand-in (never persisted; the code
under test only ever reads .telegram_id off it).
"""
import asyncio
import itertools
import os

import pytest
from fastapi import HTTPException
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")

TEST_ADMIN_ID = -9_000_000_130
TEST_USER_ID = -9_000_000_131

# The per-admin mutation rate limiter (admin_payment_methods._mutation_history)
# is a module-level dict shared for the lifetime of the test PROCESS, not
# reset between tests. Reusing one admin id across every test in this file
# would let earlier tests' mutations count against later ones and spuriously
# trip the 20/minute cap — give every test its own admin id instead.
_admin_id_counter = itertools.count(1)


def _admin():
    from app.models.admin_models import AdminUser
    return AdminUser(telegram_id=TEST_ADMIN_ID - next(_admin_id_counter))


@pytest.fixture
def db_session():
    if not DATABASE_URL:
        pytest.skip("DATABASE_URL not set")
    from app.db.session import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.execute(text("DELETE FROM payment_method_audit_log"))
        session.execute(text("DELETE FROM payment_methods"))
        session.execute(text("DELETE FROM analytics_events WHERE event_type LIKE 'donation_%'"))
        session.execute(text("DELETE FROM tanga_transactions WHERE user_id = :uid"), {"uid": TEST_USER_ID})
        session.execute(text("DELETE FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_USER_ID})
        session.commit()
        session.close()
        from app.api.v1.endpoints.payment_methods import invalidate_payment_methods_cache
        invalidate_payment_methods_cache()


def _valid_card_payload(**overrides) -> dict:
    payload = dict(
        bank_name="Xalq Banki", account_number="4532 0151 1283 0366",
        number_type="card", holder_name="JOHN DOE", currency="UZS", region="uz",
        swift=None, note=None,
    )
    payload.update(overrides)
    return payload


def test_public_endpoint_returns_only_active_ordered_no_internal_fields(db_session):
    from app.api.v1.endpoints.admin_payment_methods import create_payment_method, deactivate_payment_method, PaymentMethodCreate
    from app.api.v1.endpoints.payment_methods import list_payment_methods

    admin = _admin()
    first = asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload(bank_name="Bank A")), db_session, admin))
    second = asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload(bank_name="Bank B", account_number="5555555555554444")), db_session, admin))
    third = asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload(bank_name="Bank C", account_number="4111111111111111")), db_session, admin))

    # Deactivate the middle one — must disappear from the public list.
    asyncio.run(deactivate_payment_method(second["method"]["id"], db_session, admin))

    from app.api.v1.endpoints.payment_methods import invalidate_payment_methods_cache
    invalidate_payment_methods_cache()
    result = asyncio.run(list_payment_methods(db_session))
    methods = result["methods"]

    names = [m["bankName"] for m in methods]
    assert names == ["Bank A", "Bank C"], "inactive method must be hidden and order preserved"
    for m in methods:
        assert "isActive" not in m, "public endpoint must never leak is_active"
        assert "createdBy" not in m and "updatedBy" not in m, "public endpoint must never leak audit columns"


def test_admin_create_rejects_invalid_iban(db_session):
    from app.api.v1.endpoints.admin_payment_methods import create_payment_method, PaymentMethodCreate

    payload = _valid_card_payload(number_type="iban", account_number="DE00000000000000000000")  # bad checksum
    with pytest.raises(HTTPException) as exc:
        asyncio.run(create_payment_method(PaymentMethodCreate(**payload), db_session, _admin()))
    assert exc.value.status_code == 422


def test_admin_create_accepts_valid_card_with_luhn_warning_surfaced(db_session):
    from app.api.v1.endpoints.admin_payment_methods import create_payment_method, PaymentMethodCreate

    # Correct length, fails Luhn — must succeed with a warning, never be blocked.
    payload = _valid_card_payload(account_number="1234567890123456")
    result = asyncio.run(create_payment_method(PaymentMethodCreate(**payload), db_session, _admin()))
    assert result["ok"] is True
    assert result["warnings"], "Luhn failure must surface as a warning on create"


def test_reorder_rejects_mismatched_id_set(db_session):
    from app.api.v1.endpoints.admin_payment_methods import create_payment_method, reorder_payment_methods, PaymentMethodCreate, ReorderRequest

    admin = _admin()
    asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload()), db_session, admin))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(reorder_payment_methods(ReorderRequest(ordered_ids=["00000000-0000-0000-0000-000000000000"]), db_session, admin))
    assert exc.value.status_code == 400


def test_reorder_updates_sort_order_and_public_list_order(db_session):
    from app.api.v1.endpoints.admin_payment_methods import create_payment_method, reorder_payment_methods, PaymentMethodCreate, ReorderRequest
    from app.api.v1.endpoints.payment_methods import list_payment_methods, invalidate_payment_methods_cache

    admin = _admin()
    a = asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload(bank_name="A")), db_session, admin))["method"]
    b = asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload(bank_name="B", account_number="5555555555554444")), db_session, admin))["method"]

    asyncio.run(reorder_payment_methods(ReorderRequest(ordered_ids=[b["id"], a["id"]]), db_session, admin))

    invalidate_payment_methods_cache()
    result = asyncio.run(list_payment_methods(db_session))
    assert [m["bankName"] for m in result["methods"]] == ["B", "A"]


def test_account_number_change_requires_explicit_confirmation(db_session):
    from app.api.v1.endpoints.admin_payment_methods import create_payment_method, update_payment_method, PaymentMethodCreate, PaymentMethodUpdate

    admin = _admin()
    created = asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload()), db_session, admin))["method"]

    # Without confirmation -> rejected, balance/record untouched.
    with pytest.raises(HTTPException) as exc:
        asyncio.run(update_payment_method(
            created["id"], PaymentMethodUpdate(account_number="5555555555554444"), db_session, admin,
        ))
    assert exc.value.status_code == 409

    unchanged = db_session.execute(
        text("SELECT account_number FROM payment_methods WHERE id = :id"), {"id": created["id"]},
    ).scalar()
    assert unchanged == "4532015112830366"

    # With confirmation -> succeeds.
    result = asyncio.run(update_payment_method(
        created["id"],
        PaymentMethodUpdate(account_number="5555555555554444", confirm_account_number_change=True),
        db_session, admin,
    ))
    assert result["method"]["accountNumber"] == "5555555555554444"


def test_update_writes_audit_log_with_old_and_new_value(db_session):
    from app.api.v1.endpoints.admin_payment_methods import create_payment_method, update_payment_method, PaymentMethodCreate, PaymentMethodUpdate

    admin = _admin()
    created = asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload()), db_session, admin))["method"]
    asyncio.run(update_payment_method(created["id"], PaymentMethodUpdate(bank_name="Yangi Bank"), db_session, admin))

    rows = db_session.execute(
        text("SELECT action, admin_telegram_id, old_value, new_value FROM payment_method_audit_log WHERE payment_method_id = :id ORDER BY id"),
        {"id": created["id"]},
    ).fetchall()
    actions = [r.action for r in rows]
    assert actions == ["create", "update"]
    update_row = rows[1]
    assert update_row.admin_telegram_id == admin.telegram_id
    assert update_row.old_value["bank_name"] == "Xalq Banki"
    assert update_row.new_value["bank_name"] == "Yangi Bank"


def test_soft_delete_never_hard_deletes_the_row(db_session):
    from app.api.v1.endpoints.admin_payment_methods import create_payment_method, deactivate_payment_method, PaymentMethodCreate

    admin = _admin()
    created = asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload()), db_session, admin))["method"]
    asyncio.run(deactivate_payment_method(created["id"], db_session, admin))

    row = db_session.execute(
        text("SELECT is_active FROM payment_methods WHERE id = :id"), {"id": created["id"]},
    ).fetchone()
    assert row is not None, "soft delete must never remove the row"
    assert row.is_active is False


# ═══════════════════════════════════════════════════════════════════════════
# THE non-negotiable rule: a donation unlocks nothing.
# ═══════════════════════════════════════════════════════════════════════════

def test_donation_crud_lifecycle_never_touches_tanga_or_xp_or_entitlements(db_session):
    """Full create -> update -> reorder -> delete lifecycle, run by an
    admin, must never move any user's tanga_balance/total_xp, never insert
    a tanga_transactions row, and never grant a badge/stage completion —
    there is no donor identity in this schema for a reward to attach to,
    and this test pins that invariant directly rather than trusting it by
    inspection alone."""
    from app.api.v1.endpoints.admin_payment_methods import (
        create_payment_method, update_payment_method, deactivate_payment_method,
        reorder_payment_methods, PaymentMethodCreate, PaymentMethodUpdate, ReorderRequest,
    )

    db_session.execute(text("""
        INSERT INTO profiles (telegram_id, tanga_balance, total_xp, timezone)
        VALUES (:uid, 42, 100, 'Asia/Tashkent')
    """), {"uid": TEST_USER_ID})
    db_session.commit()

    admin = _admin()
    a = asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload(bank_name="A")), db_session, admin))["method"]
    b = asyncio.run(create_payment_method(PaymentMethodCreate(**_valid_card_payload(bank_name="B", account_number="5555555555554444")), db_session, admin))["method"]
    asyncio.run(update_payment_method(a["id"], PaymentMethodUpdate(note="Xayriya uchun rahmat"), db_session, admin))
    asyncio.run(reorder_payment_methods(ReorderRequest(ordered_ids=[b["id"], a["id"]]), db_session, admin))
    asyncio.run(deactivate_payment_method(a["id"], db_session, admin))

    profile = db_session.execute(
        text("SELECT tanga_balance, total_xp FROM profiles WHERE telegram_id = :uid"), {"uid": TEST_USER_ID},
    ).fetchone()
    assert profile.tanga_balance == 42, "donation admin actions must never change a user's Tanga balance"
    assert profile.total_xp == 100, "donation admin actions must never change a user's XP"

    ledger_count = db_session.execute(
        text("SELECT COUNT(*) FROM tanga_transactions WHERE user_id = :uid"), {"uid": TEST_USER_ID},
    ).scalar()
    assert ledger_count == 0, "no donation code path may write to the Tanga ledger"


def test_no_donation_source_code_references_tanga_or_entitlement_writes():
    """Static guard, cheap to run on every test invocation: the actual
    payment-methods source files must never mention the identifiers that
    would grant a user something. If someone later "helpfully" wires a
    reward into this feature, this fails immediately instead of silently
    shipping a policy violation (spec: "a donation unlocks nothing — ever")."""
    import app.api.v1.endpoints.payment_methods as public_module
    import app.api.v1.endpoints.admin_payment_methods as admin_module
    import inspect

    forbidden = ["grant_tanga", "daily_capped_grant", "add_xp", "tanga_balance", "user_stage_completions", "user_badges"]
    for module in (public_module, admin_module):
        source = inspect.getsource(module)
        for term in forbidden:
            assert term not in source, f"{module.__name__} must never reference {term!r} — a donation unlocks nothing"


def test_donation_stats_aggregates_copies_and_swipes_per_method(db_session):
    """Regression for a real gap: the copy/swipe/view analytics events were
    being written (see lib/api.ts's track() calls) but nothing ever read
    them back — 'copy rate per method' (the metric the spec calls out as
    the one that matters) had no surface at all until this endpoint."""
    from app.api.v1.endpoints.admin_payment_methods import get_donation_stats

    admin = _admin()
    method_a = "11111111-1111-1111-1111-111111111111"
    method_b = "22222222-2222-2222-2222-222222222222"

    def _seed_event(event_type: str, method_id: str, surface: str):
        db_session.execute(text("""
            INSERT INTO analytics_events (event_type, target_id, meta)
            VALUES (:et, 0, CAST(:meta AS jsonb))
        """), {"et": event_type, "meta": f'{{"methodId": "{method_id}", "surface": "{surface}"}}'})

    _seed_event("donation_page_view", method_a, "app")
    _seed_event("donation_page_view", method_a, "web")
    _seed_event("donation_number_copied", method_a, "app")
    _seed_event("donation_number_copied", method_a, "app")
    _seed_event("donation_number_copied", method_a, "web")
    _seed_event("donation_card_swiped", method_a, "app")
    _seed_event("donation_number_copied", method_b, "web")
    db_session.commit()

    result = asyncio.run(get_donation_stats(days=30, db=db_session, admin=admin))

    assert result["pageViews"] == 2
    by_id = {m["methodId"]: m for m in result["methods"]}
    assert by_id[method_a]["copies"] == 3
    assert by_id[method_a]["swipes"] == 1
    assert by_id[method_a]["bySurface"]["app"] == {"copies": 2, "swipes": 1}
    assert by_id[method_a]["bySurface"]["web"] == {"copies": 1, "swipes": 0}
    assert by_id[method_b]["copies"] == 1
