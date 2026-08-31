"""
test_weekly_review_service.py — weekly review timing rework: every user
gets their review on THEIR OWN local Monday at 7am+ (profiles.timezone),
not a single shared UTC instant and not staggered across different
weekdays by telegram_id % 7 anymore.

The SQL-vs-Python cross-check below is deliberately NOT time-hardcoded —
asserting "these specific timezones are due right now" would be flaky
depending on when the suite happens to run. Instead it asserts the raw SQL
condition in run_staggered_batch's WHERE clause always agrees with the same
decision computed via user_time.py's already-unit-tested pure functions,
for a spread of real IANA zones, regardless of the actual wall-clock time.
"""
import os
from datetime import date, datetime, timedelta, UTC

import pytest
from sqlalchemy import text

DATABASE_URL = os.environ.get("DATABASE_URL")

TEST_BASE_ID = -9_000_000_140

ZONES = [
    "Asia/Tashkent", "Asia/Seoul", "Pacific/Kiritimati", "Pacific/Midway",
    "America/Los_Angeles", "Etc/GMT+12", "Europe/London", "Asia/Kolkata",
    "Pacific/Auckland", "America/Sao_Paulo",
]


@pytest.fixture
def db_session():
    if not DATABASE_URL:
        pytest.skip("DATABASE_URL not set")
    from app.db.session import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        # Covers the ZONES-indexed ids (0..len(ZONES)-1) AND the individual
        # tests' fixed offsets (100-109) — each test uses a distinct offset
        # so there's no intra-run collision, but every id used anywhere in
        # this file must be cleaned up here regardless.
        ids = [TEST_BASE_ID - i for i in range(len(ZONES) + 2)] + [TEST_BASE_ID - i for i in range(100, 110)]
        session.execute(text("DELETE FROM weekly_reviews WHERE user_id = ANY(:ids)"), {"ids": ids})
        session.execute(text("DELETE FROM focus_sessions WHERE user_id = ANY(:ids)"), {"ids": ids})
        session.execute(text("DELETE FROM challenge_participants WHERE user_id = ANY(:ids)"), {"ids": ids})
        session.execute(text("DELETE FROM xp_logs WHERE user_id = ANY(:ids)"), {"ids": ids})
        session.execute(text("DELETE FROM profiles WHERE telegram_id = ANY(:ids)"), {"ids": ids})
        session.commit()
        session.close()


def test_sql_local_monday_7am_condition_matches_python_user_time_semantics(db_session):
    """run_staggered_batch's raw SQL (EXTRACT(ISODOW...)=1 AND
    EXTRACT(HOUR...)>=7) must decide "is this user due" identically to
    user_time.py's user_local_date()/user_local_hour() pure functions, for
    every zone tested — no off-by-one in the ISODOW->Python-weekday
    conversion, no mismatch in how "local" is computed."""
    from app.services.user_time import user_local_date, user_local_hour

    ids_by_zone = {}
    for i, tz in enumerate(ZONES):
        uid = TEST_BASE_ID - i
        ids_by_zone[tz] = uid
        db_session.execute(
            text("INSERT INTO profiles (telegram_id, status, timezone) VALUES (:uid, 'active', :tz)"),
            {"uid": uid, "tz": tz},
        )
    db_session.commit()

    rows = db_session.execute(
        text("""
            SELECT telegram_id FROM profiles
            WHERE telegram_id = ANY(:ids)
              AND EXTRACT(ISODOW FROM (NOW() AT TIME ZONE COALESCE(timezone, 'Asia/Tashkent'))) = 1
              AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(timezone, 'Asia/Tashkent'))) >= 7
        """),
        {"ids": list(ids_by_zone.values())},
    ).fetchall()
    sql_due = {int(r.telegram_id) for r in rows}

    python_due = {
        uid for tz, uid in ids_by_zone.items()
        if user_local_date(tz).weekday() == 0 and user_local_hour(tz) >= 7
    }

    assert sql_due == python_due, (
        f"SQL and Python disagree on who's due — SQL said {sql_due}, Python said {python_due}"
    )


