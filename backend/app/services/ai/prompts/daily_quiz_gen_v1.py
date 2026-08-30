"""
daily_quiz_gen_v1.py — prompt + JSON schema for "5 Savol" daily-quiz
candidate generation (5-savol-daily-quiz-spec.md, Part 1). Version
identifier: VERSION below, logged into ai_usage_log.prompt_version. Bump
the filename (v2, v3, ...) rather than editing this one in place, so
historical usage rows stay attributable to the exact prompt that produced
them — same convention as flashcard_gen_v1.py / weekly_review_v2.py.
"""

VERSION = "daily_quiz_gen.v1"

# Weekday (Monday=0 .. Sunday=6) -> (theme_key, Uzbek label, generation brief).
THEMES = {
    0: ("kitoblar", "Kitoblar",
        "mashhur kitoblar, ularning mualliflari, asosiy g'oyalari — qaysi kitobda nima aytilgan"),
    1: ("miya_xotira", "Miya va xotira",
        "o'rganish haqidagi fan: unutish egri chizig'i, oraliqli takrorlash, "
        "testing effect, uyqu va xotira"),
    2: ("psixologiya", "Psixologiya",
        "faqat takrorlangan (replicated) ilmiy tadqiqotlarga asoslangan psixologik topilmalar"),
    3: ("shaxslar", "Shaxslar",
        "asoschilar, mualliflar, olimlar, tarixiy shaxslar"),
    4: ("moliyaviy_savodxonlik", "Moliyaviy savodxonlik",
        "murakkab foiz, inflyatsiya, byudjetlashtirish"),
    5: ("umumiy_bilim", "Umumiy bilim",
        "geografiya, tarix, fan"),
    6: ("til", "Til",
        "ingliz va koreys tilidagi lug'at"),
}

# Verbatim blacklist (spec Part 1) — an AI will assert these confidently
# with a wrong answer key; teaching a myth as fact is worse than skipping
# the quiz for a day.
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

SYSTEM_PROMPT = (
    "Sen SAHIFALAB ta'lim ilovasining \"5 Savol\" kunlik viktorinasi uchun "
    "savol generatsiya qiluvchi yordamchisan. Bir kun uchun bir nechta "
    "nomzod savol yaratasan — bularning eng yaxshi 5 tasi tanlab, "
    "dunyodagi BARCHA foydalanuvchilarga bir xil ko'rinishda beriladi.\n\n"
    "Qat'iy qoidalar:\n"
    "- Faqat haqiqiy, tekshirilishi mumkin bo'lgan faktlardan foydalan — "
    "o'ylab topma.\n"
    "- Har bir savolda ANIQ bitta to'g'ri javob bo'lishi shart, qolgan 3 "
    "variant esa ishonarli lekin noto'g'ri bo'lsin.\n"
    "- `source` maydonida ANIQ manba ko'rsat — kitob nomi, tadqiqot yoki "
    "keng tan olingan fakt (masalan \"Daniel Kahneman, 'Thinking, Fast and "
    "Slow'\", umumiy \"ilmiy tadqiqotlar\" emas).\n"
    "- `explanation` — bir qatorli, aniq va qisqa tushuntirish.\n"
    "- `difficulty` — har bir savol uchun 'easy', 'medium' yoki 'hard'dan "
    "birini belgila, so'ralgan taqsimotga qat'iy amal qil.\n"
    "- Barcha matn o'zbek tilida (lotin yozuvi, standart imlo — o' va g' "
    "harflarini to'g'ri ishlat).\n\n"
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
# don't have to come disproportionately from one bucket. The final
# selection (daily_quiz_service._select_five) draws 2 easy + 2 medium +
# 1 hard from whatever survives verification.
CANDIDATE_MIX = {"easy": 4, "medium": 4, "hard": 2}


def build_user_prompt(weekday: int, avoid_questions: list[str] | None = None) -> str:
    theme_key, theme_label, brief = THEMES[weekday]
    mix_lines = "\n".join(f"- {level}: {n} ta" for level, n in CANDIDATE_MIX.items())
    avoid_block = ""
    if avoid_questions:
        # Retry rounds (daily_quiz_service._generate_full_day) re-call this
        # same theme when verification attrition left the day short — without
        # this, a second call at temperature=0.2 tends to resurface near-
        # identical questions instead of genuinely new ones.
        listed = "\n".join(f"- {q}" for q in avoid_questions[:20])
        avoid_block = (
            "\n\nQuyidagi savollar ALLAQACHON ishlatilgan (yoki nomzod sifatida "
            f"ko'rib chiqilgan) — bularni yoki bunga juda o'xshash savollarni "
            f"QAYTA YARATMA, boshqa jihat/fakt tanla:\n{listed}\n"
        )
    return (
        f"Mavzu: {theme_label} — {brief}.\n\n"
        f"Jami {sum(CANDIDATE_MIX.values())} ta nomzod savol yarat, quyidagi "
        f"qiyinchilik taqsimoti bo'yicha:\n{mix_lines}\n"
        f"{avoid_block}\n"
        "Bir xil faktni bir necha marta takrorlama — har bir savol boshqa "
        "jihatga oid bo'lsin."
    )
