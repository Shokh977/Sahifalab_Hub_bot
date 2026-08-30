"""
test_payment_validation.py — donation feature (095_donation_payment_methods).
Pure-function tests, no DB needed — validation must be correct in isolation
before it's ever wired to a write path.
"""
from app.services.payment_validation import (
    validate_card, validate_account, validate_iban, validate_swift,
    validate_display_name, sanitize_text,
)


# ── IBAN — real, well-known test vectors ────────────────────────────────────

def test_iban_accepts_valid_german_iban():
    result = validate_iban("DE89 3704 0044 0532 0130 00")
    assert result.ok, result.errors
    assert result.normalized["account_number"] == "DE89370400440532013000"


def test_iban_accepts_valid_uk_iban():
    result = validate_iban("GB29 NWBK 6016 1331 9268 19")
    assert result.ok, result.errors


def test_iban_accepts_valid_french_iban():
    result = validate_iban("FR14 2004 1010 0505 0001 3M02 606")
    assert result.ok, result.errors


def test_iban_rejects_bad_checksum():
    # Last two digits of a valid German IBAN flipped -> checksum must fail.
    result = validate_iban("DE90370400440532013000")
    assert not result.ok
    assert any("tekshiruv" in e for e in result.errors)


def test_iban_rejects_wrong_length_for_country():
    result = validate_iban("DE8937040044053201300")  # one char short
    assert not result.ok
    assert any("uzunligi" in e for e in result.errors)


def test_iban_rejects_unknown_country_code():
    result = validate_iban("ZZ89370400440532013000")
    assert not result.ok
    assert any("davlat kodi" in e for e in result.errors)


def test_iban_rejects_non_alnum_garbage():
    result = validate_iban("not-an-iban-at-all!!!")
    assert not result.ok


def test_iban_normalizes_lowercase_and_spaces():
    result = validate_iban("de89 3704 0044 0532 0130 00")
    assert result.ok
    assert result.normalized["account_number"] == "DE89370400440532013000"


# ── Card — length + Luhn-as-warning ─────────────────────────────────────────

def test_card_accepts_valid_luhn_16_digit():
    # 4532015112830366 is a well-known Luhn-valid test card number.
    result = validate_card("4532 0151 1283 0366")
    assert result.ok
    assert result.warnings == []
    assert result.normalized["account_number"] == "4532015112830366"


def test_card_warns_but_does_not_block_on_luhn_failure():
    """UZCARD/Humo don't universally satisfy Luhn — this must be a warning,
    never a rejection, per the spec's explicit non-negotiable."""
    result = validate_card("1234567890123456")  # correct length, fails Luhn
    assert result.ok, "a Luhn failure must never make the card invalid"
    assert result.warnings, "a Luhn failure must still be surfaced as a warning"


def test_card_rejects_wrong_length():
    result = validate_card("123456789012")  # 12 digits, too short
    assert not result.ok


def test_card_rejects_non_digit_characters():
    result = validate_card("4532-0151-1283-0366")
    assert not result.ok


def test_card_strips_spaces_before_validating():
    result = validate_card("4532 0151 1283 0366 1")  # 17 digits with spaces
    assert result.ok
    assert result.normalized["account_number"] == "45320151128303661"


# ── Account — digits + hyphens, 8-30 chars ──────────────────────────────────

def test_account_accepts_digits_and_hyphens():
    result = validate_account("1234-5678-9012")
    assert result.ok


def test_account_rejects_letters():
    result = validate_account("ACC12345678")
    assert not result.ok


def test_account_rejects_too_short():
    result = validate_account("1234567")  # 7 chars
    assert not result.ok


def test_account_rejects_too_long():
    result = validate_account("1" * 31)
    assert not result.ok


# ── SWIFT ────────────────────────────────────────────────────────────────

def test_swift_accepts_8_char_code():
    result = validate_swift("NBAAUZ22")
    assert result.ok
    assert result.normalized["swift"] == "NBAAUZ22"


def test_swift_accepts_11_char_code():
    result = validate_swift("DEUTDEFF500")
    assert result.ok


def test_swift_rejects_wrong_length():
    result = validate_swift("ABC123")
    assert not result.ok


def test_swift_none_is_valid_since_optional():
    result = validate_swift(None)
    assert result.ok
    assert result.normalized["swift"] is None


# ── Text sanitization / display names ──────────────────────────────────────

def test_sanitize_text_strips_html_and_control_chars():
    dirty = "  Xalq  Banki<script>alert(1)</script>\x00\x1f  "
    clean = sanitize_text(dirty)
    assert "<script>" not in clean
    assert "\x00" not in clean
    assert clean == "Xalq Bankialert(1)"


def test_display_name_rejects_empty():
    result = validate_display_name("   ", "Bank nomi")
    assert not result.ok


def test_display_name_rejects_over_max_length():
    result = validate_display_name("A" * 41, "Bank nomi")
    assert not result.ok


def test_display_name_warns_past_truncation_threshold_but_is_valid():
    name = "A" * 30  # over 26, under 40
    result = validate_display_name(name, "Bank nomi")
    assert result.ok
    assert result.warnings, "should warn that this will be truncated on the card"


def test_display_name_short_name_has_no_warning():
    result = validate_display_name("Xalq Banki", "Bank nomi")
    assert result.ok
    assert result.warnings == []
