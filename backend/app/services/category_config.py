"""
category_config.py — the "5 Savol" categories and weekly rotation
(5-savol-expanded-categories spec), both configurable without a deploy via
app_config, same mechanism as tanga_earning (config_service.get_config).

Two app_config keys:
  - daily_quiz_categories_v2 — the category list (DEFAULT_CATEGORIES shape).
  - daily_quiz_rotation      — which category runs on which weekday, in
                               alternating A/B weeks (DEFAULT_ROTATION shape).

The categories key is deliberately NOT the old `daily_quiz_categories`: that
key held the 5-category weighted mix, and an existing row under it would
otherwise silently shadow the 16 new defaults.

Each category carries:
  - tag_prefix  — prefixed onto every concept tag (etymology_al_khwarizmi),
                  so the 120-day concept block works per category.
  - sub_topics  — each generation call passes ONE of these, not the whole
                  category; usage is tracked per sub-topic (daily_quizzes.
                  sub_topic) and the least-recently-used one is picked.
  - examples    — (question, answer) pairs shown to the generator.
  - curated     — routes to the curated_facts formatter instead of freeform
                  generation. All False: the spec marks ozbek_adabiyoti,
                  tarix_meros and keng_xato as curated-only, but the curated
                  bank has never been seeded and the owner chose to keep
                  them automatic (same call as the Sep 13 change). The
                  hallucination risk for those three is accepted, not
                  eliminated; the machinery stays in place to flip back.
"""
import logging
from datetime import date, timedelta
from typing import Any

from sqlalchemy.orm import Session

from app.services.config_service import get_config

logger = logging.getLogger(__name__)

CATEGORIES_CONFIG_KEY = "daily_quiz_categories_v2"
ROTATION_CONFIG_KEY = "daily_quiz_rotation"

