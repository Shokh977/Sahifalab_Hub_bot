"""
test_forest_service.py — O'rmon: finished streaks become trees, the live
streak stays the current tree, and the stats count both. Pure logic; the
SQL (streak_runs) was checked against a local Postgres with pg8000.
"""
from datetime import date

from app.services.forest_service import forest, forest_stats

TODAY = date(2026, 10, 26)
RUNS = [
    {"start": date(2026, 10, 24), "end": date(2026, 10, 26), "days": 3},   # still going
    {"start": date(2026, 10, 11), "end": date(2026, 10, 14), "days": 4},
    {"start": date(2026, 9, 16), "end": date(2026, 9, 25), "days": 10},
]


def test_live_streak_is_not_in_the_forest():
    trees = forest(RUNS, current_streak=3, today=TODAY)
    assert [t["days"] for t in trees] == [4, 10]
    assert trees[0] == {"start": "2026-10-11", "end": "2026-10-14", "days": 4}


def test_a_run_ending_yesterday_is_still_the_live_streak():
    runs = [{"start": date(2026, 10, 20), "end": date(2026, 10, 25), "days": 6}]
    assert forest(runs, current_streak=6, today=TODAY) == []


def test_a_lost_streak_joins_the_forest():
    trees = forest(RUNS, current_streak=0, today=TODAY)
    assert [t["days"] for t in trees] == [3, 4, 10]


def test_stats_count_the_current_tree():
    trees = forest(RUNS, current_streak=3, today=TODAY)
    assert forest_stats(trees, 3) == {"trees": 3, "longest": 10, "total_days": 17}
    assert forest_stats([], 0) == {"trees": 0, "longest": 0, "total_days": 0}
