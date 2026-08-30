"""
payment_validation.py — server-side validation for donation payment methods
(095_donation_payment_methods). Admin input is the actual weak point here:
a wrong IBAN means a donor's money goes nowhere or somewhere else, so this
validates on WRITE, server-side, never trusting the admin UI's own checks
to have run (a direct API call must be validated identically to the form).

Card numbers get a Luhn check as a WARNING, never a block — UZCARD/Humo
(the dominant Uzbek card networks) don't universally satisfy Luhn, so
treating it as a hard rule would reject perfectly valid local cards.
"""
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

MAX_NAME_LENGTH = 40
# PaymentCard renders bank_name/holder_name on one line with ellipsis —
# warn (not block) once a name is long enough that truncation is likely.
NAME_TRUNCATION_WARNING_THRESHOLD = 26

KNOWN_CURRENCIES = {"UZS", "KRW", "EUR", "USD"}
KNOWN_REGIONS = {"uz", "kr", "intl"}
KNOWN_NUMBER_TYPES = {"card", "account", "iban"}

# IBAN country -> total IBAN length (IBAN Registry). Reject any country
# code not in this map rather than guess a length from the input itself —
# an unknown code is far more likely to be a typo than a valid new country.
IBAN_COUNTRY_LENGTHS = {
    "AD": 24, "AE": 23, "AL": 28, "AT": 20, "AZ": 28, "BA": 20, "BE": 16,
    "BG": 22, "BH": 22, "BR": 29, "BY": 28, "CH": 21, "CR": 22, "CY": 28,
    "CZ": 24, "DE": 22, "DK": 18, "DO": 28, "EE": 20, "EG": 29, "ES": 24,
    "FI": 18, "FO": 18, "FR": 27, "GB": 22, "GE": 22, "GI": 23, "GL": 18,
    "GR": 27, "GT": 28, "HR": 21, "HU": 28, "IE": 22, "IL": 23, "IQ": 23,
    "IS": 26, "IT": 27, "JO": 30, "KW": 30, "KZ": 20, "LB": 28, "LC": 32,
    "LI": 21, "LT": 20, "LU": 20, "LV": 21, "LY": 25, "MC": 27, "MD": 24,
    "ME": 22, "MK": 19, "MR": 27, "MT": 31, "MU": 30, "NL": 18, "NO": 15,
    "PK": 24, "PL": 28, "PS": 29, "PT": 25, "QA": 29, "RO": 24, "RS": 22,
    "SA": 24, "SC": 31, "SD": 18, "SE": 24, "SI": 19, "SK": 24, "SM": 27,
    "ST": 25, "SV": 28, "TL": 23, "TN": 24, "TR": 26, "UA": 29, "VA": 22,
    "VG": 24, "XK": 20,
}


@dataclass
class ValidationResult:
    ok: bool
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    normalized: dict = field(default_factory=dict)


_CONTROL_CHARS_RE = re.compile(r"[\x00-\x1f\x7f]")
_HTML_TAG_RE = re.compile(r"<[^>]*>")
_WHITESPACE_RE = re.compile(r"\s+")


def sanitize_text(value: Optional[str]) -> str:
    """Trim, collapse whitespace, strip control characters and any HTML —
    applied to every free-text admin field before it's ever stored."""
    if not isinstance(value, str):
        return ""
    value = _HTML_TAG_RE.sub("", value)
    value = _CONTROL_CHARS_RE.sub("", value)
    value = unicodedata.normalize("NFC", value)
    value = _WHITESPACE_RE.sub(" ", value).strip()
    return value


def _luhn_ok(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch)
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def validate_card(raw: str) -> ValidationResult:
    digits = re.sub(r"\s+", "", raw or "")
    errors = []
    warnings = []
    if not digits.isdigit():
        errors.append("Karta raqami faqat raqamlardan iborat bo'lishi kerak")
    # ISO/IEC 7812 PANs are 13-19 digits, not universally 16 — Diners Club
    # is 14, some Amex-family cards are 15. A hardcoded 16-19 floor rejected
    # legitimate shorter cards (found live: a 14-digit Korean card).
    elif not (13 <= len(digits) <= 19):
        errors.append("Karta raqami 13-19 ta raqamdan iborat bo'lishi kerak")
    elif not _luhn_ok(digits):
        warnings.append(
            "Karta raqami odatiy tekshiruvdan (Luhn) o'tmadi — UZCARD/Humo uchun bu "
            "normal bo'lishi mumkin, lekin raqamni qayta tekshiring"
        )
    return ValidationResult(ok=not errors, errors=errors, warnings=warnings, normalized={"account_number": digits})