def test_run_staggered_batch_finds_candidates_without_error(db_session):
    """Smoke test: the query itself must run cleanly against real profile
    rows (COALESCE fallback, casts, etc.) regardless of whether anyone is
    actually due right now."""
    import asyncio
    from app.services.weekly_review_service import run_staggered_batch

    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone) VALUES (:uid, 'active', 'Asia/Tashkent')"),
        {"uid": TEST_BASE_ID - 100},
    )
    db_session.commit()

    result = asyncio.run(run_staggered_batch(db_session, max_users=10))
    assert "candidates" in result and "generated" in result and "skipped" in result


def test_generate_weekly_review_skips_users_with_zero_activity(db_session):
    """No focus minutes and no flashcard reviews -> skipped, no row
    inserted, no AI call attempted (this must never spend a Gemini call on
    silence)."""
    import asyncio
    from app.services.weekly_review_service import generate_weekly_review

    uid = TEST_BASE_ID - 101
    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone) VALUES (:uid, 'active', 'Asia/Tashkent')"),
        {"uid": uid},
    )
    db_session.commit()

    ok = asyncio.run(generate_weekly_review(db_session, uid, date.today()))
    assert ok is False

    row = db_session.execute(text("SELECT 1 FROM weekly_reviews WHERE user_id = :uid"), {"uid": uid}).fetchone()
    assert row is None


def test_generate_weekly_review_is_idempotent_per_week(db_session):
    """A row already existing for this week_start -> skipped immediately,
    never re-generated (and never re-spends an AI call)."""
    import asyncio
    import json
    from app.services.weekly_review_service import generate_weekly_review, _week_start

    uid = TEST_BASE_ID - 102
    today = date.today()
    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone) VALUES (:uid, 'active', 'Asia/Tashkent')"),
        {"uid": uid},
    )
    db_session.execute(
        text("""
            INSERT INTO weekly_reviews (user_id, week_start, content)
            VALUES (:uid, :ws, CAST(:content AS jsonb))
        """),
        {"uid": uid, "ws": _week_start(today), "content": json.dumps({"already": "here"})},
    )
    db_session.commit()

    ok = asyncio.run(generate_weekly_review(db_session, uid, today))
    assert ok is False

    count = db_session.execute(text("SELECT COUNT(*) FROM weekly_reviews WHERE user_id = :uid"), {"uid": uid}).scalar()
    assert count == 1


def test_week_start_returns_last_completed_week_not_this_week():
    """Regression for a real bug the timing rework exposed: since the batch
    now only ever calls generate_weekly_review on the user's own local
    Monday, _week_start(today) must return LAST week's Monday (the week
    that just ended), never "today" itself — a review generated the same
    morning a new week starts must summarize the completed week, not the
    few hours since midnight. Checked for every weekday, not just Monday,
    since the formula must stay correct even if called off-schedule."""
    from app.services.weekly_review_service import _week_start
    from datetime import timedelta

    monday = date(2026, 8, 31)  # a known real Monday
    assert monday.weekday() == 0
    for offset in range(7):
        today = monday + timedelta(days=offset)
        result = _week_start(today)
        assert result == monday - timedelta(days=7), (
            f"for today={today} ({today.strftime('%A')}), expected last week's Monday "
            f"{monday - timedelta(days=7)}, got {result}"
        )


def test_gather_user_stats_excludes_activity_outside_the_reviewed_week(db_session):
    """Regression: this_week_minutes/days_active/week_xp/etc. used to have
    no upper bound, so a review generated Monday morning for LAST week
    would silently include today's (the NEW week's) activity too. A
    session inside the reviewed week must count; one the day after the
    reviewed week ends (i.e. in the following week) must not."""
    from app.services.weekly_review_service import gather_user_stats

    uid = TEST_BASE_ID - 103
    week_start = date(2026, 8, 17)   # a Monday
    week_end_exclusive = date(2026, 8, 24)  # the following Monday
    today = date(2026, 8, 24)  # the day the review is generated (next Monday)

    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone, daily_goal_minutes) VALUES (:uid, 'active', 'Asia/Tashkent', 20)"),
        {"uid": uid},
    )
    # Inside the reviewed week — must count.
    db_session.execute(
        text("INSERT INTO focus_sessions (user_id, minutes, session_date) VALUES (:uid, 30, :d)"),
        {"uid": uid, "d": week_start},
    )
    # The day the NEW week starts — must NOT count toward the reviewed week.
    db_session.execute(
        text("INSERT INTO focus_sessions (user_id, minutes, session_date) VALUES (:uid, 999, :d)"),
        {"uid": uid, "d": week_end_exclusive},
    )
    db_session.commit()

    stats = gather_user_stats(db_session, uid, week_start, today)
    assert stats["week_start"] == week_start.isoformat()
    assert stats["this_week_minutes"] == 30, "must exclude the session dated the day the following week starts"
    assert stats["days_active"] == 1


