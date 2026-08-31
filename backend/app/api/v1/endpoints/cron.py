"""
cron.py — Scheduled / internal maintenance endpoints.

Routes (secret-key protected, NOT JWT):
  POST /api/cron/weekly-reset                — reset profile_views_week for all users
  POST /api/cron/weekly-report               — send weekly study report push notifications
  POST /api/cron/streak-reminder             — 20:00-local reminder to users who haven't studied today
  POST /api/cron/streak-freeze-auto-apply    — 00:00-local: auto-consume a freeze for yesterday's miss
  POST /api/cron/streak-at-risk-push         — 09:00-local: urgent push for zero-freeze at-risk users
  POST /api/cron/expire-pending-enrollments  — mark stale awaiting_payment/paid rows as expired
  POST /api/cron/challenges-tick             — Musobaqalar: status transitions + notification cadence
  POST /api/cron/challenges-consistency-daily — step-25: daily 'consistency' run evaluation
  POST /api/cron/weekly-review-batch          — 088/089 Tanga+AI: free weekly personal review,
                                                 every user's own local Monday 7am
                                                 (profiles.timezone)
  POST /api/cron/weekly-review-force/{telegram_id} — manual: generate one user's review now,
                                                 bypassing the local-Monday/7am gate
  POST /api/cron/tanga-reconciliation         — DISABLED (092 rework made its premise obsolete and
                                                 it was actively re-farming Tanga — see
                                                 app/services/tanga_reconciliation.py). No-op, kept
                                                 only so an external caller doesn't 404/500.
  POST /api/cron/focus-sessions-volume-check  — standing alert: page admins if daily focus_sessions
                                                 volume drops >50% day-over-day
  POST /api/cron/daily-quiz-generate-week      — 090: weekly generate+verify next 7 days' "5 Savol"
  POST /api/cron/daily-quiz-rollover           — 090: daily 00:00 UTC — close yesterday, publish
                                                 today (if approved), push "tayyor" notification
                                                 (spec's two separate 00:00 bullets, combined —
                                                 same trigger time, one job, per "keep cron count minimal")
  POST /api/cron/daily-quiz-reminder           — 090: daily 12:00 UTC — nudge users who haven't played

Authentication: CRON_SECRET env var must be provided in X-Cron-Secret header.

streak-reminder, streak-freeze-auto-apply and streak-at-risk-push are all now
HOURLY jobs that self-select which users are due based on each user's own
`profiles.timezone` (see app/services/user_time.py) — there is no single UTC
hour that means "8pm" or "midnight" for every user, so the schedule below
fires every hour and the SQL WHERE clause does the per-user local-hour
filtering (EXTRACT(HOUR FROM (NOW() AT TIME ZONE profiles.timezone))).

Configure Railway cron jobs (if run externally — see main.py's
_start_cron_scheduler for the in-process APScheduler equivalent, which is
what actually drives these today; running both means double-sends):
    POST /api/cron/weekly-reset                 — schedule: 0 0 * * 1   (Monday 00:00 UTC)
    POST /api/cron/weekly-report                — schedule: 0 8 * * 1   (Monday 08:00 UTC)
    POST /api/cron/streak-reminder               — schedule: 0 * * * *   (every hour, local-hour-20 filter)
    POST /api/cron/streak-freeze-auto-apply      — schedule: 10 * * * *  (every hour, local-hour-0 filter)
    POST /api/cron/streak-at-risk-push           — schedule: 20 * * * *  (every hour, local-hour-9 filter)
    POST /api/cron/expire-pending-enrollments    — schedule: 0 * * * *   (Every hour)
    POST /api/cron/challenges-tick                — schedule: 0 * * * *   (Every hour)
    POST /api/cron/challenges-consistency-daily  — schedule: 5 19 * * *  (~00:05 Tashkent — evaluates "yesterday")
    POST /api/cron/weekly-review-batch           — schedule: 45 * * * *  (every hour, local-Monday-7am+ filter)
    POST /api/cron/tanga-reconciliation          — DISABLED, not scheduled anywhere anymore
    POST /api/cron/focus-sessions-volume-check   — schedule: 0 7 * * *   (07:00 UTC daily)
    POST /api/cron/daily-quiz-generate-week      — schedule: 0 5 * * *   (05:00 UTC daily — was Monday-only)
    POST /api/cron/daily-quiz-rollover           — schedule: 0 0 * * *   (00:00 UTC daily)
    POST /api/cron/daily-quiz-reminder           — schedule: 0 12 * * *  (12:00 UTC daily)
"""

import os
import hmac
import logging
import asyncio

import httpx
from fastapi import APIRouter, Header, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends
from sqlalchemy import text
from datetime import datetime, UTC, timedelta
from typing import Optional

from app.db.session import get_db
from app.api.v1.endpoints.notifications import send_notification
from app.services.challenge_service import (
    evaluate_consistency_day, resolve_sprint_challenge, resolve_team_challenge,
)
from app.services.user_time import user_local_date
from app.services.freeze_service import check_freeze_eligibility, compute_streak_state, apply_freeze

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cron", tags=["cron"])

CRON_SECRET = os.getenv("CRON_SECRET", "")


def _require_cron_secret(x_cron_secret: str = Header(None)):
    """Validate the shared secret. Blocks all callers without it."""
    if not CRON_SECRET:
        # Safety: if CRON_SECRET not configured, block all calls
        raise HTTPException(status_code=503, detail="Cron not configured")
    if not hmac.compare_digest(x_cron_secret or "", CRON_SECRET):
        raise HTTPException(status_code=403, detail="Invalid cron secret")


