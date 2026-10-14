"""
daily_quiz_gen_v3.py — "5 Savol" freeform generation prompt
(5-savol-expanded-categories spec).

What changed from v2, and why:
  - Core principle stated up front: a question teaches a fact worth
    repeating, never tests whether the user memorised a term. The three
    hard rules (answer is a thing not a term; no dates/years/statistics as
    answers; no school-textbook recall) and the three ideal shapes
    (surprising fact, origin, reasonable situation) replace v2's
    single framing rule, which only covered the learning categories.
  - One sub-topic per call (category_config.choose_sub_topic), not the
    whole category — the main lever against day-to-day repetition.
  - Every candidate carries a `concept_tag`; the last 50 tags of the
    category are passed in as an exclusion list, and daily_quiz_service
    hard-blocks any tag used in the last 120 days.
  - The explanation must add a new detail, never restate the answer.
  - The myth blacklist now covers popular general "fun facts" too, and a
    meme-level fact needs a named source.
"""

VERSION = "daily_quiz_gen.v3"

CORE_PRINCIPLE = (
    "ASOSIY TAMOYIL: savol foydalanuvchi atamani yodlaganini TEKSHIRMASIN — "
    "boshqalarga aytib berishga arziydigan FAKTNI o'rgatsin. Sinov: javobni "
    "bilib olgach, odam buni kimgadir aytib bergisi keladimi?\n\n"
    "YOMON: \"Ro'yxatning boshi va oxiri yaxshi esda qolishi qanday "
    "nomlanadi?\" -> \"Serial mavqe effekti\" (bu shunchaki nom, uni hech kim "
    "boshqalarga aytib bermaydi)\n"
    "YAXSHI: \"'Algoritm' so'zi kimning ismidan kelib chiqqan?\" -> "
    "\"Al-Xorazmiy\" (bu fakt, uni hamma aytib beradi)"
)

HARD_RULES = (
    "UCHTA QAT'IY QOIDA:\n"
    "1. Javob — NARSA (shaxs, joy, buyum, sabab, natija), hech qachon ATAMA "
    "emas. \"X nima deb ataladi?\", \"... qanday nomlanadi?\" shaklidagi "
    "savollar taqiqlanadi. Javob effekt, nazariya, tamoyil yoki sindrom nomi "
    "bo'lmasin. Atama faqat `explanation` ichida tilga olinishi mumkin.\n"
    "2. Javob sifatida sana, yil, aholi soni yoki statistika bo'lmasin. "
    "\"Qaysi yilda...?\" taqiqlanadi — QACHON emas, NIMA yoki NEGA deb so'ra.\n"
    "3. Maktab darsligidagi oddiy eslash savoli bo'lmasin. Agar savol 9-sinf "
    "darsligida aynan shunday ko'rinishda uchrasa — u qiziq emas."
)

IDEAL_SHAPES = (
    "IDEAL SAVOL SHAKLLARI (uchalasi ham o'rgatadi, hech biri oldindan "
    "o'qishni talab qilmaydi):\n"
    "- Hayratlanarli fakt (\"asal hech qachon buzilmaydi\")\n"
    "- Kelib chiqish (\"bu so'z qayerdan kelgan\", \"bu narsa qanday paydo "
    "bo'lgan\")\n"
    "- Tasavvur qilinadigan vaziyat (\"20 ta so'z yodladingiz — qaysilari "
    "birinchi unutiladi?\")"
)

DIFFICULTY_RULES = (
    "QIYINCHILIK DARAJALARI:\n"
    "- easy: ko'pchilik yarim-yorti biladi yoki mantiqan topa oladi. Lekin "
    "baribir hamma biladigan narsa emas — oddiy tarjima va darslikdan eslash "
    "taqiqlanadi.\n"
    "- medium: ko'pchilik bilmaydi, lekin javob ochilgach darhol "
    "\"ha, tushunarli\" bo'ladi.\n"
    "- hard: chinakam hayratlanarli — odamlar skrinshot qilib yuboradigan "
    "savol."
)

