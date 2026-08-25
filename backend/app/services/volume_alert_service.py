"""
volume_alert_service.py — standing alert: if daily focus_sessions insert
volume drops more than 50% day-over-day, page the admins immediately.

The prior outage ran undetected for three days because nothing was watching
this number. This closes that gap with the cheapest mechanism already
proven live in this codebase — a direct Telegram message to
ADMIN_TELEGRAM_IDS (same channel flashcards.py's moderation alerts and
wallet payout requests already use), not a new paging vendor integration.

If this project later adopts PagerDuty/OpsGenie/Slack, swap _notify_admins'
transport — the drop-detection query and threshold stay the same.
"""
import logging

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

DROP_THRESHOLD_PCT = 50  # page if today's volume is more than this % below yesterday's


async def _page_admins(message: str) -> None:
    import httpx
    from app.core.config import settings

    admin_ids: list[int] = settings.ADMIN_TELEGRAM_IDS or []
    bot_token: str = settings.TELEGRAM_BOT_TOKEN
    if not bot_token or not admin_ids:
        logger.critical("VOLUME ALERT (no admin channel configured, logging only): %s", message)
        return

    for chat_id in admin_ids:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
                )
        except Exception:
            logger.error("Failed to page admin %s with volume alert", chat_id, exc_info=True)


def check_focus_sessions_volume(db: Session) -> dict:
    """Compares yesterday's (UTC) focus_sessions count to the day before.
    Returns {yesterday, day_before, drop_pct, alert}."""
    row = db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE session_date = CURRENT_DATE - 1) AS yesterday,
            COUNT(*) FILTER (WHERE session_date = CURRENT_DATE - 2) AS day_before
        FROM focus_sessions
        WHERE session_date >= CURRENT_DATE - 2
    """)).fetchone()

    yesterday = int(row.yesterday or 0)
    day_before = int(row.day_before or 0)

    if day_before == 0:
        return {"yesterday": yesterday, "day_before": day_before, "drop_pct": None, "alert": False}

    drop_pct = round(100 * (day_before - yesterday) / day_before, 1)
    alert = drop_pct >= DROP_THRESHOLD_PCT

    return {"yesterday": yesterday, "day_before": day_before, "drop_pct": drop_pct, "alert": alert}


async def run_daily_volume_check(db: Session) -> dict:
    result = check_focus_sessions_volume(db)
    if result["alert"]:
        message = (
            "🔴 <b>focus_sessions volume alert</b>\n\n"
            f"Yesterday: {result['yesterday']} sessions\n"
            f"Day before: {result['day_before']} sessions\n"
            f"Drop: {result['drop_pct']}%\n\n"
            "This is the same signature as the prior 3-day silent outage. "
            "Check /api/focus/complete and record_study_activity() first."
        )
        logger.critical("Daily focus_sessions volume drop alert: %s", result)
        await _page_admins(message)
    return result
