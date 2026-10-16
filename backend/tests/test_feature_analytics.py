"""
test_feature_analytics.py — deck theme classification for the admin
"Xususiyatlar" tab (app/services/feature_analytics.py).

These are pure-function tests, no database required.
"""
import pytest

from app.services.feature_analytics import THEMES, classify_deck_theme, normalize_text


@pytest.mark.parametrize("title, expected", [
    ("IELTS Vocabulary Band 7", "ielts"),
    ("English words for IELTS", "ielts"),          # exam-prep beats the subject
    ("4000 Essential English Words", "english"),
    ("Inglizcha so'zlar", "english"),
    ("Phrasal verbs", "english"),
    ("Ruscha so'zlashuv", "russian"),
    ("Arab tili — 1-dars", "arabic"),
    ("Koreys tili TOPIK 1", "korean"),
    ("Kimyo formulalari", "chemistry"),            # earliest match wins over "formula"
    ("Matematika formulalari", "math"),
    ("Python asoslari", "programming"),
    ("Anatomiya — suyaklar", "medicine"),
    ("O'zbekiston tarixi", "history"),
    ("DTM ga tayyorgarlik", "exams"),
    ("Qur'on suralari", "religion"),
    ("Marketing asoslari", "business"),
    ("Mening kartalarim", "other"),
])
def test_title_keywords(title, expected):
    assert classify_deck_theme(title) == expected


def test_apostrophe_variants_fold():
    assert normalize_text("Oʻzbek tili") == normalize_text("O‘zbek tili") == "o'zbek tili"
    assert classify_deck_theme("Oʻzbek tili imlosi") == "uzbek"


def test_no_mid_word_matches():
    # "surat" (picture) must not read as Qur'on "sura"; "example" is not "exam".
    assert classify_deck_theme("Suratlar") == "other"
    assert classify_deck_theme("Example sentences") == "other"
    assert classify_deck_theme("Reaksiya tezligi kimyo") == "chemistry"


def test_public_category_wins_over_keywords():
    assert classify_deck_theme("Python words", category="business") == "business"
    # "other" is not a real signal — fall through to keywords.
    assert classify_deck_theme("Python words", category="other") == "programming"


def test_script_fallback_when_title_is_vague():
    assert classify_deck_theme("1-dars", scripts={"arabic": 8}, card_count=10) == "arabic"
    assert classify_deck_theme("Yangi so'zlar", scripts={"hangul": 5}, card_count=10) == "korean"
    assert classify_deck_theme("Lug'at", scripts={"cyrillic": 9}, card_count=10) == "russian"
    assert classify_deck_theme("Lug'at", scripts={"cyrillic": 2}, card_count=10) == "other"


def test_every_theme_has_label():
    for key, (label, emoji) in THEMES.items():
        assert label and emoji, key
