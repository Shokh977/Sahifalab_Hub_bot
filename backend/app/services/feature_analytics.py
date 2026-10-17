"""
feature_analytics.py — shared pieces for the admin "Xususiyatlar" analytics
tab (app/api/v1/endpoints/admin_feature_analytics.py).

  - tag_source(): best-effort write of the `source` column added by
    102_feature_analytics_sources.sql. Runs in a SAVEPOINT so a missing
    column (backend deployed before the migration) can never fail the
    write it rides along with — record_study_activity() is one of the
    callers, and that path has an outage history (DEPLOY_RUNBOOK.md).
  - classify_deck_theme(): what a deck is ABOUT (English, IELTS, medicine,
    programming…). Private decks have no category, only a free-text title,
    so this is a keyword match over title/description, falling back to the
    script the cards are written in (Arabic, Hangul, kana, CJK, Cyrillic).
    Pure function — unit-tested in tests/test_feature_analytics.py.
"""
import json
import logging
import re
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


# ── Source tagging ────────────────────────────────────────────────────────────

DECK_SOURCES = ("manual", "course", "official", "clone", "ai_text", "ai_image", "ai")
SESSION_SOURCES = ("focus_timer", "flashcards")

_TAGGABLE = {"flashcard_decks": DECK_SOURCES, "focus_sessions": SESSION_SOURCES}


def tag_source(db: Session, table: str, row_id: Optional[int], source: str) -> None:
    """UPDATE <table>.source for one row inside a SAVEPOINT. Never raises:
    a failure only rolls back the savepoint, leaving the caller's
    transaction (and the row it just inserted) intact."""
    if table not in _TAGGABLE or source not in _TAGGABLE[table]:
        raise ValueError(f"untaggable {table}.source={source!r}")
    if row_id is None:
        return
    try:
        with db.begin_nested():
            db.execute(text(f"UPDATE {table} SET source = :src WHERE id = :id"), {"src": source, "id": int(row_id)})
    except Exception:
        logger.warning("tag_source skipped for %s id=%s (migration 102 applied?)", table, row_id, exc_info=True)


def record_event(
    db: Session, event_type: str, actor_id: int, meta: Optional[dict] = None, target_id: int = 0,
) -> None:
    """Server-side analytics_events row (034_analytics_events) for facts only
    the server knows — e.g. which input an AI generation used. Best-effort in
    a SAVEPOINT; never raises into the request."""
    try:
        with db.begin_nested():
            db.execute(
                text("""
                    INSERT INTO analytics_events (event_type, actor_id, target_id, teacher_id, source, meta)
                    VALUES (:et, :actor, :target, 0, 'direct', CAST(:meta AS jsonb))
                """),
                {"et": event_type, "actor": int(actor_id), "target": int(target_id),
                 "meta": json.dumps({"surface": "server", **(meta or {})})},
            )
    except Exception:
        logger.warning("record_event %s skipped", event_type, exc_info=True)


# ── Deck theme classification ─────────────────────────────────────────────────

# key -> (label, emoji). Display order only; how a deck is matched is
# _PRIORITY_PATTERN / _THEME_PATTERNS below.
THEMES: dict[str, tuple[str, str]] = {
    # No flag emoji: Windows (where the admin panel is mostly opened) renders
    # them as bare letters ("KR").
    "english":     ("Ingliz tili",            "🔤"),
    "ielts":       ("IELTS / CEFR / SAT",     "🎯"),
    "russian":     ("Rus tili",               "🪆"),
    "arabic":      ("Arab tili",              "🕌"),
    "korean":      ("Koreys tili",            "🥢"),
    "turkish":     ("Turk tili",              "🧿"),
    "german":      ("Nemis tili",             "🥨"),
    "chinese":     ("Xitoy tili",             "🀄"),
    "japanese":    ("Yapon tili",             "🗾"),
    "other_lang":  ("Boshqa chet tillari",    "🌍"),
    "uzbek":       ("Ona tili / adabiyot",    "📖"),
    "math":        ("Matematika",             "➗"),
    "physics":     ("Fizika",                 "⚛️"),
    "chemistry":   ("Kimyo",                  "🧪"),
    "biology":     ("Biologiya",              "🧬"),
    "medicine":    ("Tibbiyot",               "🩺"),
    "history":     ("Tarix",                  "🏛️"),
    "geography":   ("Geografiya",             "🗺️"),
    "programming": ("Dasturlash / IT",        "💻"),
    "business":    ("Biznes / iqtisod",       "💼"),
    "law":         ("Huquq",                  "⚖️"),
    "religion":    ("Din / Qur'on",           "📿"),
    "exams":       ("Abituriyent / imtihon",  "📝"),
    "other":       ("Boshqa / aniqlanmagan",  "🗂️"),
}