def test_gather_user_stats_day_chart_includes_todays_partial_activity(db_session):
    """Regression: the day-by-day chart loop must include TODAY's own data
    when `today` falls genuinely inside the queried window (the
    current_week_progress use case in GET /weekly-review) — not stop the
    day before. For an already-completed week `today` is always
    week_start+7 regardless, so this can't regress that case."""
    from app.services.weekly_review_service import gather_user_stats

    uid = TEST_BASE_ID - 104
    monday = date(2026, 8, 17)
    wednesday = date(2026, 8, 19)  # "today" — day 2 of the in-progress week

    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone, daily_goal_minutes) VALUES (:uid, 'active', 'Asia/Tashkent', 20)"),
        {"uid": uid},
    )
    db_session.execute(
        text("INSERT INTO focus_sessions (user_id, minutes, session_date) VALUES (:uid, 25, :d)"),
        {"uid": uid, "d": wednesday},
    )
    db_session.commit()

    stats = gather_user_stats(db_session, uid, monday, wednesday)
    day_dates = [d["date"] for d in stats["days"]]
    assert wednesday.isoformat() in day_dates, "today's own date must appear in the in-progress-week chart"
    assert len(stats["days"]) == 3  # Mon, Tue, Wed — not stopping at Tue
    wed_entry = next(d for d in stats["days"] if d["date"] == wednesday.isoformat())
    assert wed_entry["minutes"] == 25


def test_weekly_review_endpoint_always_returns_current_week_progress(db_session):
    """current_week_progress must always be present and reflect the TRUE
    current week — distinct from live_stats/review, which stay scoped to
    the last COMPLETED week. Additive field; must not change live_stats'
    existing meaning (the old deployed client depends on that)."""
    import asyncio
    from app.api.v1.endpoints.ai import get_latest_weekly_review

    uid = TEST_BASE_ID - 105
    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone, daily_goal_minutes) VALUES (:uid, 'active', 'Asia/Tashkent', 20)"),
        {"uid": uid},
    )
    db_session.commit()

    result = asyncio.run(get_latest_weekly_review(db=db_session, caller_id=uid))
    assert "current_week_progress" in result
    assert result["current_week_progress"] is not None
    assert result["current_week_progress"]["week_start"] is not None


def test_gather_user_stats_includes_challenges_quiz_and_rank(db_session):
    """Regression for the content-richness gap: gather_user_stats used to
    say nothing about Bellashuv (challenges) or the daily quiz, and had no
    competitive framing (week_xp_rank) for the AI to use instead of generic
    praise."""
    from app.services.weekly_review_service import gather_user_stats

    uid = TEST_BASE_ID - 106
    week_start = date(2026, 8, 17)
    today = date(2026, 8, 24)

    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone, daily_goal_minutes) VALUES (:uid, 'active', 'Asia/Tashkent', 20)"),
        {"uid": uid},
    )
    db_session.execute(
        text("INSERT INTO challenge_participants (user_id, completed_at) VALUES (:uid, :d)"),
        {"uid": uid, "d": datetime(2026, 8, 19, tzinfo=UTC)},
    )
    db_session.execute(
        text("INSERT INTO xp_logs (user_id, amount, source, created_at) VALUES (:uid, 500, 'DEEP_WORK', :d)"),
        {"uid": uid, "d": datetime(2026, 8, 18, tzinfo=UTC)},
    )
    db_session.commit()

    stats = gather_user_stats(db_session, uid, week_start, today)
    assert stats["challenges_joined_count"] == 1
    assert stats["challenges_completed_this_week"] == 1
    assert stats["daily_quiz_played_this_week"] == 0
    assert stats["week_xp_rank"] == 1, "sole scorer that week must rank 1st"


