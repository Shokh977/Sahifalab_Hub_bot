"""
admin_feature_analytics.py — the admin "Xususiyatlar" tab: which features
people actually use, what they make with them, and who they are.

Mounted at /api/admin/feature-analytics. Admin-only (verify_admin, reused
from admin.py — same pattern as admin_ai_usage.py). Every handler is a plain
`def` so FastAPI runs it in the thread pool: these are the heaviest reads in
the API and must never sit on the event loop (2026-10-08 pool-exhaustion
outage, commit 6f88131).

GET /overview         — per-feature users/actions vs the previous period,
                        daily trend, DAU/WAU, feature depth & combos, and a
                        weekday × hour activity grid
GET /flashcards       — decks/cards by source (manual/AI/clone…) and theme,
                        card format, review quality, AI generation funnel,
                        public library, top decks and creators
GET /daily-quiz       — "5 Savol": participation, scores, categories,
                        hardest questions, play-time, streaks
GET /audience         — onboarding answers, inferred interests (from deck
                        themes), activity segments, geography — for knowing
                        the audience / ad targeting
GET /audience/export  — the same, one CSV row per user

Days are bucketed in Asia/Tashkent (fixed UTC+5, no DST) — most users are
there, and "today" must mean the same thing in SQL and in Python.

Each query runs in its own SAVEPOINT (_rows) and degrades to "no data" on
failure, so one missing table or column blanks one number, not the tab.
"""
import csv
import io
import json
import logging
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from itertools import combinations
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.v1.endpoints.admin import verify_admin
from app.models.admin_models import AdminUser
from app.services.feature_analytics import THEMES, classify_deck_theme, theme_label

logger = logging.getLogger(__name__)

router = APIRouter()

TZ_SQL = "Asia/Tashkent"
TASHKENT = timezone(timedelta(hours=5))

# Card-front script detection for classify_deck_theme(). Literal characters
# (not \u escapes) so the regex means the same under any
# standard_conforming_strings setting.
_SCRIPT_RANGES = {
    "arabic":   (0x0621, 0x064A),
    "hangul":   (0xAC00, 0xD7A3),
    "kana":     (0x3041, 0x30FF),
    "cjk":      (0x4E00, 0x9FFF),
    "cyrillic": (0x0400, 0x04FF),
}
_SCRIPT_FILTERS = ",\n".join(
    f"COUNT(*) FILTER (WHERE front_text ~ '[{chr(lo)}-{chr(hi)}]') AS {name}"
    for name, (lo, hi) in _SCRIPT_RANGES.items()
)

DECK_SOURCE_LABELS = {
    "manual":   "Qo'lda yaratilgan",
    "ai_text":  "AI — matndan",
    "ai_image": "AI — rasmdan",
    "ai":       "AI (eski, turi noma'lum)",
    "clone":    "Ommaviy to'plamdan nusxa",
    "course":   "Kurs to'plami",
    "official": "Rasmiy (admin)",
}

MOTIVATION_LABELS = {
    "career": "Karyera", "skill": "Ko'nikma", "self": "O'zini rivojlantirish", "exam": "Imtihon",
}
EXPERIENCE_LABELS = {
    "beginner": "Boshlang'ich", "intermediate": "O'rta", "advanced": "Yuqori",
}
SOURCE_LABELS = {
    "mobile": "Mobil ilova", "web": "Veb-sayt", "telegram_miniapp": "Telegram Mini App",
}


# ── Plumbing ──────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class _Window:
    days: int
    today: date
    start: date          # first day of the current period (inclusive)
    prev_start: date     # first day of the previous, equally long period
    start_ts: datetime
    prev_ts: datetime

    def day_list(self) -> list[date]:
        return [self.start + timedelta(days=i) for i in range(self.days)]


def _window(days: int) -> _Window:
    today = datetime.now(TASHKENT).date()
    start = today - timedelta(days=days - 1)
    prev_start = start - timedelta(days=days)

    def midnight(d: date) -> datetime:
        return datetime(d.year, d.month, d.day, tzinfo=TASHKENT)

    return _Window(days, today, start, prev_start, midnight(start), midnight(prev_start))


def _rows(db: Session, sql: str, params: Optional[dict] = None) -> list:
    try:
        with db.begin_nested():
            return db.execute(text(sql), params or {}).fetchall()
    except Exception:
        logger.warning("feature-analytics query failed: %s", " ".join(sql.split())[:160], exc_info=True)
        return []


def _one(db: Session, sql: str, params: Optional[dict] = None):
    rows = _rows(db, sql, params)
    return rows[0] if rows else None


def _has_column(db: Session, table: str, column: str) -> bool:
    return bool(_rows(db, """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t AND column_name = :c
    """, {"t": table, "c": column}))


def _deck_source_expr(has_source_col: bool, alias: str = "d") -> str:
    """Where a deck came from. Uses flashcard_decks.source (migration 102)
    when present and falls back to the same rules the migration backfilled
    with, so the numbers hold before the migration runs too."""
    a = alias
    derived = (
        f"CASE WHEN {a}.cloned_from_deck_id IS NOT NULL THEN 'clone' "
        f"WHEN {a}.icon = '🤖' THEN 'ai' "
        f"WHEN {a}.badge_type = 'official' OR {a}.id IN "
        f"(SELECT deck_id FROM deck_audit_log WHERE action = 'official_deck_created' AND deck_id IS NOT NULL) "
        f"THEN 'official' "
        f"WHEN {a}.course_id IS NOT NULL THEN 'course' ELSE 'manual' END"
    )
    return f"COALESCE({a}.source, {derived})" if has_source_col else derived


def _pct(part: float, whole: float) -> float:
    return round(part / whole * 100, 1) if whole else 0.0


def _delta(cur: float, prev: float) -> Optional[float]:
    """Percent change vs the previous period; None when there's no base."""
    return round((cur - prev) / prev * 100, 1) if prev else None


def _iso(v) -> Optional[str]:
    if isinstance(v, datetime):
        v = v.astimezone(TASHKENT) if v.tzinfo else v
        return v.isoformat(timespec="minutes")
    return v.isoformat() if v else None


def _at_or_after(value: Optional[datetime], ref: datetime) -> bool:
    """Python-side timestamp check that tolerates a naive column (read as
    UTC) — comparing naive with aware would raise and 500 the whole tab."""
    if value is None:
        return False
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value >= ref


def _tz_day(col: str) -> str:
    return f"({col} AT TIME ZONE '{TZ_SQL}')::date"


# ── Feature registry ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class _Feature:
    key: str
    label: str
    emoji: str
    unit: str        # what one "action" is, for the UI
    group: str
    source: str      # FROM clause
    uid: str
    ts: str
    where: str = "TRUE"