# Public decks carry an explicit category (flashcards.py::_CATEGORIES) —
# trusted over keywords, except "other".
_CATEGORY_TO_THEME = {
    "english": "english", "ielts": "ielts", "business": "business",
    "arabic": "arabic", "programming": "programming", "medical": "medicine",
}

# Prefix-anchored (no letter right before the match) so Uzbek suffixes still
# match ("ruscha", "matematikadan") but mid-word hits don't ("kursus").
_L = r"(?<![a-zа-яёўқғҳ'])"


def _rx(*alternatives: str) -> re.Pattern:
    return re.compile(_L + "(?:" + "|".join(alternatives) + ")", re.IGNORECASE)


# Exam-prep beats the subject it tests: "IELTS vocabulary" is IELTS, not English.
_PRIORITY_PATTERN = ("ielts", _rx(r"ielts", r"toefl", r"cefr", r"duolingo", r"sat(?![a-z'])", r"multilevel",
                                  r"gre(?![a-z'])", r"gmat"))

# Everything else: the EARLIEST match in the text wins ("Kimyo formulalari"
# is chemistry, not maths), ties broken by list order.
_THEME_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("english",    _rx(r"ingliz", r"english", r"inglis", r"vocab", r"phrasal", r"idiom", r"grammar", r"essential words?",
                        r"words?(?![a-z'])", r"irregular verbs?", r"present (?:simple|perfect|continuous)", r"англ")),
    ("russian",     _rx(r"rus(?:cha|\s*til|sian|ski)", r"русск", r"рус(?:ча|\s*тил)", r"russkiy")),
    ("arabic",      _rx(r"arab", r"nahv", r"sarf(?![a-z'])", r"عرب")),
    ("korean",      _rx(r"kore(?:ys|an|ya)", r"topik", r"hangul", r"한국")),
    ("turkish",     _rx(r"turk(?:cha|\s*til|ish|ce)", r"türk")),
    ("german",      _rx(r"nemis", r"german", r"deutsch", r"goethe")),
    ("chinese",     _rx(r"xitoy", r"chinese", r"hsk", r"mandarin", r"中文", r"汉语")),
    ("japanese",    _rx(r"yapon", r"japan", r"jlpt", r"hiragana", r"katakana", r"kanji", r"日本")),
    ("other_lang",  _rx(r"fransuz", r"french", r"ispan", r"spanish", r"italyan", r"italian", r"fors\s*til", r"persian", r"hind\s*til")),
    ("programming", _rx(r"python", r"javascript", r"typescript", r"java(?![a-z'])", r"c\+\+", r"dasturla", r"programm",
                        r"coding", r"sql(?![a-z'])", r"html", r"css(?![a-z'])", r"react(?:js)?(?![a-z'])", r"algorit",
                        r"frontend", r"backend", r"linux", r"git(?![a-z'])", r"kompyuter", r"computer", r"informatika",
                        r"excel(?![a-z'])")),
    ("medicine",    _rx(r"tibb", r"medic", r"anatom", r"farmak", r"pharm", r"fiziolog", r"patolog", r"usmle",
                        r"hamshira", r"nurs", r"stomatolog", r"klinik", r"clinical", r"dori")),
    ("math",        _rx(r"matem", r"math", r"algebra", r"geometr", r"trigonometr", r"tenglama", r"integral",
                        r"hosila", r"formula", r"arifmet")),
    ("physics",     _rx(r"fizika", r"physics", r"mexanika", r"optika", r"elektr")),
    ("chemistry",   _rx(r"kimyo", r"chemi", r"organik", r"organic", r"химия")),
    ("biology",     _rx(r"biolog", r"botanik", r"zoolog", r"genetik", r"hujayra", r"биолог")),
    ("history",     _rx(r"tarix", r"history", r"historical", r"история", r"тарих")),
    ("geography",   _rx(r"geograf", r"geography", r"poytaxt", r"capitals?(?![a-z'])", r"davlatlar")),
    ("business",    _rx(r"biznes", r"business", r"marketing", r"iqtisod", r"econom", r"moliya", r"financ",
                        r"buxgalter", r"accounting", r"menejment", r"management", r"startap", r"startup",
                        r"invest", r"sotuv", r"sales")),
    ("law",         _rx(r"huquq", r"law(?![a-z'])", r"qonun", r"legal", r"konstitutsiya", r"kodeks")),
    ("religion",    _rx(r"qur'?on", r"quran", r"islom", r"islam", r"hadis", r"hadith", r"namoz", r"tajvid",
                        r"fiqh", r"aqida", r"sura(?:lar)?(?![a-z'])")),
    ("uzbek",       _rx(r"ona\s*til", r"o'zbek\s*til", r"uzbek", r"imlo", r"adabiyot", r"literature", r"she'r")),
    ("exams",       _rx(r"dtm", r"abituriyent", r"abiturient", r"imtihon", r"attestat", r"olimpiada",
                        r"milliy\s*sertifikat", r"bmba", r"exams?(?![a-z'])")),
]

