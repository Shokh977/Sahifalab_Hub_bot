"""
email_service.py — Transactional emails via Resend.

All emails use the Sahifalab design system:
  BG:    #13141a (page) / #1c1d27 (card)
  Brand: #e8792f (orange)
  Text:  #fff (primary) / rgba(255,255,255,0.65) (secondary)
"""
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

FROM_EMAIL = "Sahifalab <noreply@sahifalab.com>"


def _get_client():
    """Lazily import resend so the app still boots without it configured."""
    try:
        import resend
        if not settings.RESEND_API_KEY:
            return None
        resend.api_key = settings.RESEND_API_KEY
        return resend
    except ImportError:
        logger.warning("resend package not installed — email sending disabled")
        return None


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


def send_verification_email(to: str, user_name: str, token: str) -> bool:
    """Send email-verification link. Returns True on success."""
    resend = _get_client()
    if not resend:
        logger.warning("Email not sent (Resend not configured): verification for %s", to)
        return False

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
    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [to],
            "subject": "Sahifalab — Email manzilingizni tasdiqlang",
            "html": _base_template(card),
        })
        return True
    except Exception as exc:
        logger.error("send_verification_email failed for %s: %s", to, exc)
        return False


def send_password_reset_email(to: str, user_name: str, token: str) -> bool:
    """Send password-reset link. Returns True on success."""
    resend = _get_client()
    if not resend:
        logger.warning("Email not sent (Resend not configured): reset for %s", to)
        return False

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
        Bu havola 1 soat ichida amal qiladi. Agar siz bu so'rovni
        yubormagan bo'lsangiz, bu xabarni e'tiborsiz qoldiring.
      </p>
    """
    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [to],
            "subject": "Sahifalab — Parolni tiklash",
            "html": _base_template(card),
        })
        return True
    except Exception as exc:
        logger.error("send_password_reset_email failed for %s: %s", to, exc)
        return False


def send_welcome_email(to: str, user_name: str) -> bool:
    """Send welcome email after successful verification. Returns True on success."""
    resend = _get_client()
    if not resend:
        return False

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
    try:
        resend.Emails.send({
            "from": FROM_EMAIL,
            "to": [to],
            "subject": "Sahifalab'ga xush kelibsiz!",
            "html": _base_template(card),
        })
        return True
    except Exception as exc:
        logger.error("send_welcome_email failed for %s: %s", to, exc)
        return False
