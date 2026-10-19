"""
test_leaderboard_weekly.py — GET /api/leaderboard/weekly additions for Bugun's
rival ladder (redesign Phase 7.5 C4): `total` and `around_me`. Calls the
endpoint function directly against real Postgres (DATABASE_URL; skipped
otherwise), like the other endpoint tests.
"""
import os

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")
BASE = -9_100_000_000
N = 105  # more than the 100 rows the global list returns


@pytest.fixture(autouse=True)
def no_badges(monkeypatch):
    # Badge decoration reads tables the minimal schema doesn't have; it's
    # not what these tests are about.
    from app.api.v1.endpoints import leaderboard
    monkeypatch.setattr(leaderboard, "get_top_badges_map", lambda db, ids: {})


@pytest.fixture
def db():
    if not DATABASE_URL:
        pytest.skip("DATABASE_URL not set")
    from app.db.session import SessionLocal
    s = SessionLocal()
    # Columns/tables the endpoint reads that the minimal test schema lacks.
    s.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS site_username TEXT"))
    s.execute(text("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_type TEXT"))
    s.execute(text("CREATE TABLE IF NOT EXISTS follows (follower_id BIGINT, following_id BIGINT)"))
    s.commit()
    ids = [BASE - i for i in range(N)]
    try:
        s.execute(text("DELETE FROM xp_logs WHERE user_id = ANY(:u)"), {"u": ids})
        s.execute(text("DELETE FROM profiles WHERE telegram_id = ANY(:u)"), {"u": ids})
        for i, uid in enumerate(ids):
            s.execute(text("INSERT INTO profiles (telegram_id, first_name) VALUES (:u, :n)"), {"u": uid, "n": f"P{i + 1}"})
            # Strictly decreasing scores: user i is rank i+1 among these users,
            # far above anything other tests leave behind.
            s.execute(text("INSERT INTO xp_logs (user_id, amount, source) VALUES (:u, :a, 'DEEP_WORK')"),
                      {"u": uid, "a": 1_000_000 - i * 10})
        s.commit()
        yield s, ids
    finally:
        s.rollback()
        s.execute(text("DELETE FROM xp_logs WHERE user_id = ANY(:u)"), {"u": ids})
        s.execute(text("DELETE FROM profiles WHERE telegram_id = ANY(:u)"), {"u": ids})
        s.commit()
        s.close()


def _call(s, caller, scope="global"):
    from app.api.v1.endpoints.leaderboard import weekly_leaderboard
    return weekly_leaderboard(scope=scope, period="week", db=s, caller_id=caller)


def test_total_counts_everyone_with_xp_this_week(db):
    s, ids = db
    res = _call(s, ids[0])
    assert res["total"] >= N
    assert len(res["entries"]) == 100


def test_around_me_outside_the_list(db):
    s, ids = db
    me = ids[102]                                   # rank 103: not in the top 100
    res = _call(s, me)
    assert res["my_rank"] == 103
    assert [r["rank"] for r in res["around_me"]] == [102, 103, 104]
    assert [r["is_me"] for r in res["around_me"]] == [False, True, False]
    assert res["around_me"][1]["first_name"] == "P103"


def test_around_me_empty_inside_the_list_and_at_the_bottom(db):
    s, ids = db
    assert _call(s, ids[5])["around_me"] == []      # rank 6: already in entries
    last = _call(s, ids[N - 1])
    assert [r["is_me"] for r in last["around_me"]][-1] is True


def test_friends_total_is_the_pool(db):
    s, ids = db
    res = _call(s, ids[0], scope="friends")
    assert res["total"] == 1                         # follows nobody: just you
    assert res["around_me"] == []
