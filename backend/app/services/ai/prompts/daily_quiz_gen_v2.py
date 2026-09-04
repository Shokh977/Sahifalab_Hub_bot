"""
daily_quiz_gen_v2.py — prompt + JSON schema for "5 Savol" daily-quiz
candidate generation. Supersedes daily_quiz_gen_v1.py (kept in place,
unedited, per this codebase's convention: bump the filename rather than
editing a shipped prompt in place, so historical ai_usage_log.prompt_version
rows stay attributable to the exact prompt that produced them).

What changed from v1, and why:
  - THEMES (a static per-weekday dict) is gone. Category now comes from
    app/services/category_config.py's weighted category mix, passed into
    build_user_prompt() as a plain dict — this module no longer owns
    category data at all.
  - v1 only ever ran for ALL weekdays/themes. v2 only ever runs for
    non-curated categories (amaliy_fan, kitoblar_goyalar, til_soz_tarixi) —
    ozbek_adabiyoti and tarix_meros are format-only against curated_facts
    (see daily_quiz_format_v1.py) and never reach this generator, because
    this model's Uzbek-literature/history knowledge is unreliable enough to
    have produced a hallucinated psychological effect in a domain it should
    have been STRONGER in, let alone a weaker one.
  - Added the situation-framing rule: never ask "what is X called," ask
    "what happens when...". This is the single biggest quality change in
    the brief — recall-the-term questions are unanswerable for anyone who
    hasn't studied the field; reasoning-toward-an-answer questions aren't.
  - Added explicit mutual-exclusivity and distractor-must-be-real
    instructions (the daily_quiz_deepcheck_v1 verifier catches violations
    downstream, but it's cheaper to not generate them in the first place).
  - Raised the easy-tier floor explicitly (Bug C: "book" -> "kitob" is
    banned-in-spirit now, not just accidentally avoided).
"""

VERSION = "daily_quiz_gen.v2"

BLACKLIST = (
    "Quyidagi mavzularni ASSERT qilma — bularning barchasi noto'g'ri yoki "
    "chalkash tarzda keng tarqalgan, ilmiy jihatdan rad etilgan yoki "
    "noto'g'ri talqin qilingan:\n"
    "- O'rganish uslublari (vizual/eshitish/kinestetik)\n"
    "- Chap miya / o'ng miya shaxsiyat turlari\n"
    "- \"Biz miyamizning faqat 10 foizidan foydalanamiz\"\n"
    "- Odatiy talqindagi \"10,000 soat qoidasi\"\n"
    "- Marshmallow testi hayotdagi natijalarni bashorat qiladi, degan da'vo\n"
    "- Maslou piramidasi (Maslou hech qachon piramida chizmagan)\n"
    "- Motsart effekti\n"
    "- \"Kuchli poza\" (power pose) effekti\n"
    "- Ko'p turdagi aql (multiple intelligences) nazariyasi\n"
    "- \"Odat hosil qilish uchun 21 kun kerak\"\n"
)

BANNED_CONTENT = (
    "Qat'iy taqiqlangan javob/mazmun turlari:\n"
    "- Javob sifatida sana, yil, aholi soni yoki boshqa statistik "
    "ko'rsatkich\n"
    "- \"Buni kim aytgan?\" turidagi iqtibos-muallif savoli\n"
)

FRAMING_RULE = (
    "SAVOL SHAKLI — bu eng muhim qoida:\n"
    "Foydalanuvchidan ATAMANI ESLASH so'ralmasin. Buning o'rniga VAZIYATNI "
    "TASAVVUR QILIB, mantiqan javobga kelish so'ralsin. Bir xil tushuncha "
    "ikki xil so'ralishi mumkin:\n\n"
    "YOMON (atama eslash): \"Ro'yxatning boshi va oxiri yaxshi esda "
    "qolishi qanday nomlanadi?\" -> \"Serial mavqe effekti\"\n"
    "YAXSHI (vaziyatdan xulosa): \"20 ta yangi so'z yodlayapsiz. "
    "Qaysilari eng tez unutiladi?\" -> \"O'rtadagilari\"\n\n"
    "Ikkalasi ham bir xil tushunchaga oid, lekin ikkinchisi hech qachon bu "
    "mavzuni o'rganmagan odam ham mantiqan javob topa oladigan, darhol "
    "foydali va topilganda qoniqarli savol. Atama (masalan \"serial mavqe "
    "effekti\") faqat `explanation` maydonida ishlatilishi mumkin — savol "
    "matnida EMAS. \"... qanday nomlanadi?\", \"... deb ataladi?\" kabi "
    "so'roqlarni ishlatma."
)

DIFFICULTY_FLOOR = (
    "'easy' darajasi HAM ko'pchilik oldindan bilmaydigan, lekin mantiqan "
    "o'ylab topish mumkin bo'lgan savol bo'lishi kerak — \"deyarli hamma "
    "biladigan\" savol EMAS. Bitta so'zni boshqa tilga tarjima qilish kabi "
    "eng oddiy savollar butunlay taqiqlangan (masalan \"'book' so'zining "
    "o'zbekcha tarjimasi\" — bunday savol qat'iyan yaratilmasin)."
)