@router.post("/weekly-reset")
def weekly_reset(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    HOOK 8 — Weekly reset.

    Resets profile_views_week = 0 for all users.
    Calls the Postgres function created in migration 048.
    """
    try:
        db.execute(text("SELECT public.weekly_reset_profile_views()"))
        db.commit()
        logger.info("weekly_reset: profile_views_week reset complete")
        return {"ok": True, "action": "profile_views_week reset"}
    except Exception as exc:
        db.rollback()
        logger.error("weekly_reset failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Reset failed: {exc}")


def _fmt_time(minutes: int) -> str:
    """Convert minutes to Uzbek-readable string: '3 soat 20 daqiqa' or '45 daqiqa'."""
    if minutes <= 0:
        return "0 daqiqa"
    h, m = divmod(minutes, 60)
    if h and m:
        return f"{h} soat {m} daqiqa"
    if h:
        return f"{h} soat"
    return f"{m} daqiqa"


def _motivational(minutes: int, pct_change: int, days_active: int) -> str:
    if minutes == 0:
        return "Bu hafta o'qish amalga oshmadi. Kelasi haftada yangi boshlang! 💪"
    if days_active >= 6:
        return "Deyarli har kuni o'qidingiz — bu juda katta yutuq! 🏆"
    if pct_change >= 50:
        return f"Ajoyib! O'tgan haftadan {pct_change}% ko'p o'qidingiz! 🚀"
    if pct_change >= 20:
        return f"Zo'r ish! O'tgan haftadan {pct_change}% ko'proq vaqt ajratdingiz 📈"
    if pct_change > 0:
        return "Izchillik — muvaffaqiyatning kaliti. Davom eting! ✨"
    if pct_change < -20:
        return "Bu hafta qiyin o'tdi. Kelasi hafta qaytib keling — siz uddalaysiz! 💙"
    if minutes >= 120:
        return f"{_fmt_time(minutes)} — bu kuchli natija! Shu sur'atni saqlang 🔥"
    return "Har bir daqiqa hisob! Biroz ko'proq vaqt ajratsak yana yaxshiroq bo'ladi 📚"


async def _send_expo_push(tokens: list[str], title: str, body: str, data: dict) -> dict:
    """Batch-send Expo push notifications. Returns {sent, failed}."""
    if not tokens:
        return {"sent": 0, "failed": 0}
    messages = [
        {"to": token, "title": title, "body": body, "data": data, "sound": "default"}
        for token in tokens
    ]
    sent = failed = 0
    # Expo accepts up to 100 per request
    for i in range(0, len(messages), 100):
        batch = messages[i:i + 100]
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=batch,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
                results = resp.json().get("data", [])
                for r in results:
                    if r.get("status") == "ok":
                        sent += 1
                    else:
                        failed += 1
                        logger.warning("expo push failed: %s", r)
        except Exception as exc:
            logger.error("expo batch send error: %s", exc)
            failed += len(batch)
    return {"sent": sent, "failed": failed}


@router.post("/weekly-report")
async def send_weekly_reports(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    Compute each opted-in user's weekly study stats and send a push notification
    with a deep link to the in-app weekly report screen.

    Schedule: 0 8 * * 1  (every Monday at 08:00 UTC)
    """
    today    = datetime.now(UTC).date()
    week_ago = today - timedelta(days=7)

    # Fetch all users with expo_push_token + weekly notif enabled
    rows = db.execute(text("""
        SELECT
            telegram_id,
            first_name,
            daily_goal_minutes,
            streak_days,
            user_settings
        FROM profiles
        WHERE
            user_settings->>'expo_push_token' IS NOT NULL
            AND user_settings->>'expo_push_token' != ''
            AND (
                user_settings->'notification_prefs'->>'weekly' IS NULL
                OR user_settings->'notification_prefs'->>'weekly' = 'true'
            )
    """)).fetchall()

    if not rows:
        return {"ok": True, "sent": 0, "skipped": 0}

    tokens_and_stats: list[tuple[str, int, int, int]] = []  # (token, uid, minutes, pct)

    for row in rows:
        uid         = row.telegram_id
        daily_goal  = int(row.daily_goal_minutes or 20)

        agg = db.execute(text("""
            SELECT
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :week_ago), 0)         AS this_week,
                COALESCE(SUM(minutes) FILTER (WHERE session_date >= :prev_start
                                              AND   session_date <  :week_ago), 0)         AS prev_week,
                COALESCE(COUNT(DISTINCT session_date) FILTER (WHERE session_date >= :week_ago), 0) AS days_active
            FROM focus_sessions
            WHERE user_id = :uid AND session_date >= :prev_start
        """), {
            "uid": uid,
            "week_ago":   week_ago,
            "prev_start": today - timedelta(days=14),
        }).fetchone()

        this_week = int(agg.this_week)   if agg else 0
        prev_week = int(agg.prev_week)   if agg else 0
        days_active = int(agg.days_active) if agg else 0

        if prev_week > 0:
            pct = round((this_week - prev_week) / prev_week * 100)
        elif this_week > 0:
            pct = 100
        else:
            pct = 0

        settings = row.user_settings or {}
        token = settings.get("expo_push_token", "")
        if token:
            tokens_and_stats.append((token, uid, this_week, pct, days_active,
                                     row.first_name or "", int(row.streak_days or 0)))

    # Build per-user notifications (personalised title + body)
    messages_by_token: dict[str, dict] = {}
    for token, uid, minutes, pct, days_active, first_name, streak in tokens_and_stats:
        time_str = _fmt_time(minutes)
        if minutes == 0:
            title = "Bu hafta hali boshlanmadi! 📚"
        elif pct >= 20:
            title = f"Bu hafta {pct}% ko'proq o'qidingiz! 🚀"
        else:
            title = f"Haftalik hisobotingiz tayyor 📊"

        body = _motivational(minutes, pct, days_active)
        messages_by_token[token] = {
            "title": title,
            "body":  body,
            "data":  {
                "screen":   "weekly_report",
                "minutes":  minutes,
                "pct":      pct,
            },
        }

    # Group into a single batch per unique (title, body) is not feasible easily,
    # so just collect tokens list and send individually via the Expo batch API
    expo_messages = []
    for token, payload in messages_by_token.items():
        expo_messages.append({
            "to":    token,
            "title": payload["title"],
            "body":  payload["body"],
            "data":  payload["data"],
            "sound": "default",
        })

    sent = failed = 0
    for i in range(0, len(expo_messages), 100):
        batch = expo_messages[i:i + 100]
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=batch,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
                results = resp.json().get("data", [])
                for r in results:
                    if r.get("status") == "ok":
                        sent += 1
                    else:
                        failed += 1
                        logger.warning("weekly_report push failed: %s", r)
        except Exception as exc:
            logger.error("weekly_report batch error: %s", exc)
            failed += len(batch)

    logger.info("weekly_report: sent=%d failed=%d total_users=%d", sent, failed, len(rows))
    return {"ok": True, "sent": sent, "failed": failed, "total_users": len(rows)}


@router.post("/streak-reminder")
async def send_streak_reminders(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    Send a streak reminder to users who:
      - Have an active streak (streak_days > 0)
      - Have NOT completed a focus session today (in THEIR local day)
      - Have streak notifications enabled (or preference not set)
      - Have an Expo push token registered
      - Haven't already been reminded today (last_reminder_date dedup —
        needed now that this fires hourly instead of once daily, so a
        timezone change or an hour-repeat around a DST transition can't
        double-send)

    Runs hourly; the local-hour-20 filter below (not the schedule) is what
    makes this "8pm for each user" rather than "8pm UTC" — see cron.py's
    module docstring.
    """
    rows = db.execute(text("""
        SELECT
            p.telegram_id,
            p.first_name,
            p.streak_days,
            p.timezone,
            p.user_settings->>'expo_push_token' AS token,
            p.user_settings->>'learning_motivation' AS motivation
        FROM profiles p
        WHERE
            p.streak_days > 0
            AND p.user_settings->>'expo_push_token' IS NOT NULL
            AND p.user_settings->>'expo_push_token' != ''
            AND (
                p.user_settings->'notification_prefs'->>'streak' IS NULL
                OR p.user_settings->'notification_prefs'->>'streak' = 'true'
            )
            AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(p.timezone, 'Asia/Tashkent'))) = 20
            AND (
                p.last_reminder_date IS NULL
                OR p.last_reminder_date < (NOW() AT TIME ZONE COALESCE(p.timezone, 'Asia/Tashkent'))::date
            )
            AND p.telegram_id NOT IN (
                SELECT DISTINCT user_id
                FROM focus_sessions
                WHERE session_date = (NOW() AT TIME ZONE COALESCE(p.timezone, 'Asia/Tashkent'))::date
            )
    """)).fetchall()

    if not rows:
        return {"ok": True, "sent": 0, "eligible": 0}

    # Dedup stamp — set for every eligible user regardless of push transport
    # success, since "eligible for today's reminder" is what must not be
    # reconsidered again today, not "the push actually delivered".
    for row in rows:
        local_today = user_local_date(row.timezone)
        db.execute(
            text("UPDATE profiles SET last_reminder_date = :d WHERE telegram_id = :uid"),
            {"d": local_today, "uid": row.telegram_id},
        )
    db.commit()

    # Short closing nudge tailored to the user's onboarding motivation — appended to
    # the base streak message so copy stays relevant to why they're learning.
    _MOTIVATION_NUDGE = {
        "career": "Karyerangiz uchun bir qadam yaqinlashing.",
        "skill":  "Yangi ko'nikma — bugun ozgina, ertaga katta natija.",
        "self":   "O'zingiz uchun boshlagan ishni davom ettiring.",
        "exam":   "Imtihonga tayyorgarlik uchun har kun muhim.",
    }

    def _streak_body(streak: int, name: str, motivation: Optional[str]) -> tuple[str, str]:
        if streak >= 100:
            title, body = (
                f"💎 {streak} kunlik seriya! Qo'ldan chiqarmang!",
                f"{name}, siz {streak} kundan beri har kuni o'qiyapsiz — bugun ham davom eting!",
            )
        elif streak >= 30:
            title, body = (
                f"🏆 {streak} kun — ajoyib! Bugun ham o'qing",
                f"Seriyangiz {streak} kunga yetdi. Bugun o'tkazib yubormang!",
            )
        elif streak >= 7:
            title, body = (
                f"🔥 {streak} kunlik seriya xavf ostida!",
                f"Bugun o'qimay qolsangiz {streak} kunlik seriyangiz tugaydi. 5 daqiqa kifoya!",
            )
        else:
            title, body = (
                "⚡ Bugun dars o'tmaganiz!",
                f"Seriyangizni saqlash uchun hozir o'qing — {streak} kun ketadi!",
            )
        nudge = _MOTIVATION_NUDGE.get(motivation or "")
        if nudge:
            body = f"{body} {nudge}"
        return title, body

    messages = []
    for row in rows:
        title, body = _streak_body(int(row.streak_days or 1), row.first_name or "Salom", row.motivation)
        messages.append({
            "to":    row.token,
            "title": title,
            "body":  body,
            "data":  {"screen": "streak_reminder", "type": "streak_reminder"},
            "sound": "default",
        })

    sent = failed = 0
    for i in range(0, len(messages), 100):
        batch = messages[i:i + 100]
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://exp.host/--/api/v2/push/send",
                    json=batch,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
                results = resp.json().get("data", [])
                for r in results:
                    if r.get("status") == "ok":
                        sent += 1
                    else:
                        failed += 1
                        logger.warning("streak_reminder push failed: %s", r)
        except Exception as exc:
            logger.error("streak_reminder batch error: %s", exc)
            failed += len(batch)

    logger.info("streak_reminder: sent=%d failed=%d eligible=%d", sent, failed, len(rows))
    return {"ok": True, "sent": sent, "failed": failed, "eligible": len(rows)}


@router.post("/streak-freeze-auto-apply")
async def streak_freeze_auto_apply(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    Auto-consume one freeze for any user whose local day has just crossed
    midnight and who missed exactly one day — freezes that only apply when a
    user is present to tap a button aren't insurance (plan doc P1/P3).

    Runs hourly; the local-hour-0 filter below (not the schedule) is what
    makes this "midnight for each user" rather than a single UTC cutoff.

    Reuses check_freeze_eligibility()/apply_freeze() from freeze_service —
    the exact same validation POST /api/streaks/freeze/use runs, including
    the consecutive-freeze cap (D), so a freeze is never applied under
    different rules depending on who/what triggered it.
    """
    rows = db.execute(text("""
        SELECT telegram_id, streak_days, streak_last_date,
               COALESCE(freeze_count, 0) AS freeze_count,
               COALESCE(freeze_used_dates, '{}') AS freeze_used_dates,
               timezone
        FROM profiles
        WHERE streak_days > 0
          AND freeze_count > 0
          AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(timezone, 'Asia/Tashkent'))) = 0
    """)).fetchall()

    applied = skipped = 0
    for row in rows:
        local_today = user_local_date(row.timezone)
        missed_date = local_today - timedelta(days=1)
        freeze_used_dates = set(row.freeze_used_dates or [])

        elig = check_freeze_eligibility(local_today, row.streak_last_date, row.freeze_count, freeze_used_dates)
        if not elig.eligible:
            skipped += 1
            logger.info("streak_freeze_auto_apply: skip user_id=%s reason=%s", row.telegram_id, elig.reason)
            continue

        rowcount = apply_freeze(db, row.telegram_id, missed_date, row.streak_last_date)
        if rowcount == 0:
            # Raced with a concurrent manual /freeze/use call or an overlapping tick.
            skipped += 1
            logger.info("streak_freeze_auto_apply: skip user_id=%s reason=raced_or_already_applied", row.telegram_id)
            continue

        applied += 1
        remaining = int(row.freeze_count) - 1
        logger.info(
            "streak_freeze_auto_apply: applied user_id=%s missed=%s streak_days=%s remaining=%s",
            row.telegram_id, missed_date, row.streak_days, remaining,
        )
        asyncio.create_task(send_notification(
            row.telegram_id, "streak_freeze_applied", category="SYSTEM",
            meta={
                "streak_days":  int(row.streak_days or 0),
                "freeze_count": remaining,
                "frozen_date":  missed_date.isoformat(),
            },
        ))

    logger.info("streak_freeze_auto_apply: applied=%d skipped=%d candidates=%d", applied, skipped, len(rows))
    return {"ok": True, "applied": applied, "skipped": skipped, "candidates": len(rows)}