def validate_account(raw: str) -> ValidationResult:
    value = (raw or "").strip()
    errors = []
    if not re.fullmatch(r"[0-9\-]+", value or ""):
        errors.append("Hisob raqami faqat raqam va chiziqchadan (-) iborat bo'lishi kerak")
    elif not (8 <= len(value) <= 30):
        errors.append("Hisob raqami 8-30 ta belgidan iborat bo'lishi kerak")
    return ValidationResult(ok=not errors, errors=errors, normalized={"account_number": value})


def _iban_checksum_ok(iban: str) -> bool:
    """mod-97 checksum (ISO 7064): move the first 4 chars to the end,
    convert letters to numbers (A=10..Z=35), and the result mod 97 must
    equal 1. Caller guarantees `iban` is already uppercase alnum."""
    rearranged = iban[4:] + iban[:4]
    digits = "".join(ch if ch.isdigit() else str(ord(ch) - ord("A") + 10) for ch in rearranged)
    return int(digits) % 97 == 1


def validate_iban(raw: str) -> ValidationResult:
    value = re.sub(r"\s+", "", raw or "").upper()
    errors = []

    if not value or not re.fullmatch(r"[A-Z0-9]+", value):
        return ValidationResult(ok=False, errors=["IBAN faqat lotin harflari va raqamlardan iborat bo'lishi kerak"])
    if not re.fullmatch(r"[A-Z]{2}[0-9]{2}[A-Z0-9]+", value):
        return ValidationResult(ok=False, errors=["IBAN formati noto'g'ri (2 harf + 2 tekshiruv raqami + hisob)"])

    country = value[:2]
    expected_len = IBAN_COUNTRY_LENGTHS.get(country)
    if expected_len is None:
        errors.append(f"Noma'lum IBAN davlat kodi: {country}")
    elif len(value) != expected_len:
        errors.append(f"{country} uchun IBAN uzunligi {expected_len} bo'lishi kerak, {len(value)} kiritildi")

    if not errors and not _iban_checksum_ok(value):
        errors.append("IBAN tekshiruv raqami (checksum) noto'g'ri — raqamni qayta tekshiring")

    return ValidationResult(ok=not errors, errors=errors, normalized={"account_number": value})


def validate_swift(raw: Optional[str]) -> ValidationResult:
    if not raw:
        return ValidationResult(ok=True, normalized={"swift": None})
    value = re.sub(r"\s+", "", raw).upper()
    if len(value) not in (8, 11) or not value.isalnum():
        return ValidationResult(ok=False, errors=["SWIFT/BIC 8 yoki 11 ta lotin harf/raqamdan iborat bo'lishi kerak"])
    return ValidationResult(ok=True, normalized={"swift": value})


def validate_account_number(number_type: str, raw: str) -> ValidationResult:
    if number_type == "card":
        return validate_card(raw)
    if number_type == "iban":
        return validate_iban(raw)
    if number_type == "account":
        return validate_account(raw)
    return ValidationResult(ok=False, errors=[f"Noma'lum number_type: {number_type}"])


def validate_display_name(value: str, field_label: str) -> ValidationResult:
    """bank_name / holder_name — sanitized, length-capped, with a
    truncation warning (not an error) once it's long enough that the
    one-line card row is likely to ellipsis it."""
    clean = sanitize_text(value)
    errors = []
    warnings = []
    if not clean:
        errors.append(f"{field_label} bo'sh bo'lishi mumkin emas")
    elif len(clean) > MAX_NAME_LENGTH:
        errors.append(f"{field_label} {MAX_NAME_LENGTH} ta belgidan oshmasligi kerak")
    elif len(clean) > NAME_TRUNCATION_WARNING_THRESHOLD:
        warnings.append(
            f"{field_label} {NAME_TRUNCATION_WARNING_THRESHOLD} ta belgidan uzun — "
            "kartada '...' bilan qisqartiriladi"
        )
    return ValidationResult(ok=not errors, errors=errors, warnings=warnings, normalized={"value": clean})