DEFAULT_CATEGORIES: list[dict[str, Any]] = [
    {
        "key": "soz_tarixi", "label": "So'z tarixi", "tag_prefix": "etymology", "curated": False,
        "brief": (
            "har kuni ishlatiladigan so'zlarning kutilmagan kelib chiqishi — javob so'z "
            "kelib chiqqan manba (shaxs, joy, til yoki asl so'z) bo'lsin"
        ),
        "sub_topics": [
            "arab tilidan kirgan so'zlar",
            "fors tilidan kirgan so'zlar",
            "rus tili orqali kirgan so'zlar",
            "turkiy tillardan dunyo tillariga o'tgan so'zlar",
            "joy nomlarining kelib chiqishi",
            "oy va hafta kunlari nomlarining kelib chiqishi",
            "Markaziy Osiyo olimlari nomidan kelib chiqqan ilmiy so'zlar",
            "taom va ichimlik nomlarining kelib chiqishi",
            "brend nomidan umumiy so'zga aylangan so'zlar",
            "odam ismidan kelib chiqqan so'zlar",
            "hayvon va o'simlik nomlarining kelib chiqishi",
            "kiyim-kechak nomlarining kelib chiqishi",
        ],
        "examples": [
            ["\"Algoritm\" so'zi kimning ismidan kelib chiqqan?", "Al-Xorazmiy"],
            ["\"Algebra\" qaysi arabcha so'zdan olingan?", "al-jabr"],
        ],
    },
    {
        "key": "ixtirolar", "label": "Ixtirolar va tasodiflar", "tag_prefix": "invention", "curated": False,
        "brief": "ixtirolar va kashfiyotlar qanday paydo bo'lgani — ayniqsa tasodifan topilganlari",
        "sub_topics": [
            "tasodifiy kashfiyotlar",
            "tabiatdan ilhomlangan ixtirolar",
            "urush davrida paydo bo'lgan ixtirolar",
            "avval muvaffaqiyatsiz bo'lib, keyin ommalashgan mahsulotlar",
            "tibbiyotdagi kashfiyotlar",
            "uy-ro'zg'or buyumlari",
            "transport ixtirolari",
            "yangi materiallar",
            "oziq-ovqat ixtirolari",
            "o'yinchoqlar va o'yinlar",
        ],
        "examples": [
            ["Mikroto'lqinli pech qanday kashf etilgan?", "Olimning cho'ntagidagi shokolad erib ketgan"],
            ["Velkro (yopishqoq tasma) nimadan ilhomlangan?", "O'simlik urug'ining kiyimga yopishishi"],
        ],
    },
    {
        "key": "nega_shunday", "label": "Nega shunday?", "tag_prefix": "why", "curated": False,
        "brief": "kundalik narsalar nega aynan shunday ekani — sababini so'ra",
        "sub_topics": [
            "do'kon va narx dizayni",
            "yo'l va harakat odatlari",
            "qadoq shakllari",
            "kiyim detallari",
            "bino dizayni",
            "rang odatlari",
            "standart o'lchamlar",
            "vaqt odatlari",
            "klaviatura va texnika odatlari",
            "sport qoidalari",
        ],
        "examples": [
            ["Nega do'konlarda narxlar 9 bilan tugaydi?", "Miya birinchi raqamga ko'proq e'tibor beradi"],
            ["Nega tangalar chetida tishchalar bor?", "Qimmatbaho metallni qirqib olishning oldini olish uchun"],
        ],
    },
    {
        "key": "tabiat", "label": "Tabiat va hayvonlar", "tag_prefix": "nature", "curated": False,
        "brief": "hayvonlar va tabiat haqidagi hayratlanarli faktlar",
        "sub_topics": [
            "hayvonlarning sezgi a'zolari",
            "omon qolish uchun moslashuvlar",
            "o'simliklar",
            "hasharotlar",
            "okean hayoti",
            "migratsiya",
            "simbioz — turlarning hamkorligi",
            "ekstremal muhitlarda hayot",
            "hayvonlar muloqoti",
            "uyqu va qishki uyqu",
        ],
        "examples": [
            ["Asal qancha vaqtdan keyin buziladi?", "Buzilmaydi"],
            ["Sakkizoyoqda nechta yurak bor?", "3 ta"],
        ],
    },
    {
        "key": "inson_tanasi", "label": "Inson tanasi", "tag_prefix": "body", "curated": False,
        "brief": "inson tanasi haqidagi qiziq faktlar — tibbiy atamalar emas",
        "sub_topics": [
            "sezgi a'zolari",
            "uyqu",
            "suyaklar va mushaklar",
            "teri va soch",
            "hazm qilish",
            "qon va yurak",
            "reflekslar",
            "o'sish va rivojlanish",
            "ko'z va ko'rish",
            "ovoz va eshitish",
        ],
        "examples": [],
    },
    {
        "key": "kosmos", "label": "Kosmos", "tag_prefix": "space", "curated": False,
        "brief": "kosmos haqidagi kutilmagan faktlar",
        "sub_topics": [
            "sayyoralar",
            "Oy",
            "Quyosh",
            "tortishish kuchi",
            "masofa va o'lchamlar",
            "kosmosni o'rganish tarixi",
            "yulduzlar",
            "kosmosda vaqt",
            "kosmonavtlarning kundalik hayoti",
            "kometa va asteroidlar",
        ],
        "examples": [
            ["Veneradagi bir kun u yerdagi bir yildan uzunmi?", "Ha"],
        ],
    },
    {
        "key": "geografiya", "label": "Jahon geografiyasi", "tag_prefix": "geo", "curated": False,
        "brief": "kutilmagan geografik faktlar — poytaxtni eslash savollari taqiqlangan",
        "sub_topics": [
            "chegaralar va anklavlar",
            "daryolar va ko'llar",
            "cho'llar",
            "orollar",
            "ekstremal joylar",
            "dengizga chiqishi yo'q davlatlar",
            "vaqt mintaqalari",
            "davlatlarning shakli",
            "tog'lar",
            "shahar va davlat nomlari",
        ],
        "examples": [],
    },
    {
        "key": "tarixiy_taqqoslash", "label": "Tarixiy taqqoslashlar", "tag_prefix": "timecmp", "curated": False,
        "brief": (
            "bir davrga to'g'ri kelgani hech kim kutmaydigan voqea va shaxslarni taqqoslash — "
            "javob sana emas, qaysi biri yaqinroq yoki avvalroq ekani"
        ),
        "sub_topics": [
            "qadimgi dunyo va zamonaviy davr",
            "shaxslarning zamondoshligi",
            "ixtirolar va tarixiy voqealar",
            "tashkilot va davlatlarning yoshi",
            "hayvonlar va insoniyat tarixi",
            "madaniyat va san'at",
            "texnologiya va tarixiy voqealar",
            "shahar va binolarning yoshi",
        ],
        "examples": [
            [
                "Kleopatra qaysi voqeaga zamon jihatdan yaqinroq yashagan: piramidalar qurilishigami "
                "yoki odamning Oyga qo'nishigami?",
                "Oyga qo'nishga",
            ],
        ],
    },
    {
        "key": "texnologiya", "label": "Texnologiya tarixi", "tag_prefix": "tech", "curated": False,
        "brief": "texnologiya va kompaniyalarning kutilmagan tarixi",
        "sub_topics": [
            "kompaniyalarning kelib chiqishi",
            "belgilarning kelib chiqishi (@, #)",
            "interfeys odatlari",
            "internetning ilk davri",
            "telefonlar",
            "ma'lumot saqlash",
            "kompyuter o'yinlari",
            "kompaniyalar dastlab nima ishlab chiqargani",
            "dasturlash tillari nomlari",
            "logotiplar",
        ],
        "examples": [
            ["Nokia dastlab nima ishlab chiqargan?", "Qog'oz"],
            ["Samsung dastlab qaysi soha bilan shug'ullangan?", "Oziq-ovqat savdosi"],
        ],
    },
    {
        "key": "oziq_ovqat", "label": "Oziq-ovqat tarixi", "tag_prefix": "food", "curated": False,
        "brief": "taomlar va mahsulotlarning kutilmagan tarixi",
        "sub_topics": [
            "taomlarning kelib chiqishi",
            "ziravorlar savdosi",
            "taomlarning dunyo bo'ylab tarqalishi",
            "oziq-ovqatni saqlash usullari",
            "ichimliklar",
            "Markaziy Osiyo oshxonasi",
            "tarixni o'zgartirgan taomlar",
            "meva va sabzavotlarning vatani",
            "non va un mahsulotlari",
        ],
        "examples": [],
    },
    {
        "key": "pul_iqtisod", "label": "Pul va iqtisod", "tag_prefix": "money", "curated": False,
        "brief": "pul haqidagi tushunarli va qiziq faktlar — iqtisodiy jargon emas",
        "sub_topics": [
            "valyuta nomlarining kelib chiqishi",
            "tangalar tarixi",
            "qog'oz pullar tarixi",
            "savdo yo'llari",
            "banklarning kelib chiqishi",
            "ayirboshlash savdosi",
            "inflyatsiya hikoyalari",
            "g'alati pul turlari",
            "pul belgilari va ularning ma'nosi",
        ],
        "examples": [],
    },
    {
        "key": "keng_xato", "label": "Keng tarqalgan xato", "tag_prefix": "myth", "curated": False,
        "brief": (
            "keng tarqalgan noto'g'ri tushunchani rad etib, haqiqiy javobni bering — faqat "
            "aniq nomlangan manba bilan tasdiqlangan rad etishlar"
        ),
        "sub_topics": [
            "hayvonlar haqidagi afsonalar",
            "inson tanasi haqidagi afsonalar",
            "tarixiy shaxslar haqidagi afsonalar",
            "kosmos va tabiat haqidagi afsonalar",
            "ovqat va salomatlik haqidagi afsonalar",
            "texnologiya haqidagi afsonalar",
            "tarixiy voqealar haqidagi afsonalar",
            "til va so'zlar haqidagi afsonalar",
        ],
        "examples": [
            ["Buqalar qizil rangni ko'rib g'azablanadimi?", "Yo'q — ular rangni emas, harakatni sezadi"],
        ],
    },
    {
        "key": "kitoblar_mualliflar", "label": "Kitoblar va mualliflar", "tag_prefix": "books", "curated": False,
        "brief": "kitoblar va mualliflar haqidagi faktlar — syujetni eslash emas",
        "sub_topics": [
            "mashhur kitoblar qanday yozilgani",
            "taxalluslar",
            "rad etilgan qo'lyozmalar",
            "kitoblarning kelib chiqishi",
            "tarjima hikoyalari",
            "mashhur kitobdagi bitta katta g'oya",
            "yozuvchilarning ish odatlari",
            "kitob nomlarining kelib chiqishi",
            "taqiqlangan kitoblar",
        ],
        "examples": [],
    },
    {
        "key": "ozbek_adabiyoti", "label": "O'zbek adabiyoti va madaniyati", "tag_prefix": "uzlit", "curated": False,
        "brief": (
            "o'zbek adabiyoti va madaniyati — faqat keng hujjatlashtirilgan, tekshirilishi "
            "mumkin bo'lgan faktlar (kim, qaysi asar, qaysi hunar); ishonching komil "
            "bo'lmagan faktni ishlatma"
        ),
        "sub_topics": [
            "Alisher Navoiy",
            "Abdulla Qodiriy",
            "Cho'lpon",
            "Zahiriddin Muhammad Bobur",
            "xalq dostonlari",
            "an'anaviy hunarmandchilik",
            "musiqa va cholg'u asboblari",
            "me'morchilik",
            "urf-odatlar",
        ],
        "examples": [],
    },
    {
        "key": "tarix_meros", "label": "Tarix va meros", "tag_prefix": "heritage", "curated": False,
        "brief": (
            "o'zbek tarixi va merosi — buyuk shaxslarning ishlari, me'morchilik, ilm-fan; "
            "faqat keng hujjatlashtirilgan faktlar"
        ),
        "sub_topics": [
            "Temuriylar davri",
            "Buyuk ipak yo'li",
            "olimlar va mutafakkirlar",
            "Xiva, Buxoro va Samarqand",
            "qo'lyozmalar va kutubxonalar",
            "astronomiya",
            "tibbiyot",
            "savdo",
        ],
        "examples": [
            ["Beruniy nimani birinchilardan bo'lib hisoblab chiqqan?", "Yer aylanasini"],
        ],
    },
    {
        "key": "amaliy_fan", "label": "Amaliy fan", "tag_prefix": "learning", "curated": False,
        "brief": (
            "o'rganish va odatlar — har doim VAZIYAT shaklida so'ralsin "
            "(masalan \"20 ta so'z yodladingiz, qaysilari tez unutiladi?\"), atama emas"
        ),
        "sub_topics": [
            "xotira",
            "uyqu va o'rganish",
            "diqqat",
            "oraliqli takrorlash",
            "jismoniy mashq va miya",
            "konspekt yozish",
            "o'qish tezligi",
            "ishni orqaga surish",
            "qaror charchoqligi",
            "odat shakllantirish",
            "stress va o'rganish",
        ],
        "examples": [
            ["20 ta yangi so'z yodladingiz. Qaysilari eng tez unutiladi?", "O'rtadagilari"],
        ],
    },
]