def _features(db: Session) -> list[_Feature]:
    timer_only = (
        "(fs.source IS NULL OR fs.source = 'focus_timer')"
        if _has_column(db, "focus_sessions", "source") else "TRUE"
    )
    src = _deck_source_expr(_has_column(db, "flashcard_decks", "source"))
    return [
        _Feature("focus_timer", "Fokus taymer", "⏱️", "sessiya", "study",
                 "focus_sessions fs", "fs.user_id", "fs.created_at", timer_only),
        _Feature("flashcard_study", "Kartalarni takrorlash", "🃏", "takrorlash", "flashcards",
                 "flashcard_reviews r", "r.user_id", "r.reviewed_at", "r.rating BETWEEN 1 AND 4"),
        _Feature("card_create", "Karta yaratish (qo'lda)", "✍️", "karta", "flashcards",
                 "flashcards c JOIN flashcard_decks d ON d.id = c.deck_id", "d.user_id", "c.created_at",
                 f"{src} IN ('manual', 'course')"),
        _Feature("ai_flashcards", "AI bilan karta yaratish", "✨", "generatsiya", "flashcards",
                 "ai_usage_log a", "a.user_id", "a.created_at",
                 "a.feature = 'flashcard_gen' AND a.outcome = 'success'"),
        _Feature("deck_clone", "Ommaviy to'plamdan nusxa", "📥", "nusxa", "flashcards",
                 "deck_clones dc", "dc.cloned_by", "dc.created_at"),
        _Feature("daily_quiz", "5 Savol", "❓", "o'yin", "quiz",
                 "daily_quiz_attempts qa", "qa.user_id", "qa.submitted_at", "qa.submitted_at IS NOT NULL"),
        _Feature("tests", "Testlar", "📝", "test", "quiz",
                 "user_quiz_completion uq", "uq.telegram_id", "uq.completed_at"),
        _Feature("lessons", "Kurs darslari", "🎬", "dars", "courses",
                 "lesson_progress lp", "lp.student_id", "lp.completed_at", "lp.is_completed"),
        _Feature("enrollments", "Kursga yozilish", "🎓", "yozilish", "courses",
                 "course_enrollments ce", "ce.student_id", "ce.created_at"),
        _Feature("books", "Kitob o'qish", "📚", "kitob", "content",
                 "book_read_progress bp", "bp.telegram_id", "bp.updated_at"),
        _Feature("planner", "Rejalashtiruvchi", "📋", "vazifa", "productivity",
                 "planner_tasks pt", "pt.user_id", "pt.created_at"),
        _Feature("challenges", "Musobaqalar", "🏆", "qo'shilish", "productivity",
                 "challenge_participants cp", "cp.user_id", "cp.joined_at"),
    ]


def _collect_events(db: Session, features: list[_Feature], ts_from: datetime) -> dict[str, list[tuple[int, date, int]]]:
    """feature key -> [(user_id, Tashkent day, actions)] since ts_from."""
    out: dict[str, list[tuple[int, date, int]]] = {}
    for f in features:
        rows = _rows(db, f"""
            SELECT {f.uid} AS uid, {_tz_day(f.ts)} AS day, COUNT(*) AS n
            FROM {f.source}
            WHERE {f.ts} >= :ts_from AND {f.uid} IS NOT NULL AND {f.where}
            GROUP BY 1, 2
        """, {"ts_from": ts_from})
        out[f.key] = [(int(r.uid), r.day, int(r.n)) for r in rows]
    return out


# ── GET /overview ─────────────────────────────────────────────────────────────