@router.post("/streak-at-risk-push")
async def streak_at_risk_push(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    Urgent push for users whose streak is 'at_risk' (missed exactly one day,
    window still open) AND who hold zero freezes — users who still have a
    freeze got auto-applied at local midnight by streak-freeze-auto-apply and
    are 'frozen_today' by 09:00, not 'at_risk', so they're naturally excluded
    here (plan doc section F).

    Runs hourly; the local-hour-9 filter below is what makes this "9am for
    each user". Dedup via last_at_risk_push_date, same pattern as
    streak-reminder's last_reminder_date.
    """
    rows = db.execute(text("""
        SELECT telegram_id, streak_days, streak_last_date, daily_goal_minutes, timezone,
               COALESCE(freeze_used_dates, '{}') AS freeze_used_dates,
               user_settings->>'expo_push_token' AS token
        FROM profiles
        WHERE streak_days > 0
          AND COALESCE(freeze_count, 0) = 0
          AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(timezone, 'Asia/Tashkent'))) = 9
          AND (
              last_at_risk_push_date IS NULL
              OR last_at_risk_push_date < (NOW() AT TIME ZONE COALESCE(timezone, 'Asia/Tashkent'))::date
          )
          AND user_settings->>'expo_push_token' IS NOT NULL
          AND user_settings->>'expo_push_token' != ''
    """)).fetchall()

    sent = skipped = 0
    for row in rows:
        local_today = user_local_date(row.timezone)
        daily_goal = int(row.daily_goal_minutes or 20)

        today_row = db.execute(
            text("SELECT COALESCE(SUM(minutes), 0) >= :goal AS goal_met FROM focus_sessions WHERE user_id = :uid AND session_date = :today"),
            {"uid": row.telegram_id, "goal": daily_goal, "today": local_today},
        ).fetchone()
        today_goal_met = bool(today_row.goal_met) if today_row else False

        state = compute_streak_state(local_today, row.streak_last_date, set(row.freeze_used_dates or []), today_goal_met)
        # Dedup stamp regardless of state — a user who isn't at_risk today
        # (e.g. state flipped to lost overnight, or they already studied)
        # must not be reconsidered again today either.
        db.execute(
            text("UPDATE profiles SET last_at_risk_push_date = :d WHERE telegram_id = :uid"),
            {"d": local_today, "uid": row.telegram_id},
        )
        if state != "at_risk":
            skipped += 1
            continue

        asyncio.create_task(send_notification(
            row.telegram_id, "streak_at_risk", category="SYSTEM",
            meta={"streak_days": int(row.streak_days or 0)},
        ))
        sent += 1
    db.commit()

    logger.info("streak_at_risk_push: sent=%d skipped=%d candidates=%d", sent, skipped, len(rows))
    return {"ok": True, "sent": sent, "skipped": skipped, "candidates": len(rows)}


@router.post("/expire-pending-enrollments")
async def expire_pending_enrollments(
    _: None = Depends(_require_cron_secret),
):
    """
    Mark pending_enrollments rows as 'expired' when their expires_at has passed
    and they are still in awaiting_payment or paid status.

    The expires_at filter in request-code / pending-status already hides these rows
    from users, but this job cleans them up in the database so the table stays tidy
    and the per-user 3-request cap counts only genuinely active rows.

    Schedule: 0 * * * *  (every hour, Railway cron)
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=503, detail="Supabase not configured")

    now_iso = datetime.now(UTC).isoformat()
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.patch(
            f"{SUPABASE_URL}/rest/v1/pending_enrollments",
            params={
                "status":     "in.(awaiting_payment,paid)",
                "expires_at": f"lt.{now_iso}",
            },
            json={"status": "expired"},
            headers={**headers, "Prefer": "count=exact"},
        )

    if resp.status_code not in (200, 201, 204):
        logger.error("expire_pending_enrollments: Supabase PATCH failed: %s", resp.text)
        raise HTTPException(status_code=502, detail="Failed to expire rows")

    expired_count = int(resp.headers.get("content-range", "0/0").split("/")[-1] or 0)
    logger.info("expire_pending_enrollments: expired=%d", expired_count)
    return {"ok": True, "expired": expired_count}