# Uzbek writes the apostrophe in o'/g' several ways; fold them to one.
_APOSTROPHES = str.maketrans({"ʻ": "'", "ʼ": "'", "‘": "'", "’": "'", "`": "'", "´": "'"})


def normalize_text(*parts: Optional[str]) -> str:
    return " ".join(p for p in parts if p).translate(_APOSTROPHES).lower()


def classify_deck_theme(
    title: Optional[str],
    description: Optional[str] = None,
    category: Optional[str] = None,
    scripts: Optional[dict[str, int]] = None,
    card_count: int = 0,
) -> str:
    """Theme key for one deck. Priority: explicit public category → title/
    description keywords → dominant non-Latin script of the card fronts →
    "other". `scripts` holds per-script counts of cards whose front_text
    contains that script (keys: arabic, hangul, kana, cjk, cyrillic)."""
    mapped = _CATEGORY_TO_THEME.get((category or "").lower())
    if mapped:
        return mapped

    haystack = normalize_text(title, description)
    if haystack:
        if _PRIORITY_PATTERN[1].search(haystack):
            return _PRIORITY_PATTERN[0]
        best: Optional[tuple[int, int, str]] = None
        for rank, (key, pattern) in enumerate(_THEME_PATTERNS):
            m = pattern.search(haystack)
            if m and (best is None or (m.start(), rank) < best[:2]):
                best = (m.start(), rank, key)
        if best:
            return best[2]

    if scripts and card_count > 0:
        share = {k: (v or 0) / card_count for k, v in scripts.items()}
        if share.get("arabic", 0) >= 0.3:
            return "arabic"
        if share.get("hangul", 0) >= 0.3:
            return "korean"
        if share.get("kana", 0) >= 0.3:
            return "japanese"
        if share.get("cjk", 0) >= 0.3:
            return "chinese"
        if share.get("cyrillic", 0) >= 0.5:
            return "russian"
    return "other"


def theme_label(key: str) -> tuple[str, str]:
    return THEMES.get(key, THEMES["other"])