# Weekday 0 = Monday. A cell with several keys alternates between them on
# successive weeks of the same letter (Week-A Saturdays: tabiat, kosmos,
# tabiat, ...). Week A is the week starting `anchor_monday` and every other
# week after it.
DEFAULT_ROTATION: dict[str, Any] = {
    "anchor_monday": "2026-10-12",
    "weeks": {
        "A": {
            "0": ["soz_tarixi"],
            "1": ["amaliy_fan"],
            "2": ["ixtirolar"],
            "3": ["ozbek_adabiyoti"],
            "4": ["pul_iqtisod"],
            "5": ["tabiat", "kosmos"],
            "6": ["nega_shunday"],
        },
        "B": {
            "0": ["kitoblar_mualliflar"],
            "1": ["inson_tanasi"],
            "2": ["texnologiya"],
            "3": ["tarix_meros"],
            "4": ["oziq_ovqat"],
            "5": ["geografiya", "tarixiy_taqqoslash"],
            "6": ["keng_xato"],
        },
    },
}

REQUIRED_CATEGORY_FIELDS = {"key", "label", "tag_prefix", "brief", "sub_topics", "curated"}


def validate_categories(categories: Any) -> list[str]:
    """Returns human-readable problems, empty if the list is usable."""
    if not isinstance(categories, list) or not categories:
        return ["categories must be a non-empty list"]
    problems = []
    keys, prefixes = set(), set()
    for c in categories:
        if not isinstance(c, dict):
            problems.append("every category must be an object")
            continue
        missing = REQUIRED_CATEGORY_FIELDS - set(c.keys())
        if missing:
            problems.append(f"category {c.get('key', '?')} missing fields: {sorted(missing)}")
            continue
        if not isinstance(c["sub_topics"], list) or not c["sub_topics"] or not all(
            isinstance(s, str) and s.strip() for s in c["sub_topics"]
        ):
            problems.append(f"category {c['key']} needs a non-empty list of sub_topics")
        if c["key"] in keys:
            problems.append(f"duplicate category key {c['key']}")
        if c["tag_prefix"] in prefixes:
            problems.append(f"duplicate tag_prefix {c['tag_prefix']}")
        keys.add(c["key"])
        prefixes.add(c["tag_prefix"])
    return problems