OPTION_QUALITY_RULES = (
    "Variantlar sifati:\n"
    "- 4 variant bir-biridan MUTLAQ AJRALGAN bo'lsin — hech biri "
    "boshqasining ichiga kirmasin yoki ustma-ust tushmasin (ayniqsa vaqt "
    "oralig'i, miqdor yoki foiz variantlarida ehtiyot bo'l: \"bir necha "
    "soat ichida\" va \"dastlabki 24 soat ichida\" kabi juftlik noto'g'ri, "
    "chunki biri boshqasining qismi).\n"
    "- Har bir noto'g'ri variant HAQIQATDA MAVJUD bo'lgan narsa bo'lishi "
    "kerak (real effekt, kitob, shaxs yoki tushuncha) — ishonarli "
    "eshitiladigan, lekin hech qanday manbada uchramaydigan o'ylab topilgan "
    "atama ishlatish qat'iyan taqiqlanadi. Agar biror distractor nomini "
    "aniq manbada tasdiqlay olmasang, uni ishlatma.\n"
)

SYSTEM_PROMPT = (
    "Sen SAHIFALAB ta'lim ilovasining \"5 Savol\" kunlik viktorinasi uchun "
    "savol generatsiya qiluvchi yordamchisan. Bir kun uchun bir nechta "
    "nomzod savol yaratasan — bularning eng yaxshi 5 tasi tanlab, "
    "dunyodagi BARCHA foydalanuvchilarga bir xil ko'rinishda beriladi.\n\n"
    f"{FRAMING_RULE}\n\n"
    "Qat'iy qoidalar:\n"
    "- Faqat haqiqiy, tekshirilishi mumkin bo'lgan faktlardan foydalan — "
    "o'ylab topma.\n"
    "- Har bir savolda ANIQ bitta to'g'ri javob bo'lishi shart, qolgan 3 "
    "variant esa ishonarli lekin noto'g'ri bo'lsin.\n"
    f"{OPTION_QUALITY_RULES}"
    f"{DIFFICULTY_FLOOR}\n"
    "- `source` maydonida ANIQ manba ko'rsat — kitob nomi, tadqiqot yoki "
    "keng tan olingan fakt (masalan \"Daniel Kahneman, 'Thinking, Fast and "
    "Slow'\", umumiy \"ilmiy tadqiqotlar\" emas).\n"
    "- `explanation` — bir qatorli, aniq va qisqa tushuntirish.\n"
    "- `difficulty` — har bir savol uchun 'easy', 'medium' yoki 'hard'dan "
    "birini belgila, so'ralgan taqsimotga qat'iy amal qil.\n"
    "- Barcha matn o'zbek tilida (lotin yozuvi, standart imlo — o' va g' "
    "harflarini to'g'ri ishlat).\n\n"
    f"{BANNED_CONTENT}\n"
    f"{BLACKLIST}\n"
    "Faqat JSON qaytar, boshqa matn yozma."
)

JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question_text": {"type": "string"},
                    "options": {
                        "type": "array",
                        "items": {"type": "string"},
                        "minItems": 4,
                        "maxItems": 4,
                    },
                    "correct_index": {"type": "integer"},
                    "explanation":   {"type": "string"},
                    "source":        {"type": "string"},
                    "difficulty":    {"type": "string", "enum": ["easy", "medium", "hard"]},
                },
                "required": ["question_text", "options", "correct_index", "explanation", "source", "difficulty"],
            },
        },
    },
    "required": ["questions"],
}

# Overproduce 10 candidates per day (spec: "generate 10, keep the best 5"),
# already split close to the final 2/2/1 target so verification rejects
# don't have to come disproportionately from one bucket.
CANDIDATE_MIX = {"easy": 4, "medium": 4, "hard": 2}


def build_user_prompt(category: dict, avoid_questions: list[str] | None = None) -> str:
    """category: {"key", "label", "brief"} from category_config — never a
    curated category (ozbek_adabiyoti/tarix_meros never reach this prompt,
    see module docstring)."""
    mix_lines = "\n".join(f"- {level}: {n} ta" for level, n in CANDIDATE_MIX.items())
    avoid_block = ""
    if avoid_questions:
        listed = "\n".join(f"- {q}" for q in avoid_questions[:20])
        avoid_block = (
            "\n\nQuyidagi savollar ALLAQACHON ishlatilgan (yoki nomzod sifatida "
            f"ko'rib chiqilgan) — bularni yoki bunga juda o'xshash savollarni "
            f"QAYTA YARATMA, boshqa jihat/fakt tanla:\n{listed}\n"
        )
    return (
        f"Mavzu: {category['label']} — {category['brief']}.\n\n"
        f"Jami {sum(CANDIDATE_MIX.values())} ta nomzod savol yarat, quyidagi "
        f"qiyinchilik taqsimoti bo'yicha:\n{mix_lines}\n"
        f"{avoid_block}\n"
        "Bir xil faktni bir necha marta takrorlama — har bir savol boshqa "
        "jihatga oid bo'lsin."
    )