OPTION_QUALITY_RULES = (
    "VARIANTLAR SIFATI:\n"
    "- 4 variant bir-biridan MUTLAQ AJRALGAN bo'lsin — hech biri boshqasining "
    "ichiga kirmasin yoki ustma-ust tushmasin.\n"
    "- Har bir noto'g'ri variant HAQIQATDA MAVJUD narsa bo'lsin (real shaxs, "
    "joy, kitob, buyum, tushuncha) — o'ylab topilgan nom ishlatma.\n"
    "- Faqat bitta variant himoyalanishi mumkin bo'lsin."
)

EXPLANATION_RULE = (
    "TUSHUNTIRISH — mahsulotning yarmi. `explanation` bitta qator bo'lib, "
    "javobni QAYTARMASIN, balki qiziqishni oshiradigan YANGI tafsilot "
    "qo'shsin.\n"
    "YOMON: \"Algoritm so'zi Al-Xorazmiy ismidan kelgan.\"\n"
    "YAXSHI: \"Al-Xorazmiyning lotincha nomi 'Algoritmi' edi — 'algebra' ham "
    "uning kitobi nomidagi 'al-jabr' so'zidan olingan.\""
)

MYTH_BLACKLIST = (
    "AFSONALAR RO'YXATI — quyidagilar noto'g'ri yoki bahsli. Ularni HECH "
    "QACHON haqiqat sifatida taqdim etma (to'g'ri javob, tushuntirish yoki "
    "distractor asosida ham):\n"
    "Psixologiya va o'rganish: o'rganish uslublari (vizual/eshitish/"
    "kinestetik); chap miya / o'ng miya shaxsiyat turlari; \"miyaning faqat "
    "10 foizidan foydalanamiz\"; odatiy talqindagi \"10 000 soat qoidasi\"; "
    "marshmallow testi hayotiy natijalarni bashorat qiladi degan da'vo; "
    "Maslou piramidasi (Maslou hech qachon piramida chizmagan); Motsart "
    "effekti; \"kuchli poza\" effekti; ko'p turdagi aql nazariyasi; \"odat "
    "hosil qilish uchun 21 kun kerak\".\n"
    "Umumiy: oltin baliqning 3 soniyalik xotirasi; buqalar qizil RANGdan "
    "g'azablanadi; tildagi ta'm xaritasi; Buyuk Xitoy devori kosmosdan "
    "ko'rinadi; Napoleon past bo'yli edi; vikinglar shoxli dubulg'a kiygan; "
    "Eynshteyn matematikadan yiqilgan; chaqmoq bir joyga ikki marta "
    "tushmaydi; uyquda o'rgimchak yutamiz; QWERTY klaviaturasi yozishni "
    "sekinlashtirish uchun yaratilgan (bahsli); tana ichidagi qon ko'k "
    "rangda.\n"
    "Bu afsonalarni faqat \"Keng tarqalgan xato\" mavzusida, RAD ETISH "
    "uchun ishlatish mumkin — shunda ham aniq nomlangan manba bilan."
)

SOURCE_RULE = (
    "MANBA: `source` maydonida aniq, kuzatib boriladigan manba ko'rsat — "
    "kitob, tadqiqot, muzey, ensiklopediya maqolasi yoki rasmiy tashkilot "
    "(umumiy \"ilmiy tadqiqotlar\" yoki \"internet\" emas). Agar fakt mem "
    "darajasida mashhur bo'lsa, nomlangan manbasiz uni ishlatma. Ishonching "
    "komil bo'lmagan faktni umuman ishlatma."
)

CONCEPT_TAG_RULE = (
    "KONSEPT TEGI: har bir savolga `concept_tag` ber — savol tayangan "
    "faktni bildiruvchi qisqa ingliz tilidagi snake_case teg, mavzu "
    "prefiksi bilan boshlanadi (masalan etymology_al_khwarizmi, "
    "invention_microwave). Bir xil faktga oid savollar bir xil tegni olsin."
)