def validate_rotation(rotation: Any, category_keys: set[str]) -> list[str]:
    if not isinstance(rotation, dict):
        return ["rotation must be an object"]
    problems = []
    try:
        anchor = date.fromisoformat(str(rotation.get("anchor_monday")))
        if anchor.weekday() != 0:
            problems.append("anchor_monday must be a Monday")
    except ValueError:
        problems.append("anchor_monday must be an ISO date (YYYY-MM-DD)")
    weeks = rotation.get("weeks")
    if not isinstance(weeks, dict) or set(weeks.keys()) != {"A", "B"}:
        return problems + ["weeks must have exactly the keys A and B"]
    for letter, days in weeks.items():
        if not isinstance(days, dict) or set(days.keys()) != {str(i) for i in range(7)}:
            problems.append(f"week {letter} must have weekdays \"0\"..\"6\"")
            continue
        for weekday, cell in days.items():
            if not isinstance(cell, list) or not cell:
                problems.append(f"week {letter} day {weekday} must be a non-empty list of category keys")
                continue
            unknown = [k for k in cell if k not in category_keys]
            if unknown:
                problems.append(f"week {letter} day {weekday} has unknown categories {unknown}")
    return problems


def get_categories(db: Session) -> list[dict[str, Any]]:
    """app_config['daily_quiz_categories_v2'], falling back to the defaults
    when the row is missing or malformed (logged, never raised — a bad
    config edit must not stop the daily generation cron)."""
    categories = get_config(db, CATEGORIES_CONFIG_KEY, default=None)
    if categories is None:
        return DEFAULT_CATEGORIES
    problems = validate_categories(categories)
    if problems:
        logger.error("app_config %s invalid, using defaults: %s", CATEGORIES_CONFIG_KEY, problems)
        return DEFAULT_CATEGORIES
    return categories


