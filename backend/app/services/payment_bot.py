"""
payment_bot.py — messages from the pay bot when an admin acts on the web
dashboard instead of in the bot.

Buyers send their receipt to the pay bot, so it is the bot that can reach
them (some, e.g. channel buyers, never opened the main bot). When the bot
itself grants or cancels (service key, role 'bot'), it messages the buyer
itself and nothing here runs.

Env: PAYMENT_BOT_TOKEN (the pay bot's token) and SPONSOR_CHANNEL_ID
(111_sponsor_channel). Unset = nothing is sent.
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from html import escape
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

PAYMENT_BOT_TOKEN = os.getenv("PAYMENT_BOT_TOKEN", "").strip()
_raw_channel = os.getenv("SPONSOR_CHANNEL_ID", "").strip()
SPONSOR_CHANNEL_ID: Optional[int] = int(_raw_channel) if _raw_channel.lstrip("-").isdigit() else None
SUPPORT_USERNAME = os.getenv("SUPPORT_USERNAME", "@sahifalab")

# Must match the pay bot (bot/services/channel.py): its join-request handler
# revokes links whose name starts with this prefix.
LINK_PREFIX = "homiy"
LINK_TTL = timedelta(days=7)


def enabled() -> bool:
    return bool(PAYMENT_BOT_TOKEN)


async def _call(method: str, payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(f"https://api.telegram.org/bot{PAYMENT_BOT_TOKEN}/{method}", json=payload)
    data = res.json()
    if not data.get("ok"):
        raise RuntimeError(data.get("description") or f"Telegram {method} failed")
    return data["result"]


async def send_message(chat_id: int, text: str, reply_markup: Optional[dict] = None) -> None:
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        payload["reply_markup"] = reply_markup
    await _call("sendMessage", payload)


async def send_channel_invite(user_id: int) -> None:
    """A personal join-request link for the private channel. Raises when it
    can't be sent, so the admin sees why."""
    if not enabled() or SPONSOR_CHANNEL_ID is None:
        raise RuntimeError("PAYMENT_BOT_TOKEN yoki SPONSOR_CHANNEL_ID backendda sozlanmagan")

    try:
        member = await _call("getChatMember", {"chat_id": SPONSOR_CHANNEL_ID, "user_id": user_id})
        if member.get("status") in ("member", "administrator", "creator"):
            await send_message(user_id, "✅ Siz allaqachon <b>SAHIFALAB homiylari</b> kanalidasiz.")
            return
    except RuntimeError:
        pass  # not in the channel yet

    link = await _call("createChatInviteLink", {
        "chat_id": SPONSOR_CHANNEL_ID,
        "name": f"{LINK_PREFIX} {user_id}",
        "expire_date": int((datetime.now(timezone.utc) + LINK_TTL).timestamp()),
        "creates_join_request": True,
    })
    await send_message(
        user_id,
        "🔒 <b>SAHIFALAB homiylari</b> kanaliga taklif\n\n"
        "Pastdagi tugmani bosing va «Qo'shilish so'rovi»ni yuboring — "
        "bot sizni darhol qabul qiladi.\n\n"
        "⚠️ Havola faqat siz uchun: boshqa odam u orqali kira olmaydi. "
        "7 kun amal qiladi.",
        {"inline_keyboard": [[{"text": "🔒 Kanalga qo'shilish", "url": link["invite_link"]}]]},
    )


async def send_rejection(user_id: int, reason: Optional[str], product: Optional[str]) -> None:
    """Best effort: the buyer may never have opened the bot."""
    if not enabled():
        return
    next_step = (
        "Qayta urinish uchun botga /homiy yuboring."
        if product == "channel"
        else "Sahifalab ilovasidan yangi kod oling."
    )
    try:
        await send_message(
            user_id,
            "❌ <b>To'lov tasdiqlanmadi.</b>\n\n"
            + (f"Sabab: {escape(reason)}\n\n" if reason else "")
            + f"Iltimos, qaytadan urinib ko'ring yoki {SUPPORT_USERNAME} ga yozing.\n\n"
            + next_step,
        )
    except Exception as exc:
        logger.warning("payment_bot rejection DM to %s failed: %s", user_id, exc)


async def download_file(file_id: str) -> tuple[bytes, str]:
    """A file the buyer sent to the pay bot (a receipt kept as tg://file/<id>)."""
    if not enabled():
        raise RuntimeError("PAYMENT_BOT_TOKEN backendda sozlanmagan")
    info = await _call("getFile", {"file_id": file_id})
    path = info["file_path"]
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.get(f"https://api.telegram.org/file/bot{PAYMENT_BOT_TOKEN}/{path}")
    res.raise_for_status()
    media = "image/png" if path.lower().endswith(".png") else "image/jpeg"
    return res.content, media
