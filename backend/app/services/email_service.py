"""
email_service.py — Transactional emails via Sender.net API.

Requires SENDER_API_KEY env var (from Sender.net → API access tokens).
Domain sahifalab.uz must be verified in Sender.net → Domains.
"""
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

SENDER_API_URL = "https://api.sender.net/v2/emails"
FROM_EMAIL     = "info@sahifalab.uz"
FROM_NAME      = "Sahifalab"

_CARD_STYLE = (
    'background-color:#1c1d27;border-radius:16px;padding:32px 24px;'
    'border:1px solid rgba(255,255,255,0.06);'
)
_BTN_STYLE = (
    'display:inline-block;background-color:#e8792f;color:#ffffff;'
    'text-decoration:none;padding:14px 32px;border-radius:10px;'
    'font-size:15px;font-weight:600;'
)
_BODY_STYLE = (
    'margin:0;padding:0;background-color:#13141a;'
    "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;"
)


def _base_template(card_html: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="{_BODY_STYLE}">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:1px;">
        SAHIFALAB
      </span>
    </div>
    <div style="{_CARD_STYLE}">
      {card_html}
    </div>
    <div style="text-align:center;margin-top:24px;">
      <p style="color:rgba(255,255,255,0.25);font-size:12px;">
        &copy; Sahifalab &mdash; Professional learning workspace
      </p>
    </div>
  </div>
</body>
</html>"""


def _send(to_email: str, to_name: str, subject: str, html: str) -> bool:
    """Send email via Sender.net REST API. Returns True on success."""
    api_key = settings.SENDER_API_KEY
    if not api_key:
        logger.warning("SENDER_API_KEY not configured — email not sent to %s", to_email)
        return False

    payload = {
        "from": {"email": FROM_EMAIL, "name": FROM_NAME},
        "to":   [{"email": to_email, "name": to_name or to_email}],
        "subject": subject,
        "html": html,
    }
    try:
        resp = httpx.post(
            SENDER_API_URL,
            json=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
                "Accept":        "application/json",
            },
            timeout=15.0,
        )
        if resp.status_code not in (200, 201, 202):
            logger.error("Sender.net error %s: %s", resp.status_code, resp.text[:300])
            return False
        return True
    except Exception as exc:
        logger.error("Sender.net request failed: %s", exc)
        return False


def send_verification_email(to: str, user_name: str, token: str) -> bool:
    verify_url = f"{settings.APP_URL}/auth/verify-email?token={token}"
    card = f"""
      <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;">
        Assalomu alaykum, {user_name}!
      </h1>
      <p style="color:rgba(255,255,255,0.65);font-size:15px;line-height:1.6;margin:0 0 24px;">
        Sahifalab'ga xush kelibsiz! Email manzilingizni tasdiqlash uchun quyidagi tugmani bosing:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="{verify_url}" style="{_BTN_STYLE}">Email'ni tasdiqlash</a>
      </div>
      <p style="color:rgba(255,255,255,0.35);font-size:13px;line-height:1.5;margin:24px 0 0;">
        Agar tugma ishlamasa:<br>
        <a href="{verify_url}" style="color:#e8792f;word-break:break-all;">{verify_url}</a>
      </p>
      <p style="color:rgba(255,255,255,0.25);font-size:12px;margin:20px 0 0;">
        Bu havola 24 soat ichida amal qiladi.
      </p>
    """
    return _send(to, user_name, "Sahifalab — Email manzilingizni tasdiqlang", _base_template(card))


def send_password_reset_email(to: str, user_name: str, token: str) -> bool:
    reset_url = f"{settings.APP_URL}/auth/reset-password?token={token}"
    card = f"""
      <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 8px;">
        Parolni tiklash
      </h1>
      <p style="color:rgba(255,255,255,0.65);font-size:15px;line-height:1.6;margin:0 0 24px;">
        {user_name}, siz parolni tiklashni so'radingiz. Yangi parol o'rnatish uchun
        quyidagi tugmani bosing:
      </p>
      <div style="text-align:center;margin:24px 0;">
        <a href="{reset_url}" style="{_BTN_STYLE}">Yangi parol o'rnatish</a>
      </div>
      <p style="color:rgba(255,255,255,0.35);font-size:13px;line-height:1.5;margin:24px 0 0;">
        Agar tugma ishlamasa:<br>
        <a href="{reset_url}" style="color:#e8792f;word-break:break-all;">{reset_url}</a>
      </p>
      <p style="color:rgba(255,255,255,0.25);font-size:12px;margin:20px 0 0;">
        Bu havola 1 soat ichida amal qiladi.
      </p>
    """
    return _send(to, user_name, "Sahifalab — Parolni tiklash", _base_template(card))


def send_welcome_email(to: str, user_name: str) -> bool:
    feed_url = f"{settings.APP_URL}/feed"
    card = f"""
      <h1 style="color:#ffffff;font-size:20px;font-weight:700;margin:0 0 16px;">
        Tabriklaymiz, {user_name}!
      </h1>
      <p style="color:rgba(255,255,255,0.65);font-size:15px;line-height:1.6;">
        Sahifalab'ga muvaffaqiyatli qo'shildingiz. Endi siz:
      </p>
      <ul style="color:rgba(255,255,255,0.65);font-size:14px;line-height:1.8;padding-left:20px;">
        <li>Professional kurslarga yozilishingiz</li>
        <li>XP to'plashingiz va daraja oshirishingiz</li>
        <li>Mutaxassislar bilan bog'lanishingiz</li>
        <li>Ish o'rinlarini topishingiz mumkin</li>
      </ul>
      <div style="text-align:center;margin:24px 0;">
        <a href="{feed_url}" style="{_BTN_STYLE}">Boshlash</a>
      </div>
    """
    return _send(to, user_name, "Sahifalab'ga xush kelibsiz!", _base_template(card))