def get_rotation(db: Session, categories: list[dict[str, Any]]) -> dict[str, Any]:
    rotation = get_config(db, ROTATION_CONFIG_KEY, default=None)
    if rotation is None:
        rotation = DEFAULT_ROTATION
    problems = validate_rotation(rotation, {c["key"] for c in categories})
    if problems:
        logger.error("app_config %s invalid, using defaults: %s", ROTATION_CONFIG_KEY, problems)
        return DEFAULT_ROTATION
    return rotation


def category_key_for_date(rotation: dict[str, Any], d: date) -> str:
    """Pure — which category key runs on date `d` under `rotation`."""
    anchor = date.fromisoformat(rotation["anchor_monday"])
    week_monday = d - timedelta(days=d.weekday())
    weeks_since_anchor = (week_monday - anchor).days // 7  # floor division also handles dates before the anchor
    letter = "A" if weeks_since_anchor % 2 == 0 else "B"
    cell = rotation["weeks"][letter][str(d.weekday())]
    # Same-letter weeks are 2 apart, so this steps through a multi-key cell
    # once per occurrence of that weekday in that letter's weeks.
    return cell[(weeks_since_anchor // 2) % len(cell)]


def get_category_for_date(db: Session, d: date) -> dict[str, Any]:
    categories = get_categories(db)
    rotation = get_rotation(db, categories)
    key = category_key_for_date(rotation, d)
    by_key = {c["key"]: c for c in categories}
    if key not in by_key:
        # Only reachable when the default rotation is paired with an edited
        # category list that dropped one of its keys.
        logger.error("rotation names unknown category %s for %s, using %s", key, d, categories[0]["key"])
        return categories[0]
    return by_key[key]


def choose_sub_topic(sub_topics: list[str], last_used: dict[str, date]) -> str:
    """Pure — the never-used sub-topic first (in list order), otherwise the
    one used longest ago. Usage is tracked per sub-topic, not per category,
    so each category cycles through its whole bank before repeating."""
    never_used = [s for s in sub_topics if s not in last_used]
    if never_used:
        return never_used[0]
    return min(sub_topics, key=lambda s: last_used[s])
