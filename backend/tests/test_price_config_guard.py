"""
test_price_config_guard.py — proves validate_price_config() (app/services/
ai/limiter.py) catches the exact bug that has bitten ai_dual_gate.prices
twice already: a config keyed by the wrong strings, silently resolving
every priced AI action to free via .get(feature, 0). Pure function, no DB
needed — the DB-integration half (main.py's startup_event reading
app_config and hard-failing outside DEBUG) is exercised manually against a
real Postgres instance; see the PR/session notes, not automated here since
it requires booting the full FastAPI app.
"""
from app.services.ai.limiter import validate_price_config, _FEATURE_TO_REASON


def test_correct_config_has_no_problems():
    good = {name: 10 for name in _FEATURE_TO_REASON}
    assert validate_price_config(good) == []


def test_reason_strings_used_as_keys_are_caught():
    """The actual bug that shipped: prices keyed by the ai_-prefixed
    tanga_transactions.reason strings instead of the feature names
    check_and_charge() is actually called with."""
    bad = {f"ai_{name}" if name != "flashcard_gen" else "ai_flashcard_gen": 10
           for name in _FEATURE_TO_REASON}
    problems = validate_price_config(bad)
    assert len(problems) == 2
    assert any("no matching feature" in p for p in problems)
    assert any("missing key" in p for p in problems)


def test_single_missing_feature_is_caught():
    """The subtler case: everything else right, one feature just never
    got a price key — silently free, no typo to spot in a diff."""
    prices = {name: 10 for name in _FEATURE_TO_REASON}
    del prices["explanation"]
    problems = validate_price_config(prices)
    assert len(problems) == 1
    assert "explanation" in problems[0]
    assert "missing key" in problems[0]


def test_unknown_extra_key_is_caught_even_if_everything_else_present():
    prices = {name: 10 for name in _FEATURE_TO_REASON}
    prices["typo_feature"] = 5
    problems = validate_price_config(prices)
    assert len(problems) == 1
    assert "typo_feature" in problems[0]