SYSTEM_PROMPT = (
    "Sen SAHIFALAB ta'lim ilovasining \"5 Savol\" kunlik viktorinasi uchun "
    "savol generatsiya qiluvchi yordamchisan. Bir kun uchun bir nechta "
    "nomzod savol yaratasan — ulardan eng yaxshi 5 tasi tanlanib, barcha "
    "foydalanuvchilarga bir xil ko'rinishda beriladi.\n\n"
    f"{CORE_PRINCIPLE}\n\n"
    f"{HARD_RULES}\n\n"
    f"{IDEAL_SHAPES}\n\n"
    f"{DIFFICULTY_RULES}\n\n"
    f"{OPTION_QUALITY_RULES}\n\n"
    f"{EXPLANATION_RULE}\n\n"
    f"{SOURCE_RULE}\n\n"
    f"{CONCEPT_TAG_RULE}\n\n"
    f"{MYTH_BLACKLIST}\n\n"
    "\"Buni kim aytgan?\" turidagi iqtibos-muallif savollari taqiqlanadi. "
    "Barcha matn o'zbek tilida (lotin yozuvi, standart imlo — o' va g' "
    "harflarini to'g'ri ishlat). Faqat JSON qaytar, boshqa matn yozma."
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
                    "concept_tag":   {"type": "string"},
                },
                "required": [
                    "question_text", "options", "correct_index", "explanation",
                    "source", "difficulty", "concept_tag",
                ],
            },
        },
    },
    "required": ["questions"],
}

# Overproduce 10 candidates per day ("generate 10, keep the best 5"), split
# close to the final 2/2/1 so rejections don't drain one bucket.
CANDIDATE_MIX = {"easy": 4, "medium": 4, "hard": 2}


def build_user_prompt(
    category: dict,
    sub_topic: str,
    avoid_questions: list[str] | None = None,
    recent_tags: list[str] | None = None,
) -> str:
    """category: a category_config entry. sub_topic: one of its sub_topics.
    recent_tags: the category's most recent concept tags (anti-anchor list)."""
    mix_lines = "\n".join(f"- {level}: {n} ta" for level, n in CANDIDATE_MIX.items())

    examples_block = ""
    if category.get("examples"):
        listed = "\n".join(f"- {q} -> {a}" for q, a in category["examples"])
        examples_block = f"\nShu mavzudagi yaxshi savollar namunasi (aynan bularni takrorlama):\n{listed}\n"

    tags_block = ""
    if recent_tags:
        tags_block = (
            "\nQuyidagi konsept teglariga oid faktlar yaqinda ishlatilgan — shu "
            "faktlarga oid savol YARATMA:\n" + ", ".join(recent_tags[:50]) + "\n"
        )

    avoid_block = ""
    if avoid_questions:
        listed = "\n".join(f"- {q}" for q in avoid_questions[:20])
        avoid_block = (
            "\nQuyidagi savollar allaqachon nomzod sifatida ko'rib chiqilgan — "
            f"bularni yoki ularga o'xshashlarini QAYTA YARATMA:\n{listed}\n"
        )

    return (
        f"Mavzu: {category['label']} — {category['brief']}.\n"
        f"Bugungi yo'nalish: {sub_topic}. Barcha savollar shu yo'nalish doirasida bo'lsin.\n"
        f"Konsept tegi prefiksi: {category['tag_prefix']}_\n"
        f"{examples_block}"
        f"\nJami {sum(CANDIDATE_MIX.values())} ta nomzod savol yarat, quyidagi "
        f"qiyinchilik taqsimoti bo'yicha:\n{mix_lines}\n"
        f"{tags_block}"
        f"{avoid_block}"
        "\nHar bir savol boshqa faktga oid bo'lsin."
    )
