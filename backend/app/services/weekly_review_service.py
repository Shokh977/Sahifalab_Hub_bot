"""
weekly_review_service.py — the free, cron-driven "personal adviser" (spec
Part 6, feature 2). Grounded entirely in the user's own data: focus-session
times/totals, streak state, flashcard accuracy this week, course/quiz
engagement. Never charges Tanga — see app/api/v1/endpoints/cron.py's
weekly-review-batch route, which is the only caller.

Staggering (spec: "Run it staggered across the week, not all at once, to
spread both API and DB load"): this is called once per day by the cron
scheduler, and only processes users whose telegram_id falls on today's slot
(telegram_id % 7 == today.weekday()), plus the UNIQUE(user_id, week_start)
constraint on weekly_reviews makes a re-run same-week idempotent — an
already-reviewed user is simply skipped.

v2 addition (user request): a deterministic "feature spotlight" — Python
decides which underused feature (flashcards first, then courses) to nudge
the user toward, with a concrete supporting fact; the LLM only phrases that
decision into natural, motivating Uzbek. It never "notices" the pattern
itself — an LLM asked to infer usage gaps from raw numbers is unreliable
and untestable in a way a plain if/elif chain isn't. The full raw stats
dict is stored alongside the LLM's narrative (weekly_reviews.content.stats)
so the mobile "advanced stats" display renders real, DB-sourced numbers,
never re-derived from LLM text.
"""
import logging
from datetime import date, datetime, timedelta, UTC

from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.services.ai.gemini_provider import get_provider
from app.services.ai.base import AiProviderError
from app.services.ai.usage import log_usage
from app.services.ai.prompts import weekly_review_v2

logger = logging.getLogger(__name__)


def _week_start(today: date) -> date:
    return today - timedelta(days=today.weekday())  # Monday