@router.post("/challenges-tick")
async def challenges_tick(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    step-21 Musobaqalar — run at least hourly.

    Transitions challenge status (upcoming -> active -> ended) and fires the
    capped, warm notification cadence from step-21 Phase 5: start, midpoint
    (>=50% of the window elapsed), final-stretch (<=2 days left, only for
    participants with >=25% progress — never nag a non-participant), and end
    (one warm, non-punitive summary to non-completers, no follow-up).

    Never touches profiles.streak_days, streak_stages, or
    user_stage_completions — challenge completion is a separate economy from
    the tree/streak by design (see app/services/challenge_service.py).

    Configure Railway cron: schedule 0 * * * * (hourly).
    """
    now = datetime.now(UTC)
    results = {
        "activated": 0, "ended": 0,
        "start_notified": 0, "midpoint_notified": 0,
        "final_stretch_notified": 0, "end_notified": 0,
    }

    # ── 1. upcoming -> active ────────────────────────────────────────────────
    activated = db.execute(
        text("UPDATE challenges SET status = 'active' WHERE status = 'upcoming' AND starts_at <= :now RETURNING id, title"),
        {"now": now},
    ).fetchall()
    db.commit()
    results["activated"] = len(activated)

    for ch in activated:
        participants = db.execute(
            text("SELECT user_id FROM challenge_participants WHERE challenge_id = :cid AND NOT start_notified"),
            {"cid": ch.id},
        ).fetchall()
        for p in participants:
            asyncio.create_task(send_notification(
                p.user_id, "challenge_started", category="SYSTEM",
                meta={"challenge_id": str(ch.id), "title": ch.title},
            ))
        db.execute(
            text("UPDATE challenge_participants SET start_notified = TRUE WHERE challenge_id = :cid"),
            {"cid": ch.id},
        )
        db.commit()
        results["start_notified"] += len(participants)

    # ── 2. active -> ended ───────────────────────────────────────────────────
    ended = db.execute(
        text("""
            UPDATE challenges SET status = 'ended'
            WHERE status = 'active' AND ends_at <= :now
            RETURNING id, title, challenge_type, winner_count, reward_xp, badge_key,
                      team_a_name, team_b_name
        """),
        {"now": now},
    ).fetchall()
    db.commit()
    results["ended"] = len(ended)
    results["sprint_winners"] = 0
    results["team_winner_notified"] = 0

    for ch in ended:
        # step-25 — resolve sprint/team outcomes BEFORE the non-completer
        # notification pass below, so winners (completed_at now set) are
        # correctly excluded from the generic "didn't finish" message.
        if ch.challenge_type == "sprint":
            winners = resolve_sprint_challenge(db, ch.id, ch.winner_count, ch.reward_xp, ch.badge_key)
            db.commit()
            results["sprint_winners"] += winners
        elif ch.challenge_type == "team":
            winning_team = resolve_team_challenge(db, ch.id, ch.reward_xp, ch.badge_key)
            db.commit()
            if winning_team:
                team_name = ch.team_a_name if winning_team == "A" else ch.team_b_name
                participants = db.execute(
                    text("SELECT user_id, team FROM challenge_participants WHERE challenge_id = :cid"),
                    {"cid": ch.id},
                ).fetchall()
                for p in participants:
                    won = p.team == winning_team
                    asyncio.create_task(send_notification(
                        p.user_id, "challenge_team_result", category="SYSTEM",
                        meta={
                            "challenge_id": str(ch.id), "title": ch.title,
                            "won": won, "team_name": team_name,
                        },
                    ))
                results["team_winner_notified"] += len(participants)

        # Defensive recompute — completion_count is normally kept accurate in
        # real time by challenge_service.py, this just guards against drift.
        db.execute(
            text("""
                UPDATE challenges SET completion_count = (
                    SELECT COUNT(*) FROM challenge_participants
                    WHERE challenge_id = :cid AND completed_at IS NOT NULL
                ) WHERE id = :cid
            """),
            {"cid": ch.id},
        )
        db.commit()

        # Warm, non-punitive summary to everyone who didn't complete/win —
        # ONE message, ever. Nothing is lost, nothing is shamed. (Team
        # participants already got their own message above, so they're
        # excluded here to avoid a duplicate.)
        non_completers = db.execute(
            text("""
                SELECT user_id, progress_value FROM challenge_participants
                WHERE challenge_id = :cid AND completed_at IS NULL AND NOT end_notified
            """),
            {"cid": ch.id},
        ).fetchall()
        if ch.challenge_type != "team":
            for p in non_completers:
                asyncio.create_task(send_notification(
                    p.user_id, "challenge_ended", category="SYSTEM",
                    meta={"challenge_id": str(ch.id), "title": ch.title, "progress_value": p.progress_value},
                ))
        db.execute(
            text("UPDATE challenge_participants SET end_notified = TRUE WHERE challenge_id = :cid AND completed_at IS NULL"),
            {"cid": ch.id},
        )
        db.execute(
            text("UPDATE challenge_participants SET end_notified = TRUE WHERE challenge_id = :cid AND completed_at IS NOT NULL AND NOT end_notified"),
            {"cid": ch.id},
        )
        db.commit()
        results["end_notified"] += len(non_completers)

    # ── 3. Midpoint + final-stretch nudges for currently-active challenges ──
    # target_value is NULL for consistency/sprint/team (step-25) — every
    # branch below must be type-aware; target_value-based math must never
    # run for a type where it's None.
    active_challenges = db.execute(
        text("""
            SELECT id, title, starts_at, ends_at, target_value, challenge_type, winner_count
            FROM challenges WHERE status = 'active'
        """),
    ).fetchall()

    for ch in active_challenges:
        total_window = (ch.ends_at - ch.starts_at).total_seconds()
        elapsed       = (now - ch.starts_at).total_seconds()
        pct_elapsed   = (elapsed / total_window) if total_window > 0 else 1.0
        days_left     = (ch.ends_at - now).days

        if ch.challenge_type == "cumulative":
            if pct_elapsed >= 0.5:
                midpoint_rows = db.execute(
                    text("""
                        SELECT user_id, progress_value FROM challenge_participants
                        WHERE challenge_id = :cid AND completed_at IS NULL AND NOT midpoint_notified
                    """),
                    {"cid": ch.id},
                ).fetchall()
                for p in midpoint_rows:
                    asyncio.create_task(send_notification(
                        p.user_id, "challenge_midpoint", category="SYSTEM",
                        meta={
                            "challenge_id": str(ch.id), "title": ch.title,
                            "progress_value": p.progress_value, "target_value": ch.target_value,
                            "days_left": days_left,
                        },
                    ))
                db.execute(
                    text("UPDATE challenge_participants SET midpoint_notified = TRUE WHERE challenge_id = :cid AND completed_at IS NULL"),
                    {"cid": ch.id},
                )
                db.commit()
                results["midpoint_notified"] += len(midpoint_rows)

            if days_left <= 2:
                min_progress = round((ch.target_value or 0) * 0.25)
                final_rows = db.execute(
                    text("""
                        SELECT user_id, progress_value FROM challenge_participants
                        WHERE challenge_id = :cid AND completed_at IS NULL AND NOT final_stretch_notified
                          AND progress_value >= :min_progress
                    """),
                    {"cid": ch.id, "min_progress": min_progress},
                ).fetchall()
                for p in final_rows:
                    asyncio.create_task(send_notification(
                        p.user_id, "challenge_final_stretch", category="SYSTEM",
                        meta={
                            "challenge_id": str(ch.id), "title": ch.title,
                            "progress_value": p.progress_value, "target_value": ch.target_value,
                            "days_left": days_left,
                        },
                    ))
                db.execute(
                    text("""
                        UPDATE challenge_participants SET final_stretch_notified = TRUE
                        WHERE challenge_id = :cid AND completed_at IS NULL AND progress_value >= :min_progress
                    """),
                    {"cid": ch.id, "min_progress": min_progress},
                )
                db.commit()
                results["final_stretch_notified"] += len(final_rows)

        elif ch.challenge_type == "sprint":
            # Mid-window rank update — plain rank number, framed by the
            # mobile client as percentile, never "you're losing" (step-25
            # Part 7). Final-day nudge only to those plausibly in contention
            # (top 3x winner_count) — never nag someone with no realistic shot.
            if pct_elapsed >= 0.5:
                ranked = db.execute(
                    text("""
                        SELECT user_id, RANK() OVER (ORDER BY progress_value DESC, joined_at ASC) AS rank
                        FROM challenge_participants WHERE challenge_id = :cid AND completed_at IS NULL AND NOT midpoint_notified
                    """),
                    {"cid": ch.id},
                ).fetchall()
                for p in ranked:
                    asyncio.create_task(send_notification(
                        p.user_id, "challenge_sprint_rank", category="SYSTEM",
                        meta={"challenge_id": str(ch.id), "title": ch.title, "rank": p.rank, "days_left": days_left},
                    ))
                db.execute(
                    text("UPDATE challenge_participants SET midpoint_notified = TRUE WHERE challenge_id = :cid AND completed_at IS NULL"),
                    {"cid": ch.id},
                )
                db.commit()
                results["midpoint_notified"] += len(ranked)

            if days_left <= 1 and ch.winner_count:
                contention_cutoff = ch.winner_count * 3
                final_rows = db.execute(
                    text("""
                        SELECT user_id, rank FROM (
                            SELECT id, user_id, completed_at, final_stretch_notified,
                                   RANK() OVER (ORDER BY progress_value DESC, joined_at ASC) AS rank
                            FROM challenge_participants WHERE challenge_id = :cid
                        ) ranked
                        WHERE completed_at IS NULL AND NOT final_stretch_notified AND rank <= :cutoff
                    """),
                    {"cid": ch.id, "cutoff": contention_cutoff},
                ).fetchall()
                for p in final_rows:
                    asyncio.create_task(send_notification(
                        p.user_id, "challenge_sprint_rank", category="SYSTEM",
                        meta={"challenge_id": str(ch.id), "title": ch.title, "rank": p.rank, "days_left": days_left, "final": True},
                    ))
                db.execute(
                    text("""
                        UPDATE challenge_participants SET final_stretch_notified = TRUE
                        WHERE challenge_id = :cid AND completed_at IS NULL AND id IN (
                            SELECT id FROM (
                                SELECT id, RANK() OVER (ORDER BY progress_value DESC, joined_at ASC) AS rank
                                FROM challenge_participants WHERE challenge_id = :cid
                            ) r WHERE r.rank <= :cutoff
                        )
                    """),
                    {"cid": ch.id, "cutoff": contention_cutoff},
                )
                db.commit()
                results["final_stretch_notified"] += len(final_rows)

        elif ch.challenge_type == "team":
            # One standing update at the midpoint — capped, invitation-framed,
            # never guilt (step-25 Part 7): "your team needs you", not "you
            # let them down".
            if pct_elapsed >= 0.5:
                totals = db.execute(
                    text("""
                        SELECT team, COALESCE(SUM(progress_value), 0) AS total
                        FROM challenge_participants WHERE challenge_id = :cid AND team IS NOT NULL
                        GROUP BY team
                    """),
                    {"cid": ch.id},
                ).fetchall()
                total_map = {t.team: t.total for t in totals}
                members = db.execute(
                    text("""
                        SELECT user_id, team FROM challenge_participants
                        WHERE challenge_id = :cid AND completed_at IS NULL AND NOT midpoint_notified
                    """),
                    {"cid": ch.id},
                ).fetchall()
                for p in members:
                    my_total    = total_map.get(p.team, 0)
                    other_total = total_map.get("B" if p.team == "A" else "A", 0)
                    asyncio.create_task(send_notification(
                        p.user_id, "challenge_team_standing", category="SYSTEM",
                        meta={
                            "challenge_id": str(ch.id), "title": ch.title,
                            "team": p.team, "my_total": my_total, "other_total": other_total,
                            "ahead": my_total >= other_total, "days_left": days_left,
                        },
                    ))
                db.execute(
                    text("UPDATE challenge_participants SET midpoint_notified = TRUE WHERE challenge_id = :cid AND completed_at IS NULL"),
                    {"cid": ch.id},
                )
                db.commit()
                results["midpoint_notified"] += len(members)

        # 'consistency' midpoint/final-stretch nudges don't apply here — see
        # POST /cron/challenges-consistency-daily for the evening reminder
        # and the daily run evaluation, which is the only cadence that makes
        # sense for a "daily minimum" goal shape.

    logger.info("challenges_tick: %s", results)
    return {"ok": True, **results}


@router.post("/challenges-consistency-daily")
async def challenges_consistency_daily(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    step-25 — 'consistency' challenges: (1) evaluate yesterday's qualifying
    day for every participant (advance the run, apply a grace day, or fail
    the run — never any XP/streak loss either way), then (2) send today's
    evening reminder to anyone whose run is still alive but hasn't hit
    today's minimum yet.

    Schedule: 5 19 * * *  (~00:05 Tashkent — evaluates "yesterday" right
    after the day boundary; also serves as today's ~19:05 UTC evening
    reminder pass, matching streak-reminder's existing UTC-evening cadence).
    """
    today     = datetime.now(UTC).date()
    yesterday = today - timedelta(days=1)

    eval_results = evaluate_consistency_day(db, yesterday)

    # Evening reminder — today's minimum not yet met, run still alive.
    reminder_rows = db.execute(
        text("""
            SELECT cp.user_id, c.id AS challenge_id, c.title, c.daily_minimum,
                   COALESCE(dp.value, 0) AS today_value
            FROM challenge_participants cp
            JOIN challenges c ON c.id = cp.challenge_id
            LEFT JOIN challenge_daily_progress dp
                   ON dp.challenge_id = cp.challenge_id AND dp.user_id = cp.user_id AND dp.day = :today
            WHERE c.challenge_type = 'consistency' AND c.status = 'active'
              AND cp.completed_at IS NULL AND cp.failed_at IS NULL
              AND cp.joined_at::date <= :today
        """),
        {"today": today},
    ).fetchall()

    reminded = 0
    for r in reminder_rows:
        if r.today_value >= (r.daily_minimum or 0):
            continue
        asyncio.create_task(send_notification(
            r.user_id, "consistency_reminder", category="SYSTEM",
            meta={
                "challenge_id": str(r.challenge_id), "title": r.title,
                "remaining": max(0, (r.daily_minimum or 0) - r.today_value),
            },
        ))
        reminded += 1

    logger.info("challenges_consistency_daily: eval=%s reminded=%d", eval_results, reminded)
    return {"ok": True, "evaluation": eval_results, "reminded": reminded}


@router.post("/weekly-review-batch")
async def weekly_review_batch(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    Spec Part 6, feature 2 — the free, cron-driven weekly personal review.
    User-visible behavior is WEEKLY (every Monday morning), but the trigger
    itself ticks HOURLY: each user's own profiles.timezone decides when
    "Monday" and "7am" actually are for them, and a single fixed UTC cron
    time can't hit 7am local for every timezone at once (found via a live
    report: a Korea-based user's Monday review wasn't ready mid-afternoon
    their time because the batch was pinned to 06:00 UTC = 15:00 KST).
    run_staggered_batch's own SQL WHERE clause does the per-user local-
    Monday/local-hour-7+ filtering, same idiom as streak_freeze_auto_apply/
    streak_at_risk_push above. Idempotent per (user_id, week_start) via
    weekly_reviews' UNIQUE constraint — repeat hourly ticks the same Monday
    are a no-op for anyone already reviewed.
    """
    from app.services.weekly_review_service import run_staggered_batch
    result = await run_staggered_batch(db)
    logger.info("weekly_review_batch: %s", result)
    return {"ok": True, **result}


@router.post("/weekly-review-force/{telegram_id}")
async def weekly_review_force(
    telegram_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    Manual override: generate ONE user's weekly review right now, bypassing
    the local-Monday/7am gate — for backfilling a review without waiting
    for next Monday, entirely server-side (no app release needed). Does
    NOT bypass generate_weekly_review()'s own safeguards: a genuinely
    empty target week is still skipped (nothing to summarize), and an
    already-generated week is still idempotent (UNIQUE(user_id,
    week_start) — calling this twice for the same target week is a no-op,
    not a duplicate).
    """
    from app.services.weekly_review_service import generate_weekly_review, _week_start
    from app.services.user_time import user_local_date

    profile = db.execute(text("SELECT timezone FROM profiles WHERE telegram_id = :uid"), {"uid": telegram_id}).fetchone()
    if profile is None:
        raise HTTPException(404, "User not found")

    today = user_local_date(profile.timezone)
    target_week_start = _week_start(today)
    generated = await generate_weekly_review(db, telegram_id, today)
    logger.info("weekly_review_force: user_id=%s target_week=%s generated=%s", telegram_id, target_week_start, generated)
    return {"ok": True, "generated": generated, "week_start": target_week_start.isoformat()}


@router.post("/weekly-review-backfill-all")
async def weekly_review_backfill_all(
    after_telegram_id: int = -10_000_000_000,
    max_users: int = 100,
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    ONE-OFF bulk catch-up: generate every active user's most-recently-
    completed-week review right now, regardless of what day/local-hour it
    currently is for them — bypasses the local-Monday/7am gate that
    weekly-review-batch's normal per-user cadence uses. For catching
    everyone up in one pass (e.g. right after a fix) instead of waiting for
    each person's own next Monday.

    Paginated via after_telegram_id (cursor) + max_users, deliberately kept
    small per call: at real user-base scale, one unbounded request calling
    Gemini sequentially for every user would run well past any reasonable
    HTTP timeout. Call repeatedly, each time passing the previous response's
    next_after_telegram_id, until "done": true. A user with no activity in
    their target week or one already reviewed is a fast no-op (skipped
    before/without any AI call), so most of a call's time is spent on users
    who actually generate.
    """
    from app.services.weekly_review_service import generate_weekly_review, _week_start
    from app.services.user_time import user_local_date

    candidates = db.execute(
        text("""
            SELECT telegram_id, timezone FROM profiles
            WHERE status = 'active' AND telegram_id > :after
            ORDER BY telegram_id
            LIMIT :max_users
        """),
        {"after": after_telegram_id, "max_users": max_users},
    ).fetchall()

    generated = skipped = 0
    for row in candidates:
        try:
            today = user_local_date(row.timezone)
            ok = await generate_weekly_review(db, int(row.telegram_id), today)
            if ok:
                generated += 1
            else:
                skipped += 1
        except Exception:
            db.rollback()
            logger.error("weekly_review_backfill_all item failed for user_id=%s", row.telegram_id, exc_info=True)

    next_after = int(candidates[-1].telegram_id) if candidates else after_telegram_id
    done = len(candidates) < max_users
    logger.info(
        "weekly_review_backfill_all: candidates=%d generated=%d skipped=%d next_after=%d done=%s",
        len(candidates), generated, skipped, next_after, done,
    )
    return {
        "ok": True, "candidates": len(candidates), "generated": generated, "skipped": skipped,
        "next_after_telegram_id": next_after, "done": done,
    }


@router.post("/tanga-reconciliation")
async def tanga_reconciliation(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    DISABLED — see app/services/tanga_reconciliation.py's module docstring.
    This job's premise (retry a live Tanga grant that might have failed)
    predates migration 092, which removed that live grant entirely; nobody
    updated this job, and it was found actively re-farming a full, uncapped,
    1:1 xp_awarded-as-Tanga grant for every focus session every 15 minutes.
    Always a no-op now — kept only so an external caller doesn't 404/500.
    """
    from app.services.tanga_reconciliation import reconcile_missing_study_grants
    result = reconcile_missing_study_grants(db)
    if result["checked"]:
        logger.info("tanga_reconciliation: %s", result)
    return {"ok": True, **result}


@router.post("/focus-sessions-volume-check")
async def focus_sessions_volume_check(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    Standing alert (deploy hardening, post-088): if daily focus_sessions
    insert volume drops more than 50% day-over-day, page every configured
    admin via Telegram immediately. The prior outage ran undetected for
    three days because nothing was watching this number — see
    app/services/volume_alert_service.py.
    """
    from app.services.volume_alert_service import run_daily_volume_check
    result = await run_daily_volume_check(db)
    return {"ok": True, **result}


@router.post("/daily-quiz-generate-week")
async def daily_quiz_generate_week(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """
    090_daily_quiz / 094_daily_quiz_auto_publish — DAILY (not weekly, since
    the rework): keeps the next 7 days of "5 Savol" generated, topping up
    any day still stuck in 'draft' rather than leaving it short forever.
    Never same-day (spec: "a live generation failure must never become a
    live outage" — the week is always ready well ahead of when it's needed).
    Running this daily also means a missed fire (process restart) only ever
    costs one day of lead time, not the whole week.
    """
    from app.services.daily_quiz_service import generate_week
    today = datetime.now(UTC).date()
    result = await generate_week(db, today)
    logger.info("daily_quiz_generate_week: %s", result)
    return {"ok": True, **result}


@router.post("/daily-quiz-rollover")
async def daily_quiz_rollover(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """090_daily_quiz — daily 00:00 UTC: close yesterday's quiz, publish
    today's (if approved), push "tayyor" notification. See
    daily_quiz_service.rollover() for why this is one job, not two."""
    from app.services.daily_quiz_service import rollover
    today = datetime.now(UTC).date()
    result = await rollover(db, today)
    return {"ok": True, **result}


@router.post("/daily-quiz-reminder")
async def daily_quiz_reminder(
    db: Session = Depends(get_db),
    _: None = Depends(_require_cron_secret),
):
    """090_daily_quiz — daily 12:00 UTC: reminder push to users who haven't
    played today's quiz yet. Spec: "this reminder is where most of the
    retention comes from.\""""
    from app.services.daily_quiz_service import send_reminder_push
    today = datetime.now(UTC).date()
    result = await send_reminder_push(db, today)
    return {"ok": True, **result}
