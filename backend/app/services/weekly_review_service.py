"""
weekly_review_service.py — the free, cron-driven "personal adviser" (spec
Part 6, feature 2). Grounded entirely in the user's own data: focus-session
times/totals, streak state, flashcard accuracy this week, course/quiz
engagement. Never charges Tanga — see app/api/v1/endpoints/cron.py's
weekly-review-batch route, which is the only caller.

Timing (superseded the old telegram_id%7-staggered-across-the-week design):
every user gets their review on MONDAY, at THEIR OWN local 7am
(profiles.timezone, default Asia/Tashkent) — not a single shared UTC
instant. A user in Seoul and a user in Tashkent both see it appear at
7am their own time, on their own Monday, not both at whatever UTC hour
used to be hardcoded (found via a live report: a Korea-based user's Monday
review wasn't ready mid-afternoon their time because the batch was pinned
to 06:00 UTC = 15:00 KST).

A single fixed UTC cron trigger cannot hit "7am" correctly for every
timezone at once, so the cron caller (cron.py) ticks HOURLY and
run_staggered_batch's own SQL WHERE clause decides who's actually due —
the exact same idiom already used by streak_freeze_auto_apply/
streak_at_risk_push in cron.py — even though the user-visible behavior is
weekly, not hourly. The filter is "local Monday, local hour >= 7" (not
"== 7"): a missed hourly tick self-heals later the same Monday instead of
silently waiting a full week, and the UNIQUE(user_id, week_start)
constraint on weekly_reviews (checked in generate_weekly_review) makes
repeat candidates across those ticks a cheap no-op. Since most active
users share Asia/Tashkent, many become due in the same ~1h UTC window each
Monday; the existing max_users/LIMIT cap plus ">= 7" (not "== 7") already
throttles this naturally — an overflow past the per-tick cap simply rolls
into the next hourly tick that same Monday, still within the local-morning
window, rather than needing a separate day-of-week spread.

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
from app.services.user_time import user_local_date

logger = logging.getLogger(__name__)


def _week_start(today: date) -> date:
    """The Monday of the most recently COMPLETED Mon-Sun week as of `today`
    — NOT "this week so far". generate_weekly_review is now only ever
    called on the user's own local Monday (see run_staggered_batch), so a
    review generated the same morning a new week starts must summarize the
    week that just ENDED (yesterday, Sunday), never the few hours since
    midnight. Correct for any `today`, not just Monday — stable across the
    whole week, then jumps forward exactly once, at the next Monday."""
    this_monday = today - timedelta(days=today.weekday())
    return this_monday - timedelta(days=7)


def gather_user_stats(db: Session, user_id: int, week_start: date, today: date) -> dict:
    """Stats for the single Mon-Sun window [week_start, week_start+7) —
    every query below is bounded on BOTH ends. Missing the upper bound
    (found live: this used to be open-ended "since week_start", which
    silently kept accumulating into whatever week `today` actually falls
    in — harmless under the old same-week-review model, but wrong now that
    a review always looks BACK at an already-completed week that `today`
    is no longer part of)."""
    week_ago = week_start
    week_end = week_start + timedelta(days=7)  # exclusive
    prev_start = week_start - timedelta(days=7)
    week_start_ts = datetime.combine(week_start, datetime.min.time()).replace(tzinfo=UTC)
    week_end_ts = datetime.combine(week_end, datetime.min.time()).replace(tzinfo=UTC)

    focus_row = db.execute(
        text("""
            SELECT
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :week_ago AND session_date < :week_end), 0) AS this_week_minutes,
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :prev_start AND session_date < :week_ago), 0) AS prev_week_minutes,
                COALESCE(COUNT(DISTINCT session_date) FILTER (WHERE session_date >= :week_ago AND session_date < :week_end), 0) AS days_active
            FROM focus_sessions
            WHERE user_id = :uid AND session_date >= :prev_start AND session_date < :week_end
        """),
        {"uid": user_id, "week_ago": week_ago, "week_end": week_end, "prev_start": prev_start},
    ).fetchone()

    # Day-by-day minutes for the reviewed week — powers the mobile bar chart.
    day_rows = db.execute(
        text("""
            SELECT session_date, SUM(minutes) AS minutes
            FROM focus_sessions
            WHERE user_id = :uid AND session_date >= :week_ago AND session_date < :week_end
            GROUP BY session_date
        """),
        {"uid": user_id, "week_ago": week_ago, "week_end": week_end},
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
        for i in range(7) if (week_ago + timedelta(days=i)) < today
    ]

    profile_row = db.execute(
        text("SELECT streak_days, daily_goal_minutes, first_name FROM profiles WHERE telegram_id = :uid"),
        {"uid": user_id},
    ).fetchone()

    # Same source as the now-retired /api/focus/weekly-report screen's
    # week_xp — kept here so that card's one genuinely unique number
    # (XP earned this week, as opposed to lifetime total_xp) isn't lost.
    xp_row = db.execute(
        text("SELECT COALESCE(SUM(amount), 0) AS xp FROM xp_logs WHERE user_id = :uid AND created_at >= :week_start_ts AND created_at < :week_end_ts"),
        {"uid": user_id, "week_start_ts": week_start_ts, "week_end_ts": week_end_ts},
    ).fetchone()
    week_xp = int(xp_row.xp) if xp_row else 0

    review_row = db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE rating >= 3)         AS good_or_easy,
                COUNT(*) FILTER (WHERE rating IN (0, 1, 2))  AS again_or_hard,
                COUNT(DISTINCT deck_id)                       AS decks_studied
            FROM flashcard_reviews
            WHERE user_id = :uid AND reviewed_at >= :week_start_ts AND reviewed_at < :week_end_ts AND rating < 90
        """),
        {"uid": user_id, "week_start_ts": week_start_ts, "week_end_ts": week_end_ts},
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
            WHERE student_id = :uid AND is_completed = true
              AND completed_at >= :week_start_ts AND completed_at < :week_end_ts
        """),
        {"uid": user_id, "week_start_ts": week_start_ts, "week_end_ts": week_end_ts},
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
                WHERE telegram_id = :uid AND completed_at >= :week_start_ts AND completed_at < :week_end_ts
            """),
            {"uid": user_id, "week_start_ts": week_start_ts, "week_end_ts": week_end_ts},
        ).fetchone()
        quiz_attempts_this_week = int(quiz_row.n or 0) if quiz_row else 0
    except (OperationalError, ProgrammingError):
        db.rollback()

    return {
        "week_start":            week_start.isoformat(),
        "first_name":            profile_row.first_name if profile_row else "",
        "this_week_minutes":     int(focus_row.this_week_minutes) if focus_row else 0,
        "prev_week_minutes":     int(focus_row.prev_week_minutes) if focus_row else 0,
        "days_active":           int(focus_row.days_active) if focus_row else 0,
        "week_xp":               week_xp,
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


async def run_staggered_batch(db: Session, max_users: int = 500) -> dict:
    """Called hourly by the cron scheduler (cron.py ticks every hour; this
    function's own SQL WHERE clause decides who's actually due — see module
    docstring). A candidate is a user for whom it's currently MONDAY and
    LOCAL time is 7am or later — both evaluated per-row via
    profiles.timezone, defaulting to Asia/Tashkent for accounts that never
    confirmed one. No telegram_id stagger anymore — everyone's review lands
    on their own Monday morning, not spread across the week.

    EXTRACT(ISODOW ...) returns 1=Monday..7=Sunday, so "= 1" is Monday."""
    candidates = db.execute(
        text("""
            SELECT telegram_id, timezone FROM profiles
            WHERE status = 'active'
              AND EXTRACT(ISODOW FROM (NOW() AT TIME ZONE COALESCE(timezone, 'Asia/Tashkent'))) = 1
              AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(timezone, 'Asia/Tashkent'))) >= 7
            ORDER BY telegram_id
            LIMIT :max_users
        """),
        {"max_users": max_users},
    ).fetchall()

    generated = 0
    skipped = 0
    for row in candidates:
        try:
            local_today = user_local_date(row.timezone)
            ok = await generate_weekly_review(db, int(row.telegram_id), local_today)
            if ok:
                generated += 1
            else:
                skipped += 1
        except Exception:
            db.rollback()
            logger.error("Weekly review batch item failed for user_id=%s", row.telegram_id, exc_info=True)

    return {"candidates": len(candidates), "generated": generated, "skipped": skipped}
