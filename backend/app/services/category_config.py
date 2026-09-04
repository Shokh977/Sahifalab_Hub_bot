"""
category_config.py — the "5 Savol" category mix (5-savol-quality-fixes
brief, Part 3), configurable without a deploy via app_config, same
mechanism as tanga_earning (config_service.get_config/invalidate_config_cache).

Replaces daily_quiz_gen_v1.THEMES's static per-weekday dict. Categories
carry a `curated` flag: ozbek_adabiyoti and tarix_meros are never generated
freeform (daily_quiz_gen_v2) — they're formatted from an admin-verified
curated_facts row (daily_quiz_format_v1) — because this model's Uzbek
literature/history knowledge is unreliable enough that letting it invent
the underlying fact risks the same hallucination that produced Bug B's
"Honavar effekti," in a domain (Uzbek culture) where getting it wrong in
front of the target audience is far more damaging than in Western
psychology trivia.
"""
from typing import Any

from sqlalchemy.orm import Session

from app.services.config_service import get_config

CONFIG_KEY = "daily_quiz_categories"

# {key, label, brief, weight, curated}. `brief` is the generation-prompt
# hint for non-curated categories; curated categories don't need one since
# the AI never invents content for them, only formats a supplied fact.
DEFAULT_CATEGORIES: list[dict[str, Any]] = [
    {
        "key": "amaliy_fan", "label": "Amaliy fan", "weight": 30, "curated": False,
        "brief": (
            "xotira, diqqat, uyqu, odat — har doim VAZIYAT shaklida so'ralsin "
            "(masalan \"20 ta so'z yodlayapsiz, qaysilari tez unutiladi?\"), "
            "atama emas"
        ),
    },
    {
        "key": "kitoblar_goyalar", "label": "Kitoblar va g'oyalar", "weight": 25, "curated": False,
        "brief": "mashhur kitoblarda aytilgan g'oya NIMA ekanligi, atamasi emas",
    },
    {
        "key": "ozbek_adabiyoti", "label": "O'zbek adabiyoti", "weight": 20, "curated": True,
        "brief": "",
    },
    {
        "key": "tarix_meros", "label": "Tarix va meros", "weight": 15, "curated": True,
        "brief": "",
    },
    {
        "key": "til_soz_tarixi", "label": "Til va so'z tarixi", "weight": 10, "curated": False,
        "brief": "so'zlar va ularning kelib chiqishi (etimologiya)",
    },
]


def get_categories(db: Session) -> list[dict[str, Any]]:
    """Reads app_config['daily_quiz_categories'] (edited via direct SQL by
    whoever owns the DB — same as tanga_earning, no dedicated CRUD endpoint
    exists for that key either), falling back to DEFAULT_CATEGORIES."""
    return get_config(db, CONFIG_KEY, default=DEFAULT_CATEGORIES) or DEFAULT_CATEGORIES


def build_weekday_rotation(categories: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    """Largest-remainder allocation of `categories`' weights over the 7
    weekday slots (Monday=0..Sunday=6). With the brief's default weights
    (30/25/20/15/10) this yields exactly 2/2/1/1/1 days, summing to 7.
    Recomputed fresh each call (cheap — called once/day from generate_week,
    not per-request) so an app_config edit takes effect on the very next
    generation run, no cache invalidation needed here."""
    total_weight = sum(c["weight"] for c in categories) or 1
    exact_shares = [(c, c["weight"] / total_weight * 7) for c in categories]
    base_counts = [(c, int(share)) for c, share in exact_shares]
    remainders = sorted(
        ((c, share - int(share)) for c, share in exact_shares),
        key=lambda pair: pair[1], reverse=True,
    )

    allocated = sum(n for _, n in base_counts)
    counts = {c["key"]: n for c, n in base_counts}
    i = 0
    while allocated < 7:
        c, _ = remainders[i % len(remainders)]
        counts[c["key"]] += 1
        allocated += 1
        i += 1

    rotation: dict[int, dict[str, Any]] = {}
    weekday = 0
    by_key = {c["key"]: c for c in categories}
    for key, n in counts.items():
        for _ in range(n):
            rotation[weekday] = by_key[key]
            weekday += 1
    return rotation


def get_weekday_category(db: Session, weekday: int) -> dict[str, Any]:
    categories = get_categories(db)
    rotation = build_weekday_rotation(categories)
    return rotation[weekday]