@router.get("/overview")
def feature_overview(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    w = _window(days)
    features = _features(db)
    events = _collect_events(db, features, w.prev_ts)
    day_list = w.day_list()

    active_cur: set[int] = set()
    active_prev: set[int] = set()
    active_by_day: dict[date, set[int]] = defaultdict(set)
    user_features: dict[int, set[str]] = defaultdict(set)
    feature_rows = []

    for f in features:
        cur_users: set[int] = set()
        prev_users: set[int] = set()
        cur_actions = prev_actions = 0
        daily_users: dict[date, set[int]] = defaultdict(set)
        daily_actions: dict[date, int] = defaultdict(int)
        for uid, day, n in events[f.key]:
            if day >= w.start:
                cur_users.add(uid)
                cur_actions += n
                daily_users[day].add(uid)
                daily_actions[day] += n
                active_by_day[day].add(uid)
                user_features[uid].add(f.key)
            elif day >= w.prev_start:
                prev_users.add(uid)
                prev_actions += n
        active_cur |= cur_users
        active_prev |= prev_users
        feature_rows.append({
            "key": f.key, "label": f.label, "emoji": f.emoji, "unit": f.unit, "group": f.group,
            "users": len(cur_users), "users_prev": len(prev_users),
            "users_delta": _delta(len(cur_users), len(prev_users)),
            "actions": cur_actions, "actions_prev": prev_actions,
            "actions_delta": _delta(cur_actions, prev_actions),
            "actions_per_user": round(cur_actions / len(cur_users), 1) if cur_users else 0,
            "daily": [{"date": d.isoformat(), "users": len(daily_users[d]), "actions": daily_actions[d]} for d in day_list],
        })

    for row in feature_rows:
        row["adoption_pct"] = _pct(row["users"], len(active_cur))
    feature_rows.sort(key=lambda r: (r["users"], r["actions"]), reverse=True)

    # Signups — profiles.created_at is the Supabase-era column; app_created_at
    # is stamped by the app's own auth. Either may be NULL on old rows.
    joined = "COALESCE(created_at, app_created_at)" if _has_column(db, "profiles", "created_at") else "app_created_at"
    signup_rows = _rows(db, f"""
        SELECT {_tz_day(joined)} AS day, COUNT(*) AS n FROM profiles
        WHERE {joined} >= :ts_from GROUP BY 1
    """, {"ts_from": w.prev_ts})
    signups = {r.day: int(r.n) for r in signup_rows}
    new_cur = sum(n for d, n in signups.items() if d >= w.start)
    new_prev = sum(n for d, n in signups.items() if w.prev_start <= d < w.start)

    totals_row = _one(db, """
        SELECT COUNT(*) AS registered,
               COUNT(*) FILTER (WHERE GREATEST(app_online_at, app_last_login, study_pulse_at) >= :ts_from) AS seen
        FROM profiles
    """, {"ts_from": w.start_ts})

    focus_where = (
        "AND (source IS NULL OR source = 'focus_timer')" if _has_column(db, "focus_sessions", "source") else ""
    )
    focus_row = _one(db, f"""
        SELECT COALESCE(SUM(minutes) FILTER (WHERE created_at >= :cur), 0) AS cur,
               COALESCE(SUM(minutes) FILTER (WHERE created_at <  :cur), 0) AS prev
        FROM focus_sessions WHERE created_at >= :prev {focus_where}
    """, {"cur": w.start_ts, "prev": w.prev_ts})

    dau_series = [len(active_by_day[d]) for d in day_list]
    dau_avg = round(sum(dau_series) / len(dau_series), 1) if dau_series else 0
    last7 = set().union(*(active_by_day[d] for d in day_list[-7:])) if day_list else set()

    depth = Counter(min(len(user_features[u]), 4) for u in active_cur)
    pair_counts: Counter = Counter()
    for keys in user_features.values():
        pair_counts.update(combinations(sorted(keys), 2))
    labels = {f.key: (f.label, f.emoji) for f in features}
    combos = [
        {"a": a, "b": b, "a_label": labels[a][0], "b_label": labels[b][0],
         "a_emoji": labels[a][1], "b_emoji": labels[b][1],
         "users": n, "pct": _pct(n, len(active_cur))}
        for (a, b), n in pair_counts.most_common(10)
    ]

    # Weekday × hour grid of all actions in the current period (Tashkent).
    heat = [[0] * 24 for _ in range(7)]
    for f in features:
        for r in _rows(db, f"""
            SELECT EXTRACT(ISODOW FROM ({f.ts} AT TIME ZONE '{TZ_SQL}'))::int AS dow,
                   EXTRACT(HOUR   FROM ({f.ts} AT TIME ZONE '{TZ_SQL}'))::int AS hr,
                   COUNT(*) AS n
            FROM {f.source}
            WHERE {f.ts} >= :ts_from AND {f.where}
            GROUP BY 1, 2
        """, {"ts_from": w.start_ts}):
            heat[int(r.dow) - 1][int(r.hr)] += int(r.n)

    return {
        "window": {"days": days, "start": w.start.isoformat(), "end": w.today.isoformat()},
        "totals": {
            "registered": int(totals_row.registered) if totals_row else 0,
            "seen_in_app": int(totals_row.seen) if totals_row else 0,
            "active_users": len(active_cur),
            "active_users_prev": len(active_prev),
            "active_users_delta": _delta(len(active_cur), len(active_prev)),
            "new_users": new_cur,
            "new_users_prev": new_prev,
            "new_users_delta": _delta(new_cur, new_prev),
            "dau_avg": dau_avg,
            "wau": len(last7),
            "stickiness_pct": _pct(dau_avg, len(active_cur)),
            "focus_minutes": int(focus_row.cur) if focus_row else 0,
            "focus_minutes_delta": _delta(int(focus_row.cur), int(focus_row.prev)) if focus_row else None,
        },
        "features": feature_rows,
        "daily": [{"date": d.isoformat(), "active_users": len(active_by_day[d]), "new_users": signups.get(d, 0)}
                  for d in day_list],
        "depth": [{"features": k, "users": depth.get(k, 0)} for k in (1, 2, 3, 4)],
        "combos": combos,
        "heatmap": heat,
    }


# ── GET /flashcards ───────────────────────────────────────────────────────────

def _deck_rows(db: Session, ts_from: datetime) -> tuple[bool, list]:
    """Every deck with its card stats, script counts, owner and the
    reviews it got since ts_from. One pass; the deck table is small."""
    has_src = _has_column(db, "flashcard_decks", "source")
    src = _deck_source_expr(has_src)
    rows = _rows(db, f"""
        SELECT d.id, d.user_id, d.title, d.description, d.category, d.is_public,
               d.moderation_status, d.created_at, d.clone_count, d.rating_avg, d.rating_count,
               {src} AS src, p.first_name, p.username,
               COALESCE(c.cards, 0) AS cards, COALESCE(c.img, 0) AS img,
               COALESCE(c.mastered, 0) AS mastered, COALESCE(c.new_cards, 0) AS new_cards,
               COALESCE(c.arabic, 0) AS arabic, COALESCE(c.hangul, 0) AS hangul,
               COALESCE(c.kana, 0) AS kana, COALESCE(c.cjk, 0) AS cjk,
               COALESCE(c.cyrillic, 0) AS cyrillic,
               COALESCE(r.reviews, 0) AS reviews, COALESCE(r.learners, 0) AS learners
        FROM flashcard_decks d
        LEFT JOIN profiles p ON p.telegram_id = d.user_id
        LEFT JOIN (
            SELECT deck_id, COUNT(*) AS cards,
                   COUNT(*) FILTER (WHERE front_image IS NOT NULL OR back_image IS NOT NULL) AS img,
                   COUNT(*) FILTER (WHERE status = 'mastered') AS mastered,
                   COUNT(*) FILTER (WHERE created_at >= :ts_from) AS new_cards,
                   {_SCRIPT_FILTERS}
            FROM flashcards GROUP BY deck_id
        ) c ON c.deck_id = d.id
        LEFT JOIN (
            SELECT deck_id, COUNT(*) AS reviews, COUNT(DISTINCT user_id) AS learners
            FROM flashcard_reviews
            WHERE rating BETWEEN 1 AND 4 AND reviewed_at >= :ts_from
            GROUP BY deck_id
        ) r ON r.deck_id = d.id
    """, {"ts_from": ts_from})
    return has_src, rows


def _theme_of(r) -> str:
    return classify_deck_theme(
        r.title, r.description, r.category,
        {k: int(getattr(r, k)) for k in _SCRIPT_RANGES}, int(r.cards),
    )


def _owner(r) -> dict:
    return {"id": int(r.user_id), "name": r.first_name or (f"@{r.username}" if r.username else str(r.user_id))}


_SIZE_BUCKETS = [(1, 10, "1–10"), (11, 25, "11–25"), (26, 50, "26–50"), (51, 100, "51–100"), (101, 10**9, "100+")]


@router.get("/flashcards")
def flashcard_analytics(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    w = _window(days)
    p = {"cur": w.start_ts, "prev": w.prev_ts}
    has_src, decks = _deck_rows(db, w.start_ts)

    # ── per-deck aggregation (themes, sources, sizes, creators) ──
    themes: dict[str, dict] = {}
    sources: dict[str, dict] = {}
    creators: dict[int, dict] = {}
    size_counts: Counter = Counter()
    published = 0
    for r in decks:
        theme = _theme_of(r)
        cards, new_cards, reviews = int(r.cards), int(r.new_cards), int(r.reviews)
        is_new = _at_or_after(r.created_at, w.start_ts)

        t = themes.setdefault(theme, {"decks": 0, "cards": 0, "owners": set(), "new_decks": 0,
                                      "new_cards": 0, "reviews": 0, "ai_decks": 0})
        t["decks"] += 1
        t["cards"] += cards
        t["owners"].add(int(r.user_id))
        t["new_decks"] += is_new
        t["new_cards"] += new_cards
        t["reviews"] += reviews
        t["ai_decks"] += r.src.startswith("ai")

        s = sources.setdefault(r.src, {"decks": 0, "cards": 0, "owners": set(), "new_decks": 0, "new_cards": 0, "reviews": 0})
        s["decks"] += 1
        s["cards"] += cards
        s["owners"].add(int(r.user_id))
        s["new_decks"] += is_new
        s["new_cards"] += new_cards
        s["reviews"] += reviews

        if r.src != "official":
            c = creators.setdefault(int(r.user_id), {**_owner(r), "decks": 0, "cards": 0, "ai_decks": 0,
                                                      "cloned": 0, "reviews": 0, "themes": Counter()})
            c["decks"] += 1
            c["cards"] += cards
            c["ai_decks"] += r.src.startswith("ai")
            c["cloned"] += r.src == "clone"
            c["reviews"] += reviews
            c["themes"][theme] += max(cards, 1)

        for lo, hi, label in _SIZE_BUCKETS:
            if lo <= cards <= hi:
                size_counts[label] += 1
        published += bool(r.is_public)

    theme_rows = sorted(
        ({"key": k, "label": theme_label(k)[0], "emoji": theme_label(k)[1], "decks": v["decks"],
          "cards": v["cards"], "users": len(v["owners"]), "new_decks": v["new_decks"],
          "new_cards": v["new_cards"], "reviews": v["reviews"], "ai_decks": v["ai_decks"]}
         for k, v in themes.items()),
        key=lambda x: (x["cards"], x["decks"]), reverse=True,
    )
    source_rows = sorted(
        ({"key": k, "label": DECK_SOURCE_LABELS.get(k, k), "decks": v["decks"], "cards": v["cards"],
          "users": len(v["owners"]), "new_decks": v["new_decks"], "new_cards": v["new_cards"],
          "reviews": v["reviews"]} for k, v in sources.items()),
        key=lambda x: x["decks"], reverse=True,
    )
    top_creators = sorted(creators.values(), key=lambda c: (c["cards"], c["decks"]), reverse=True)[:10]
    for c in top_creators:
        c["top_themes"] = [theme_label(k)[0] for k, _ in c.pop("themes").most_common(2)]
    top_decks = [
        {"id": int(r.id), "title": r.title, "owner": _owner(r), "theme": theme_label(_theme_of(r))[0],
         "source": DECK_SOURCE_LABELS.get(r.src, r.src), "cards": int(r.cards),
         "reviews": int(r.reviews), "learners": int(r.learners), "is_public": bool(r.is_public)}
        for r in sorted(decks, key=lambda r: int(r.reviews), reverse=True)[:10] if int(r.reviews) > 0
    ]
    top_public = [
        {"id": int(r.id), "title": r.title, "owner": _owner(r), "theme": theme_label(_theme_of(r))[0],
         "cards": int(r.cards), "clones": int(r.clone_count or 0),
         "rating": round(float(r.rating_avg or 0), 2), "ratings": int(r.rating_count or 0)}
        for r in sorted((d for d in decks if d.is_public and d.moderation_status == "approved"),
                        key=lambda r: int(r.clone_count or 0), reverse=True)[:8]
    ]

    # ── period KPIs vs previous period ──
    rev = _one(db, """
        SELECT COUNT(*) FILTER (WHERE reviewed_at >= :cur) AS cur,
               COUNT(*) FILTER (WHERE reviewed_at <  :cur) AS prev,
               COUNT(DISTINCT user_id) FILTER (WHERE reviewed_at >= :cur) AS users_cur,
               COUNT(DISTINCT user_id) FILTER (WHERE reviewed_at <  :cur) AS users_prev
        FROM flashcard_reviews WHERE rating BETWEEN 1 AND 4 AND reviewed_at >= :prev
    """, p)
    new_decks = _one(db, """
        SELECT COUNT(*) FILTER (WHERE created_at >= :cur) AS cur,
               COUNT(*) FILTER (WHERE created_at <  :cur) AS prev,
               COUNT(DISTINCT user_id) FILTER (WHERE created_at >= :cur) AS creators_cur
        FROM flashcard_decks WHERE created_at >= :prev
    """, p)
    new_cards = _one(db, """
        SELECT COUNT(*) FILTER (WHERE created_at >= :cur) AS cur,
               COUNT(*) FILTER (WHERE created_at <  :cur) AS prev
        FROM flashcards WHERE created_at >= :prev
    """, p)
    # rating = 98 is the once-per-user-per-day "session completed" sentinel
    # flashcards.py::complete_session writes — i.e. user-days with a session.
    sessions = _one(db, """
        SELECT COUNT(*) FILTER (WHERE reviewed_at >= :cur) AS cur,
               COUNT(*) FILTER (WHERE reviewed_at <  :cur) AS prev
        FROM flashcard_reviews WHERE rating = 98 AND reviewed_at >= :prev
    """, p)

    ratings = {int(r.rating): {"count": int(r.n), "avg_ms": int(r.avg_ms or 0)} for r in _rows(db, """
        SELECT rating, COUNT(*) AS n,
               AVG(time_spent_ms) FILTER (WHERE time_spent_ms BETWEEN 300 AND 300000) AS avg_ms
        FROM flashcard_reviews WHERE rating BETWEEN 1 AND 4 AND reviewed_at >= :cur
        GROUP BY rating
    """, p)}
    total_ratings = sum(v["count"] for v in ratings.values())
    timed = [(v["avg_ms"], v["count"]) for v in ratings.values() if v["avg_ms"]]
    avg_ms = round(sum(a * n for a, n in timed) / sum(n for _, n in timed)) if timed else 0

    status_rows = {r.status or "new": int(r.n) for r in _rows(db, "SELECT status, COUNT(*) AS n FROM flashcards GROUP BY status")}
    fmt = _one(db, """
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE front_image IS NOT NULL OR back_image IS NOT NULL) AS with_image,
               COUNT(*) FILTER (WHERE char_length(front_text) <= 25) AS word,
               COUNT(*) FILTER (WHERE char_length(front_text) BETWEEN 26 AND 90) AS question,
               COUNT(*) FILTER (WHERE char_length(front_text) > 90) AS long_text,
               COALESCE(AVG(char_length(back_text)), 0) AS avg_back_len
        FROM flashcards
    """)

    # ── AI generation funnel ──
    ai = _one(db, """
        SELECT COUNT(*) AS requests,
               COUNT(*) FILTER (WHERE outcome = 'success') AS ok,
               COUNT(*) FILTER (WHERE outcome <> 'success') AS failed,
               COUNT(*) FILTER (WHERE cache_hit) AS cache_hits,
               COUNT(DISTINCT user_id) AS users,
               COALESCE(SUM(cost_usd), 0) AS cost
        FROM ai_usage_log WHERE feature = 'flashcard_gen' AND created_at >= :cur
    """, p)
    ai_tanga = _one(db, """
        SELECT COUNT(*) AS paid, COALESCE(SUM(-delta), 0) AS spent
        FROM tanga_transactions
        WHERE reason = 'ai_flashcard_gen' AND delta < 0 AND created_at >= :cur
    """, p)
    ai_saved = [r for r in decks if r.src.startswith("ai") and _at_or_after(r.created_at, w.start_ts)]
    ai_ok = int(ai.ok) if ai else 0

    # ── public library activity ──
    lib = _one(db, """
        SELECT (SELECT COUNT(*) FROM deck_clones WHERE created_at >= :cur) AS clones,
               (SELECT COUNT(DISTINCT cloned_by) FROM deck_clones WHERE created_at >= :cur) AS cloners,
               (SELECT COUNT(*) FROM deck_ratings WHERE created_at >= :cur) AS ratings,
               (SELECT AVG(rating) FROM deck_ratings WHERE created_at >= :cur) AS avg_rating,
               (SELECT COUNT(*) FROM flashcard_decks WHERE published_at >= :cur) AS published_new
    """, p)

    # ── daily trend ──
    def by_day(sql: str) -> dict[date, int]:
        return {r.day: int(r.n) for r in _rows(db, sql, p)}

    d_reviews = by_day(f"SELECT {_tz_day('reviewed_at')} AS day, COUNT(*) AS n FROM flashcard_reviews "
                       f"WHERE rating BETWEEN 1 AND 4 AND reviewed_at >= :cur GROUP BY 1")
    d_reviewers = by_day(f"SELECT {_tz_day('reviewed_at')} AS day, COUNT(DISTINCT user_id) AS n FROM flashcard_reviews "
                         f"WHERE rating BETWEEN 1 AND 4 AND reviewed_at >= :cur GROUP BY 1")
    d_cards = by_day(f"SELECT {_tz_day('created_at')} AS day, COUNT(*) AS n FROM flashcards "
                     f"WHERE created_at >= :cur GROUP BY 1")
    d_ai = by_day(f"SELECT {_tz_day('created_at')} AS day, COUNT(*) AS n FROM ai_usage_log "
                  f"WHERE feature = 'flashcard_gen' AND outcome = 'success' AND created_at >= :cur GROUP BY 1")

    def kpi(row, cur="cur", prev="prev") -> dict:
        c, pv = (int(getattr(row, cur) or 0), int(getattr(row, prev) or 0)) if row else (0, 0)
        return {"value": c, "prev": pv, "delta": _delta(c, pv)}

    return {
        "window": {"days": days, "start": w.start.isoformat(), "end": w.today.isoformat()},
        "source_tracking": has_src,
        "totals": {
            "decks": len(decks),
            "cards": sum(int(r.cards) for r in decks),
            "owners": len({int(r.user_id) for r in decks}),
            "public_decks": published,
            "mastered_cards": sum(int(r.mastered) for r in decks),
            "avg_cards_per_deck": round(sum(int(r.cards) for r in decks) / len(decks), 1) if decks else 0,
        },
        "period": {
            "reviews": kpi(rev),
            "reviewers": kpi(rev, "users_cur", "users_prev"),
            "new_decks": kpi(new_decks),
            "new_cards": kpi(new_cards),
            "creators": int(new_decks.creators_cur) if new_decks else 0,
            "sessions": kpi(sessions),
            "avg_seconds_per_card": round(avg_ms / 1000, 1),
            "recall_pct": _pct(sum(ratings.get(k, {}).get("count", 0) for k in (3, 4)), total_ratings),
        },
        "ratings": [{"rating": k, "count": ratings.get(k, {}).get("count", 0),
                     "pct": _pct(ratings.get(k, {}).get("count", 0), total_ratings)} for k in (1, 2, 3, 4)],
        "card_status": [{"status": s, "count": status_rows.get(s, 0)} for s in ("new", "learning", "reviewing", "mastered")],
        "card_format": {
            "total": int(fmt.total) if fmt else 0,
            "with_image": int(fmt.with_image) if fmt else 0,
            "word": int(fmt.word) if fmt else 0,
            "question": int(fmt.question) if fmt else 0,
            "long_text": int(fmt.long_text) if fmt else 0,
            "avg_back_len": round(float(fmt.avg_back_len), 1) if fmt else 0,
        },
        "deck_sizes": [{"bucket": label, "decks": size_counts.get(label, 0)} for _, _, label in _SIZE_BUCKETS],
        "sources": source_rows,
        "themes": theme_rows,
        "ai": {
            "requests": int(ai.requests) if ai else 0,
            "succeeded": ai_ok,
            "failed": int(ai.failed) if ai else 0,
            "cache_hits": int(ai.cache_hits) if ai else 0,
            "users": int(ai.users) if ai else 0,
            "cost_usd": round(float(ai.cost), 4) if ai else 0.0,
            "paid_generations": int(ai_tanga.paid) if ai_tanga else 0,
            "tanga_spent": int(ai_tanga.spent) if ai_tanga else 0,
            "saved_decks": len(ai_saved),
            "saved_cards": sum(int(r.cards) for r in ai_saved),
            "saved_from_text": sum(r.src == "ai_text" for r in ai_saved),
            "saved_from_image": sum(r.src == "ai_image" for r in ai_saved),
            "save_rate_pct": _pct(len(ai_saved), ai_ok),
        },
        "library": {
            "published_total": published,
            "published_new": int(lib.published_new) if lib else 0,
            "clones": int(lib.clones) if lib else 0,
            "cloners": int(lib.cloners) if lib else 0,
            "ratings": int(lib.ratings) if lib else 0,
            "avg_rating": round(float(lib.avg_rating), 2) if lib and lib.avg_rating is not None else None,
            "top": top_public,
        },
        "top_decks": top_decks,
        "top_creators": top_creators,
        "daily": [{"date": d.isoformat(), "reviews": d_reviews.get(d, 0), "reviewers": d_reviewers.get(d, 0),
                   "new_cards": d_cards.get(d, 0), "ai_generations": d_ai.get(d, 0)} for d in w.day_list()],
    }


# ── GET /daily-quiz ───────────────────────────────────────────────────────────

def _quiz_category_labels(db: Session) -> dict[str, str]:
    try:
        from app.services.category_config import get_categories
        with db.begin_nested():  # a failed read must not abort the tab's transaction
            return {c["key"]: c["label"] for c in get_categories(db)}
    except Exception:
        logger.warning("daily quiz category labels unavailable", exc_info=True)
        return {}


@router.get("/daily-quiz")
def daily_quiz_analytics(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    w = _window(days)
    p = {"cur": w.start_ts, "prev": w.prev_ts, "start": w.start, "today": w.today}
    labels = _quiz_category_labels(db)
    # Foreground-only play time (migration 103) where the client sent it;
    # rounds without it fall back to the server clock in avg_ms below.
    active_expr = (
        "AVG(active_ms) FILTER (WHERE delivered_at >= :cur AND submitted_at IS NOT NULL AND active_ms IS NOT NULL)"
        if _has_column(db, "daily_quiz_attempts", "active_ms") else "NULL::numeric"
    )
    active_n_expr = (
        "COUNT(*) FILTER (WHERE delivered_at >= :cur AND submitted_at IS NOT NULL AND active_ms IS NOT NULL)"
        if _has_column(db, "daily_quiz_attempts", "active_ms") else "0"
    )

    totals = _one(db, f"""
        SELECT COUNT(*) FILTER (WHERE delivered_at >= :cur) AS started,
               COUNT(*) FILTER (WHERE delivered_at >= :cur AND submitted_at IS NOT NULL) AS finished,
               COUNT(*) FILTER (WHERE delivered_at <  :cur AND submitted_at IS NOT NULL) AS finished_prev,
               COUNT(DISTINCT user_id) FILTER (WHERE delivered_at >= :cur AND submitted_at IS NOT NULL) AS players,
               COUNT(DISTINCT user_id) FILTER (WHERE delivered_at <  :cur AND submitted_at IS NOT NULL) AS players_prev,
               AVG(correct_count) FILTER (WHERE delivered_at >= :cur AND submitted_at IS NOT NULL) AS avg_score,
               AVG(elapsed_ms) FILTER (WHERE delivered_at >= :cur AND submitted_at IS NOT NULL AND elapsed_ms > 0) AS avg_ms,
               {active_expr} AS avg_active_ms,
               {active_n_expr} AS active_samples,
               COUNT(*) FILTER (WHERE delivered_at >= :cur AND correct_count >= 5) AS perfect,
               COALESCE(SUM(tanga_awarded) FILTER (WHERE delivered_at >= :cur), 0) AS tanga
        FROM daily_quiz_attempts WHERE delivered_at >= :prev
    """, p)
    finished = int(totals.finished) if totals else 0

    score_dist = {int(r.score): int(r.n) for r in _rows(db, """
        SELECT correct_count AS score, COUNT(*) AS n FROM daily_quiz_attempts
        WHERE delivered_at >= :cur AND submitted_at IS NOT NULL AND correct_count IS NOT NULL
        GROUP BY 1
    """, p)}

    per_day = _rows(db, """
        SELECT q.id, q.quiz_number, q.publish_date, q.theme, q.sub_topic, q.status,
               COUNT(a.id) AS started,
               COUNT(a.id) FILTER (WHERE a.submitted_at IS NOT NULL) AS finished,
               AVG(a.correct_count) FILTER (WHERE a.submitted_at IS NOT NULL) AS avg_score
        FROM daily_quizzes q
        LEFT JOIN daily_quiz_attempts a ON a.quiz_id = q.id
        WHERE q.publish_date BETWEEN :start AND :today
        GROUP BY q.id
        ORDER BY q.publish_date
    """, p)
    days_out = [{
        "date": _iso(r.publish_date), "quiz_number": r.quiz_number, "theme": r.theme,
        "theme_label": labels.get(r.theme, r.theme), "sub_topic": r.sub_topic, "status": r.status,
        "started": int(r.started), "finished": int(r.finished),
        "avg_score": round(float(r.avg_score), 2) if r.avg_score is not None else None,
    } for r in per_day]

    cats: dict[str, dict] = {}
    for d in days_out:
        c = cats.setdefault(d["theme"], {"key": d["theme"], "label": d["theme_label"], "days": 0,
                                         "finished": 0, "score_sum": 0.0})
        c["days"] += 1
        c["finished"] += d["finished"]
        c["score_sum"] += (d["avg_score"] or 0) * d["finished"]
    categories = sorted(
        ({"key": c["key"], "label": c["label"], "days": c["days"],
          "players_per_day": round(c["finished"] / c["days"], 1) if c["days"] else 0,
          "avg_score": round(c["score_sum"] / c["finished"], 2) if c["finished"] else None}
         for c in cats.values()),
        key=lambda c: c["players_per_day"], reverse=True,
    )

    play_days = [int(r.n) for r in _rows(db, """
        SELECT COUNT(*) AS n FROM daily_quiz_attempts
        WHERE delivered_at >= :cur AND submitted_at IS NOT NULL GROUP BY user_id
    """, p)]
    loyalty_buckets = [(1, 1, "1 kun"), (2, 3, "2–3 kun"), (4, 7, "4–7 kun"), (8, 14, "8–14 kun"), (15, 10**6, "15+ kun")]
    loyalty = [{"bucket": label, "users": sum(lo <= n <= hi for n in play_days)} for lo, hi, label in loyalty_buckets]

    streak_rows = _rows(db, """
        SELECT quiz_streak_days AS s FROM profiles
        WHERE quiz_streak_days > 0 AND quiz_last_played_date >= CAST(:today AS date) - 1
    """, p)
    streak_buckets = [(1, 1, "1"), (2, 6, "2–6"), (7, 13, "7–13"), (14, 29, "14–29"), (30, 10**6, "30+")]
    streaks = [{"bucket": label, "users": sum(lo <= int(r.s) <= hi for r in streak_rows)}
               for lo, hi, label in streak_buckets]

    hours = [0] * 24
    for r in _rows(db, f"""
        SELECT EXTRACT(HOUR FROM (submitted_at AT TIME ZONE '{TZ_SQL}'))::int AS hr, COUNT(*) AS n
        FROM daily_quiz_attempts WHERE submitted_at >= :cur GROUP BY 1
    """, p):
        hours[int(r.hr)] = int(r.n)

    hardest = [{
        "question": r.question_text, "date": _iso(r.publish_date), "theme_label": labels.get(r.theme, r.theme),
        "answers": int(r.n), "correct_pct": _pct(int(r.correct), int(r.n)),
    } for r in _rows(db, """
        WITH graded AS (
            -- CASE, not AND: Postgres does not promise to short-circuit, and a
            -- non-numeric selected_index must never reach the int cast.
            SELECT t.quiz_id, q.id AS question_id, q.question_text,
                   CASE WHEN (ans->>'selected_index') ~ '^[0-9]+$'
                        THEN ((ans->>'selected_index')::int = q.correct_index) ELSE FALSE END AS is_correct
            FROM daily_quiz_attempts t
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE WHEN jsonb_typeof(t.answers) = 'array' THEN t.answers ELSE '[]'::jsonb END) AS ans
            JOIN daily_quiz_questions q ON q.id::text = ans->>'question_id'
            WHERE t.submitted_at >= :cur AND NOT q.voided
        )
        SELECT g.question_id, g.question_text, dq.publish_date, dq.theme,
               COUNT(*) AS n, COUNT(*) FILTER (WHERE g.is_correct) AS correct
        FROM graded g JOIN daily_quizzes dq ON dq.id = g.quiz_id
        GROUP BY g.question_id, g.question_text, dq.publish_date, dq.theme
        HAVING COUNT(*) >= 3
        ORDER BY COUNT(*) FILTER (WHERE g.is_correct)::float / COUNT(*) ASC
        LIMIT 8
    """, p)]

    reports = [{"reason": r.reason, "count": int(r.n)} for r in _rows(db, """
        SELECT reason, COUNT(*) AS n FROM daily_quiz_reports WHERE created_at >= :cur
        GROUP BY reason ORDER BY n DESC LIMIT 8
    """, p)]

    started = int(totals.started) if totals else 0
    players = int(totals.players) if totals else 0
    players_prev = int(totals.players_prev) if totals else 0
    return {
        "window": {"days": days, "start": w.start.isoformat(), "end": w.today.isoformat()},
        "totals": {
            "quizzes": len(days_out),
            "started": started,
            "finished": finished,
            "finished_prev": int(totals.finished_prev) if totals else 0,
            "finished_delta": _delta(finished, int(totals.finished_prev) if totals else 0),
            "completion_pct": _pct(finished, started),
            "players": players,
            "players_prev": players_prev,
            "players_delta": _delta(players, players_prev),
            "avg_score": round(float(totals.avg_score), 2) if totals and totals.avg_score is not None else None,
            # Server clock (delivery → submit). Before Phase 0 delivery was
            # triggered by opening Home, so older rounds overstate it.
            "avg_seconds": round(float(totals.avg_ms) / 1000, 1) if totals and totals.avg_ms is not None else None,
            # Foreground-only time, from rounds whose client reports it.
            "avg_active_seconds": (round(float(totals.avg_active_ms) / 1000, 1)
                                   if totals and totals.avg_active_ms is not None else None),
            "active_samples": int(totals.active_samples or 0) if totals else 0,
            "perfect_pct": _pct(int(totals.perfect) if totals else 0, finished),
            "tanga_awarded": int(totals.tanga) if totals else 0,
            "avg_days_per_player": round(sum(play_days) / len(play_days), 1) if play_days else 0,
            "returning_pct": _pct(sum(n >= 2 for n in play_days), len(play_days)),
        },
        "score_distribution": [{"score": s, "count": score_dist.get(s, 0)} for s in range(0, 6)],
        "days": days_out,
        "categories": categories,
        "loyalty": loyalty,
        "streaks": streaks,
        "hours": hours,
        "hardest": hardest,
        "reports": reports,
    }


# ── GET /audience (+ CSV export) ──────────────────────────────────────────────

def _segment(active_days: int, seen_recently: bool, days: int) -> str:
    if active_days >= max(2, math.ceil(days * 0.5)):
        return "power"
    if active_days >= max(2, math.ceil(days * 0.2)):
        return "regular"
    if active_days >= 1:
        return "casual"
    return "seen_only" if seen_recently else "dormant"


SEGMENT_LABELS = {
    "power":     "Juda faol",
    "regular":   "Muntazam",
    "casual":    "Vaqti-vaqti bilan",
    "seen_only": "Ilovani ochadi, lekin hech narsa qilmaydi",
    "dormant":   "Uxlab qolgan",
}


def _audience(db: Session, days: int) -> dict:
    """Per-user records + the lookups needed to aggregate them. Shared by
    /audience (aggregates) and /audience/export (rows)."""
    w = _window(days)
    has_created = _has_column(db, "profiles", "created_at")
    joined = "COALESCE(p.created_at, p.app_created_at)" if has_created else "p.app_created_at"
    profiles = _rows(db, f"""
        SELECT p.telegram_id, p.first_name, p.username, p.role, p.registered_via, p.timezone,
               p.location_city, p.daily_goal_minutes, p.level, p.total_xp, p.streak_days,
               p.quiz_streak_days, p.user_settings, {joined} AS joined,
               GREATEST(p.app_online_at, p.app_last_login, p.study_pulse_at) AS last_seen
        FROM profiles p
    """)
    categories = {int(r.id): (r.name, r.icon) for r in _rows(db, "SELECT id, name, icon FROM categories")}

    features = _features(db)
    events = _collect_events(db, features, w.start_ts)
    user_days: dict[int, set[date]] = defaultdict(set)
    user_features: dict[int, Counter] = defaultdict(Counter)
    for f in features:
        for uid, day, n in events[f.key]:
            user_days[uid].add(day)
            user_features[uid][f.key] += n

    _, decks = _deck_rows(db, w.start_ts)
    deck_theme = {int(r.id): _theme_of(r) for r in decks}
    owner_themes: dict[int, Counter] = defaultdict(Counter)
    owned: dict[int, dict] = defaultdict(lambda: {"decks": 0, "cards": 0})
    for r in decks:
        if r.src == "official":
            continue
        owner_themes[int(r.user_id)][deck_theme[int(r.id)]] += max(int(r.cards), 1)
        owned[int(r.user_id)]["decks"] += 1
        owned[int(r.user_id)]["cards"] += int(r.cards)
    learner_themes: dict[int, Counter] = defaultdict(Counter)
    for r in _rows(db, """
        SELECT user_id, deck_id, COUNT(*) AS n FROM flashcard_reviews
        WHERE rating BETWEEN 1 AND 4 AND reviewed_at >= :ts_from GROUP BY 1, 2
    """, {"ts_from": w.start_ts}):
        theme = deck_theme.get(int(r.deck_id))
        if theme:
            learner_themes[int(r.user_id)][theme] += int(r.n)

    users = []
    for p in profiles:
        uid = int(p.telegram_id)
        settings = p.user_settings
        if isinstance(settings, str):
            try:
                settings = json.loads(settings)
            except ValueError:
                settings = None
        if not isinstance(settings, dict):
            settings = {}
        interest_ids = settings.get("interests") or []
        interests = []
        for cid in interest_ids if isinstance(interest_ids, list) else []:
            try:
                name = categories.get(int(cid))
            except (TypeError, ValueError):
                name = None
            if name:
                interests.append(name[0])
        themes = owner_themes[uid] + learner_themes[uid]
        seen = _at_or_after(p.last_seen, w.start_ts)
        users.append({
            "id": uid,
            "name": p.first_name,
            "username": p.username,
            "role": p.role or "student",
            "registered_via": p.registered_via or "unknown",
            "timezone": p.timezone,
            "city": p.location_city,
            "daily_goal": p.daily_goal_minutes,
            "level": p.level,
            "xp": p.total_xp,
            "streak": p.streak_days,
            "quiz_streak": p.quiz_streak_days,
            "joined": p.joined,
            "last_seen": p.last_seen,
            "is_new": _at_or_after(p.joined, w.start_ts),
            "seen": seen,
            "experience": settings.get("experience_level"),
            "motivation": settings.get("learning_motivation"),
            "interests": interests,
            "themes": [k for k, _ in themes.most_common(3)],
            "owned_themes": set(owner_themes[uid]),
            "learned_themes": set(learner_themes[uid]),
            "features": user_features[uid],
            "active_days": len(user_days[uid]),
            "segment": _segment(len(user_days[uid]), seen, days),
            "decks": owned[uid]["decks"],
            "cards": owned[uid]["cards"],
        })
    return {"window": w, "users": users, "features": features, "categories": categories}


def _dist(counter: Counter, labels: dict, total: int, order: Optional[list] = None) -> list[dict]:
    keys = order or [k for k, _ in counter.most_common()]
    return [{"key": k, "label": labels.get(k, k) if k else "Ko'rsatilmagan", "users": counter.get(k, 0),
             "pct": _pct(counter.get(k, 0), total)} for k in keys]


@router.get("/audience")
def audience_analytics(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    data = _audience(db, days)
    w, users, features = data["window"], data["users"], data["features"]
    total = len(users)
    active = [u for u in users if u["active_days"] > 0]

    onboarded = [u for u in users if u["interests"] or u["motivation"] or u["experience"]]
    interests_all: Counter = Counter()
    interests_active: Counter = Counter()
    for u in users:
        interests_all.update(set(u["interests"]))
        if u["active_days"]:
            interests_active.update(set(u["interests"]))
    icon_by_name = {name: icon for name, icon in data["categories"].values()}
    interest_rows = [{"label": name, "icon": icon_by_name.get(name, "📚"), "users": n,
                      "active_users": interests_active.get(name, 0), "pct": _pct(n, len(onboarded))}
                     for name, n in interests_all.most_common()]

    theme_rows = []
    for key, (label, emoji) in THEMES.items():
        owners = sum(key in u["owned_themes"] for u in users)
        learners = sum(key in u["learned_themes"] for u in users)
        anyone = sum(key in u["owned_themes"] or key in u["learned_themes"] for u in users)
        if anyone:
            theme_rows.append({"key": key, "label": label, "emoji": emoji, "users": anyone,
                               "creators": owners, "learners": learners, "pct": _pct(anyone, total)})
    theme_rows.sort(key=lambda r: r["users"], reverse=True)

    # Motivation × feature: of the ACTIVE users who gave this answer, what
    # share used each feature — "career-minded users mostly do X".
    by_motivation: dict[Optional[str], list] = defaultdict(list)
    for u in active:
        by_motivation[u["motivation"] if u["motivation"] in MOTIVATION_LABELS else None].append(u)
    matrix = []
    for key in [*MOTIVATION_LABELS, None]:
        group = by_motivation.get(key, [])
        matrix.append({
            "key": key or "none",
            "label": MOTIVATION_LABELS.get(key, "Javob bermagan") if key else "Javob bermagan",
            "users": len(group),
            "features": {f.key: _pct(sum(f.key in u["features"] for u in group), len(group)) for f in features},
        })

    segments = Counter(u["segment"] for u in users)
    goal_buckets = [(0, 10, "≤10 daq"), (11, 20, "11–20 daq"), (21, 45, "21–45 daq"), (46, 90, "46–90 daq"), (91, 10**6, "90+ daq")]

    return {
        "window": {"days": days, "start": w.start.isoformat(), "end": w.today.isoformat()},
        "totals": {
            "users": total,
            "active": len(active),
            "new": sum(u["is_new"] for u in users),
            "onboarded": len(onboarded),
            "onboarded_pct": _pct(len(onboarded), total),
            "with_decks": sum(u["decks"] > 0 for u in users),
        },
        "segments": [{"key": k, "label": SEGMENT_LABELS[k], "users": segments.get(k, 0),
                      "pct": _pct(segments.get(k, 0), total)} for k in SEGMENT_LABELS],
        "interests": interest_rows,
        "motivation": _dist(Counter(u["motivation"] for u in onboarded), MOTIVATION_LABELS, len(onboarded),
                            [*MOTIVATION_LABELS, None]),
        "experience": _dist(Counter(u["experience"] for u in onboarded), EXPERIENCE_LABELS, len(onboarded),
                            [*EXPERIENCE_LABELS, None]),
        "registered_via": _dist(Counter(u["registered_via"] for u in users),
                                {**SOURCE_LABELS, "unknown": "Noma'lum"}, total),
        "roles": _dist(Counter(u["role"] for u in users),
                       {"student": "O'quvchi", "teacher": "O'qituvchi", "admin": "Admin"}, total),
        "timezones": _dist(Counter(u["timezone"] for u in users), {}, total)[:8],
        "cities": [r for r in _dist(Counter(u["city"] for u in users if u["city"]), {}, total)][:10],
        "daily_goal": [{"key": label, "label": label,
                        "users": sum(lo <= (u["daily_goal"] or 20) <= hi for u in users)} for lo, hi, label in goal_buckets],
        "flashcard_themes": theme_rows,
        "motivation_features": {
            "features": [{"key": f.key, "label": f.label, "emoji": f.emoji} for f in features],
            "rows": matrix,
        },
    }


@router.get("/audience/export")
def audience_export(
    days: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """One row per user. UTF-8 with BOM so Excel opens Uzbek text correctly."""
    data = _audience(db, days)
    feature_labels = {f.key: f.label for f in data["features"]}
    buf = io.StringIO()
    out = csv.writer(buf)
    out.writerow([
        "telegram_id", "ism", "username", "ro'yxatdan_o'tgan", "oxirgi_faollik", "manba", "rol",
        "tajriba", "motivatsiya", "qiziqishlar", "karta_mavzulari", "segment", f"faol_kunlar_{days}k",
        "ishlatgan_xususiyatlar", "to'plamlar", "kartalar", "streak", "5savol_streak", "daraja", "xp",
        "kunlik_maqsad_daq", "timezone", "shahar",
    ])
    for u in sorted(data["users"], key=lambda u: (u["active_days"], u["xp"] or 0), reverse=True):
        out.writerow([
            u["id"], u["name"] or "", u["username"] or "", _iso(u["joined"]) or "", _iso(u["last_seen"]) or "",
            SOURCE_LABELS.get(u["registered_via"], u["registered_via"]), u["role"],
            EXPERIENCE_LABELS.get(u["experience"], u["experience"] or ""),
            MOTIVATION_LABELS.get(u["motivation"], u["motivation"] or ""),
            " | ".join(u["interests"]),
            " | ".join(theme_label(k)[0] for k in u["themes"]),
            SEGMENT_LABELS[u["segment"]], u["active_days"],
            " | ".join(feature_labels[k] for k, _ in u["features"].most_common()),
            u["decks"], u["cards"], u["streak"] or 0, u["quiz_streak"] or 0, u["level"] or 1, u["xp"] or 0,
            u["daily_goal"] or "", u["timezone"] or "", u["city"] or "",
        ])
    filename = f"sahifalab_auditoriya_{data['window'].today.isoformat()}_{days}k.csv"
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