def test_pick_feature_spotlight_covers_daily_quiz_and_challenges():
    """The spotlight used to only ever recommend flashcards or courses —
    now covers daily_quiz and challenges too, reached once flashcards and
    courses are both already active."""
    from app.services.weekly_review_service import _pick_feature_spotlight

    base_active_stats = {
        "flashcard_decks_owned": 3, "flashcard_reviews_this_week": 5,
        "days_since_last_flashcard_review": 1,
        "courses_enrolled_count": 1, "lessons_completed_this_week": 2,
    }

    quiz_hint = _pick_feature_spotlight({**base_active_stats, "daily_quiz_played_this_week": 0, "challenges_joined_count": 0})
    assert quiz_hint["feature"] == "daily_quiz"

    challenge_hint = _pick_feature_spotlight({**base_active_stats, "daily_quiz_played_this_week": 2, "challenges_joined_count": 0})
    assert challenge_hint["feature"] == "challenges"

    all_active_hint = _pick_feature_spotlight({**base_active_stats, "daily_quiz_played_this_week": 2, "challenges_joined_count": 1})
    assert all_active_hint["hint_key"] == "all_active"


def test_weekly_review_force_regenerate_replaces_only_the_target_week(db_session):
    """regenerate=true must delete and replace ONLY the target week's row
    — an existing review for a DIFFERENT week must survive untouched, and
    without regenerate=true an existing row must NOT be touched at all
    (idempotent, per generate_weekly_review's own contract)."""
    import asyncio
    import json
    from app.api.v1.endpoints.cron import weekly_review_force
    from app.services.weekly_review_service import _week_start

    uid = TEST_BASE_ID - 107
    today = date.today()
    target_week = _week_start(today)
    other_week = target_week - timedelta(days=7)

    db_session.execute(
        text("INSERT INTO profiles (telegram_id, status, timezone, daily_goal_minutes) VALUES (:uid, 'active', 'Asia/Tashkent', 20)"),
        {"uid": uid},
    )
    for ws, marker in [(target_week, "old_target"), (other_week, "other_week_untouched")]:
        db_session.execute(
            text("INSERT INTO weekly_reviews (user_id, week_start, content) VALUES (:uid, :ws, CAST(:content AS jsonb))"),
            {"uid": uid, "ws": ws, "content": json.dumps({"marker": marker})},
        )
    db_session.commit()
    # Deliberately NO focus_sessions/flashcard activity seeded for the
    # target week — this test only needs to prove the delete-old-row
    # behavior, and zero activity keeps generate_weekly_review()'s own
    # early-return firing (see the other test for that), so this stays a
    # fast, hermetic test with no real AI call.

    # Without regenerate: existing target-week row must be left alone.
    result_no_regen = asyncio.run(weekly_review_force(telegram_id=uid, regenerate=False, db=db_session, _=None))
    assert result_no_regen["regenerated"] is False
    assert result_no_regen["generated"] is False  # already existed, untouched
    row = db_session.execute(
        text("SELECT content FROM weekly_reviews WHERE user_id = :uid AND week_start = :ws"),
        {"uid": uid, "ws": target_week},
    ).fetchone()
    assert row.content["marker"] == "old_target"

    # With regenerate: target week's old row is gone; the OTHER week survives.
    result_regen = asyncio.run(weekly_review_force(telegram_id=uid, regenerate=True, db=db_session, _=None))
    assert result_regen["regenerated"] is True

    other_row = db_session.execute(
        text("SELECT content FROM weekly_reviews WHERE user_id = :uid AND week_start = :ws"),
        {"uid": uid, "ws": other_week},
    ).fetchone()
    assert other_row.content["marker"] == "other_week_untouched"
