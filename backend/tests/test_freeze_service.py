"""
test_freeze_service.py — eligibility + consecutive-cap coverage for
app/services/freeze_service.py. Pure-function tests, no database required.
"""
from datetime import date, timedelta

from app.services.freeze_service import (
    check_freeze_eligibility,
    consecutive_freeze_run_ending_before,
    MAX_CONSECUTIVE_FREEZES,
)

TODAY = date(2026, 3, 10)
MISSED = TODAY - timedelta(days=1)  # 2026-03-09


def test_eligible_when_exactly_one_day_missed_and_freeze_available():
    elig = check_freeze_eligibility(TODAY, last_date=TODAY - timedelta(days=2), freeze_count=1, freeze_used_dates=set())
    assert elig.eligible is True
    assert elig.reason is None


def test_not_missed_when_studied_yesterday():
    elig = check_freeze_eligibility(TODAY, last_date=TODAY - timedelta(days=1), freeze_count=1, freeze_used_dates=set())
    assert elig.eligible is False
    assert elig.reason == "not_missed"


def test_not_missed_when_studied_today():
    elig = check_freeze_eligibility(TODAY, last_date=TODAY, freeze_count=1, freeze_used_dates=set())
    assert elig.eligible is False
    assert elig.reason == "not_missed"


def test_already_frozen_when_missed_date_already_covered():
    elig = check_freeze_eligibility(TODAY, last_date=TODAY - timedelta(days=2), freeze_count=1, freeze_used_dates={MISSED})
    assert elig.eligible is False
    assert elig.reason == "already_frozen"


def test_gap_too_large_when_more_than_one_day_missed():
    elig = check_freeze_eligibility(TODAY, last_date=TODAY - timedelta(days=3), freeze_count=1, freeze_used_dates=set())
    assert elig.eligible is False
    assert elig.reason == "gap_too_large"


def test_gap_too_large_when_never_studied():
    elig = check_freeze_eligibility(TODAY, last_date=None, freeze_count=1, freeze_used_dates=set())
    assert elig.eligible is False
    assert elig.reason == "gap_too_large"


def test_no_freezes_when_balance_is_zero():
    elig = check_freeze_eligibility(TODAY, last_date=TODAY - timedelta(days=2), freeze_count=0, freeze_used_dates=set())
    assert elig.eligible is False
    assert elig.reason == "no_freezes"


def test_no_freezes_check_skipped_when_require_balance_false():
    elig = check_freeze_eligibility(TODAY, last_date=TODAY - timedelta(days=2), freeze_count=0, freeze_used_dates=set(), require_balance=False)
    assert elig.eligible is True


def test_consecutive_cap_blocks_a_third_consecutive_freeze():
    # Two consecutive frozen days immediately before the missed date — a
    # third would exceed MAX_CONSECUTIVE_FREEZES=2.
    freeze_used = {MISSED - timedelta(days=1), MISSED - timedelta(days=2)}
    elig = check_freeze_eligibility(TODAY, last_date=MISSED - timedelta(days=1), freeze_count=1, freeze_used_dates=freeze_used)
    assert elig.eligible is False
    assert elig.reason == "consecutive_cap"


def test_single_prior_freeze_does_not_hit_the_cap():
    freeze_used = {MISSED - timedelta(days=1)}
    elig = check_freeze_eligibility(TODAY, last_date=MISSED - timedelta(days=1), freeze_count=1, freeze_used_dates=freeze_used)
    assert elig.eligible is True


def test_consecutive_run_counts_backward_from_missed_date():
    assert consecutive_freeze_run_ending_before(set(), MISSED) == 0
    assert consecutive_freeze_run_ending_before({MISSED - timedelta(days=1)}, MISSED) == 1
    assert consecutive_freeze_run_ending_before(
        {MISSED - timedelta(days=1), MISSED - timedelta(days=2)}, MISSED,
    ) == 2


def test_consecutive_run_stops_at_a_gap():
    # missed_date-1 is NOT frozen, so the run is 0 even though missed_date-2 is.
    assert consecutive_freeze_run_ending_before({MISSED - timedelta(days=2)}, MISSED) == 0


def test_max_consecutive_freezes_constant_is_two():
    assert MAX_CONSECUTIVE_FREEZES == 2