def gather_user_stats(db: Session, user_id: int, week_start: date, today: date) -> dict:
    week_ago = week_start
    prev_start = week_start - timedelta(days=7)
    week_start_ts = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=UTC)

    focus_row = db.execute(
        text("""
            SELECT
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :week_ago), 0) AS this_week_minutes,
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :prev_start AND session_date < :week_ago), 0) AS prev_week_minutes,
                COALESCE(COUNT(DISTINCT session_date) FILTER (WHERE session_date >= :week_ago), 0) AS days_active
            FROM focus_sessions
            WHERE user_id = :uid AND session_date >= :prev_start
        """),
        {"uid": user_id, "week_ago": week_ago, "prev_start": prev_start},
    ).fetchone()

    # Day-by-day minutes for the last 7 days — powers the mobile bar chart.
    day_rows = db.execute(
        text("""
            SELECT session_date, SUM(minutes) AS minutes
            FROM focus_sessions
            WHERE user_id = :uid AND session_date >= :week_ago
            GROUP BY session_date
        """),
        {"uid": user_id, "week_ago": week_ago},
    ).fetchall()
    by_date = {r.session_date: int(r.minutes) for r in day_rows}
    daily_goal_for_chart_row = db.execute(
        text("SELECT COALESCE(daily_goal_minutes, 20) AS g FROM profiles WHERE telegram_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    daily_goal_for_chart = int(daily_goal_for_chart_row.g) if daily_goal_for_chart_row else 20
    days = [
        {
            "date":     (week_ago + timedelta(days=i)).isoformat(),
            "minutes":  by_date.get(week_ago + timedelta(days=i), 0),
            "goal_met": by_date.get(week_ago + timedelta(days=i), 0) >= daily_goal_for_chart,
        }
        for i in range(7) if (week_ago + timedelta(days=i)) <= today
    ]

    profile_row = db.execute(
        text("SELECT streak_days, daily_goal_minutes, first_name FROM profiles WHERE telegram_id = :uid"),
        {"uid": user_id},
    ).fetchone()

    review_row = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE rating >= 3)         AS good_or_easy,
                COUNT(*) FILTER (WHERE rating IN (0, 1, 2))  AS again_or_hard,
                COUNT(DISTINCT deck_id)                       AS decks_studied
            FROM flashcard_reviews
            WHERE user_id = :uid AND reviewed_at >= :week_start_ts AND rating < 90
        """),
        {"uid": user_id, "week_start_ts": week_start_ts},
    ).fetchone()
    total_reviews = int(review_row.good_or_easy or 0) + int(review_row.again_or_hard or 0) if review_row else 0
    accuracy_pct = round(100 * int(review_row.good_or_easy or 0) / total_reviews) if total_reviews > 0 else None

    decks_owned_row = db.execute(
        text("SELECT COUNT(*) AS n FROM flashcard_decks WHERE user_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    decks_owned = int(decks_owned_row.n or 0) if decks_owned_row else 0

    last_review_row = db.execute(
        text("SELECT MAX(reviewed_at) AS last_at FROM flashcard_reviews WHERE user_id = :uid AND rating < 90"),
        {"uid": user_id},
    ).fetchone()
    days_since_last_review = None
    if last_review_row and last_review_row.last_at:
        days_since_last_review = max(0, (datetime.now(UTC) - last_review_row.last_at).days)

    # course_enrollments/lesson_progress use `student_id`, not `user_id` —
    # same telegram_id value, just a different column name on these tables.
    enrolled_row = db.execute(
        text("SELECT COUNT(*) AS n FROM course_enrollments WHERE student_id = :uid AND is_active = true"),
        {"uid": user_id},
    ).fetchone()
    courses_enrolled = int(enrolled_row.n or 0) if enrolled_row else 0

    lessons_row = db.execute(
        text("""
            SELECT COUNT(*) AS n FROM lesson_progress
            WHERE student_id = :uid AND is_completed = true AND completed_at >= :week_start_ts
        """),
        {"uid": user_id, "week_start_ts": week_start_ts},
    ).fetchone()
    lessons_completed_this_week = int(lessons_row.n or 0) if lessons_row else 0

    # user_quiz_completion is a tracked, migrated table — safe to query
    # directly. Defensive try/except anyway, matching this codebase's own
    # precedent (quizzes.py) for tables that might lag behind in some
    # environment.
    quiz_attempts_this_week = 0
    try:
        quiz_row = db.execute(
            text("""
                SELECT COUNT(*) AS n FROM user_quiz_completion
                WHERE telegram_id = :uid AND completed_at >= :week_start_ts
            """),
            {"uid": user_id, "week_start_ts": week_start_ts},
        ).fetchone()
        quiz_attempts_this_week = int(quiz_row.n or 0) if quiz_row else 0
    except (OperationalError, ProgrammingError):
        db.rollback()

    return {
        "first_name":            profile_row.first_name if profile_row else "",
        "this_week_minutes":     int(focus_row.this_week_minutes) if focus_row else 0,
        "prev_week_minutes":     int(focus_row.prev_week_minutes) if focus_row else 0,
        "days_active":           int(focus_row.days_active) if focus_row else 0,
        "days":                  days,
        "streak_days":           int(profile_row.streak_days or 0) if profile_row else 0,
        "daily_goal_minutes":    int(profile_row.daily_goal_minutes or 20) if profile_row else 20,
        "flashcard_reviews_this_week": total_reviews,
        "flashcard_accuracy_pct":      accuracy_pct,
        "flashcard_decks_studied":     int(review_row.decks_studied or 0) if review_row else 0,
        "flashcard_decks_owned":       decks_owned,
        "days_since_last_flashcard_review": days_since_last_review,
        "courses_enrolled_count":      courses_enrolled,
        "lessons_completed_this_week": lessons_completed_this_week,
        "quiz_attempts_this_week":     quiz_attempts_this_week,
    }


def _pick_feature_spotlight(stats: dict) -> dict:
    """Deterministic — the LLM only phrases this, it never decides it.
    Priority: flashcards (explicitly requested), then courses, then a
    positive fallback when everything's active."""
    if stats["flashcard_decks_owned"] == 0:
        return {
            "hint_key": "flashcards_never_tried",
            "feature":  "flashcards",
            "fact": (
                "Oraliqli takrorlash (spaced repetition) usuli — bir necha kunlik "
                "tanaffuslar bilan takrorlash — yodda saqlashni oddiy o'qishga "
                "qaraganda sezilarli darajada samaraliroq qiladi."
            ),
        }
    if stats["flashcard_reviews_this_week"] == 0:
        days_ago = stats["days_since_last_flashcard_review"]
        ago_text = f"{days_ago} kun oldin" if days_ago is not None else "ancha vaqt oldin"
        return {
            "hint_key": "flashcards_dormant",
            "feature":  "flashcards",
            "fact": (
                f"Sizda {stats['flashcard_decks_owned']} ta flashcard to'plami bor, "
                f"lekin so'nggi marta {ago_text} foydalangansiz. Muntazam takrorlash "
                "unutishning oldini oladi."
            ),
        }
    if stats["courses_enrolled_count"] == 0:
        return {
            "hint_key": "no_course",
            "feature":  "courses",
            "fact": "Kurslar orqali mavzuni boshidan oxirigacha tizimli, bosqichma-bosqich o'rganish mumkin.",
        }
    if stats["lessons_completed_this_week"] == 0:
        return {
            "hint_key": "course_stalled",
            "feature":  "courses",
            "fact": (
                f"{stats['courses_enrolled_count']} ta kursga yozilgansiz, lekin bu hafta "
                "birorta dars tugallanmadi."
            ),
        }
    return {
        "hint_key": "all_active",
        "feature":  None,
        "fact": "Flashcard va kurslardan barqaror foydalanyapsiz.",
    }


async def generate_weekly_review(db: Session, user_id: int, today: date) -> bool:
    """Generate and store one user's weekly review. Returns True if a review
    was generated (False if skipped — already exists for this week, or the
    user has no activity worth reviewing)."""
    week_start = _week_start(today)

    existing = db.execute(
        text("SELECT 1 FROM weekly_reviews WHERE user_id = :uid AND week_start = :ws"),
        {"uid": user_id, "ws": week_start},
    ).fetchone()
    if existing:
        return False

    stats = gather_user_stats(db, user_id, week_start, today)
    if stats["this_week_minutes"] == 0 and stats["flashcard_reviews_this_week"] == 0:
        return False  # nothing to review — don't spend a call on silence

    spotlight_hint = _pick_feature_spotlight(stats)

    provider = get_provider()
    user_prompt = weekly_review_v2.build_user_prompt(stats, spotlight_hint)

    try:
        response = await provider.generate_json(
            system_prompt=weekly_review_v2.SYSTEM_PROMPT,
            user_prompt=user_prompt,
            prompt_version=weekly_review_v2.VERSION,
            json_schema=weekly_review_v2.JSON_SCHEMA,
        )
    except AiProviderError as e:
        log_usage(
            db, user_id, feature="weekly_review", model="gemini-flash-lite-latest",
            prompt_version=weekly_review_v2.VERSION, outcome=e.outcome, error_detail=str(e),
        )
        logger.error("Weekly review generation failed for user_id=%s", user_id, exc_info=True)
        return False

    log_usage(
        db, user_id, feature="weekly_review", model=response.model,
        prompt_version=weekly_review_v2.VERSION, input_tokens=response.input_tokens,
        output_tokens=response.output_tokens, cost_usd=response.cost_usd,
        latency_ms=response.latency_ms, outcome=response.outcome,
    )

    if not response.data:
        return False

    try:
        import json
        content = {**response.data, "stats": stats, "feature_spotlight_key": spotlight_hint["feature"]}
        db.execute(
            text("""
                INSERT INTO weekly_reviews (user_id, week_start, content)
                VALUES (:uid, :ws, CAST(:content AS jsonb))
                ON CONFLICT (user_id, week_start) DO NOTHING
            """),
            {"uid": user_id, "ws": week_start, "content": json.dumps(content)},
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.error("Failed to store weekly review for user_id=%s", user_id, exc_info=True)
        return False

    return True


async def run_staggered_batch(db: Session, today: date, max_users: int = 500) -> dict:
    """Called once/day by the cron scheduler. Only processes users whose
    telegram_id lands on today's slot (spread across the ISO week)."""
    day_slot = today.weekday()  # 0=Monday .. 6=Sunday

    candidates = db.execute(
        text("""
            SELECT telegram_id FROM profiles
            WHERE status = 'active' AND MOD(telegram_id, 7) = :slot
            ORDER BY telegram_id
            LIMIT :max_users
        """),
        {"slot": day_slot, "max_users": max_users},
    ).fetchall()

    generated = 0
    skipped = 0
    for row in candidates:
        try:
            ok = await generate_weekly_review(db, int(row.telegram_id), today)
            if ok:
                generated += 1
            else:
                skipped += 1
        except Exception:
            db.rollback()
            logger.error("Weekly review batch item failed for user_id=%s", row.telegram_id, exc_info=True)

    return {"candidates": len(candidates), "generated": generated, "skipped": skipped}
