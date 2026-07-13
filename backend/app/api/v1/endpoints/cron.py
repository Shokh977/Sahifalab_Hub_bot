"""
cron.py — Scheduled / internal maintenance endpoints.

Routes (secret-key protected, NOT JWT):
  POST /api/cron/weekly-reset                — reset profile_views_week for all users
  POST /api/cron/weekly-report               — send weekly study report push notifications
  POST /api/cron/streak-reminder             — send daily streak reminder to users who haven't studied today
  POST /api/cron/expire-pending-enrollments  — mark stale awaiting_payment/paid rows as expired
  POST /api/cron/challenges-tick             — Musobaqalar: status transitions + notification cadence

Authentication: CRON_SECRET env var must be provided in X-Cron-Secret header.
Configure Railway cron jobs:
    POST /api/cron/weekly-reset                — schedule: 0 0 * * 1   (Monday 00:00 UTC)
    POST /api/cron/weekly-report               — schedule: 0 8 * * 1   (Monday 08:00 UTC)
    POST /api/cron/streak-reminder             — schedule: 0 15 * * *  (Daily 15:00 UTC = ~20:00 Tashkent)
    POST /api/cron/expire-pending-enrollments  — schedule: 0 * * * *   (Every hour)
    POST /api/cron/challenges-tick             — schedule: 0 * * * *   (Every hour)
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
      - Have NOT completed a focus session today
      - Have streak notifications enabled (or preference not set)
      - Have an Expo push token registered

    Schedule: 0 15 * * *  (daily 15:00 UTC ≈ 20:00 Tashkent time)
    """
    today = datetime.now(UTC).date()

    rows = db.execute(text("""
        SELECT
            p.telegram_id,
            p.first_name,
            p.streak_days,
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
            AND p.telegram_id NOT IN (
                SELECT DISTINCT user_id
                FROM focus_sessions
                WHERE session_date = :today
            )
    """), {"today": today}).fetchall()

    if not rows:
        return {"ok": True, "sent": 0, "eligible": 0}

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
        text("UPDATE challenges SET status = 'ended' WHERE status = 'active' AND ends_at <= :now RETURNING id, title"),
        {"now": now},
    ).fetchall()
    db.commit()
    results["ended"] = len(ended)

    for ch in ended:
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

        # Warm, non-punitive summary to non-completers — ONE message, ever.
        # Nothing is lost, nothing is shamed.
        non_completers = db.execute(
            text("""
                SELECT user_id, progress_value FROM challenge_participants
                WHERE challenge_id = :cid AND completed_at IS NULL AND NOT end_notified
            """),
            {"cid": ch.id},
        ).fetchall()
        for p in non_completers:
            asyncio.create_task(send_notification(
                p.user_id, "challenge_ended", category="SYSTEM",
                meta={"challenge_id": str(ch.id), "title": ch.title, "progress_value": p.progress_value},
            ))
        db.execute(
            text("UPDATE challenge_participants SET end_notified = TRUE WHERE challenge_id = :cid AND completed_at IS NULL"),
            {"cid": ch.id},
        )
        db.commit()
        results["end_notified"] += len(non_completers)

    # ── 3. Midpoint + final-stretch nudges for currently-active challenges ──
    active_challenges = db.execute(
        text("SELECT id, title, starts_at, ends_at, target_value FROM challenges WHERE status = 'active'"),
    ).fetchall()

    for ch in active_challenges:
        total_window = (ch.ends_at - ch.starts_at).total_seconds()
        elapsed       = (now - ch.starts_at).total_seconds()
        pct_elapsed   = (elapsed / total_window) if total_window > 0 else 1.0
        days_left     = (ch.ends_at - now).days

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
            min_progress = round(ch.target_value * 0.25)
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

    logger.info("challenges_tick: %s", results)
    return {"ok": True, **results}
