"""
test_weekly_review_pro.py — a free user's weekly review (Sahifalab Pro,
107_pro_orders): the basics stay, the advanced numbers are zeroed and the
AI narrative is dropped. Pure logic, no database.
"""
from app.api.v1.endpoints.ai import _free_week_progress


def test_free_week_progress_keeps_basics_and_hides_the_rest():
    progress = {
        "week_start": "2026-10-26",
        "stats": {
            "this_week_minutes": 120, "days_active": 3, "streak_days": 9, "days": [{"date": "2026-10-26", "minutes": 40}],
            "week_xp": 450, "flashcard_accuracy_pct": 82, "week_xp_rank": 4, "quiz_attempts_this_week": 2,
        },
        "recommendation": "AI matn", "study_tip": {"title": "x"}, "category_insight": {"title": "y"}, "ai": True,
    }
    out = _free_week_progress(progress)

    assert set(out) == {"week_start", "stats"}
    s = out["stats"]
    assert s["this_week_minutes"] == 120 and s["days_active"] == 3 and s["streak_days"] == 9
    assert s["days"] == progress["stats"]["days"]
    assert s["week_xp"] == 0 and s["flashcard_accuracy_pct"] == 0 and s["week_xp_rank"] == 0
    assert s["quiz_attempts_this_week"] == 0
