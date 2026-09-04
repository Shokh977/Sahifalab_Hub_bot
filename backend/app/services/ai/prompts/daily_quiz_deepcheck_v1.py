"""
daily_quiz_deepcheck_v1.py — the "hot" second-pass content check, run
alongside (not instead of) daily_quiz_verify_v1's cold answer-only check.

The cold check only re-answers the question blind — it can never catch a
question with two defensible answers, an invented distractor, or an
easy-tier question everyone already knows, because none of those failure
modes are visible from question+options alone. This call sees the FULL
candidate (options, the claimed correct answer, explanation, source,
difficulty) and is asked to judge it, not answer it.

Concrete bugs this exists to catch (see 5-savol-quality-fixes brief):
  - Bug A: "Dastlabki 24 soat ichida" vs "Bir necha soat ichida" as separate
    options — the second is a subset of the first, so there are two
    defensible answers. -> mutually_exclusive = false.
  - Bug B: "Honavar effekti" as a distractor — reads like a real
    psychological effect but names nothing that actually exists.
    -> distractors_real = false.
  - Bug C: "'book' so'zining o'zbekcha tarjimasi" — single-word translation
    that the entire target audience already knows. -> meets_difficulty_floor
    = false, regardless of what difficulty tag the generator claimed.
"""

VERSION = "daily_quiz_deepcheck.v1"

BANNED_CONTENT_REMINDER = (
    "Quyidagilar har doim rad etiladi (banned_content_found = true):\n"
    "- Javob sifatida sana, yil, aholi soni yoki boshqa statistik ko'rsatkich\n"
    "- \"Buni kim aytgan?\" turidagi iqtibos-muallif savoli (noto'g'ri "
    "atributsiya xavfi juda yuqori)\n"
    "- Ilmiy jihatdan rad etilgan yoki chalkash mifologik da'volar: o'rganish "
    "uslublari, chap/o'ng miya shaxsiyat turlari, \"miyaning faqat 10 "
    "foizidan foydalanish\", odatiy \"10,000 soat qoidasi\", marshmallow "
    "testi hayotiy natijalarni bashorat qiladi degan da'vo, Maslou "
    "piramidasi, Motsart effekti, \"kuchli poza\" effekti, ko'p turdagi aql "
    "nazariyasi, \"odat hosil qilish uchun 21 kun kerak\"\n"
)

SYSTEM_PROMPT = (
    "Sen \"5 Savol\" viktorinasi uchun savol sifatini tekshiruvchi "
    "auditorsan. Senga savol, 4 variant, to'g'ri javob indeksi, "
    "tushuntirish, manba va qiyinchilik darajasi to'liq beriladi — vazifang "
    "javob berish emas, BAHOLASH.\n\n"
    "Quyidagi har bir mezon bo'yicha tekshir:\n\n"
    "1. mutually_exclusive — 4 variant bir-biridan aniq ajralib turadimi? "
    "Agar bitta variant boshqasining ICHIGA kirsa yoki ular ustma-ust "
    "tushsa (masalan, vaqt oralig'i, miqdor yoki foiz variantlari bir-birini "
    "qamrab olsa — \"bir necha soat ichida\" va \"dastlabki 24 soat "
    "ichida\" kabi), bu FALSE. Faqat bitta variant to'g'ri va qolganlari "
    "aniq noto'g'ri bo'lishi kerak — hech qanday ikkilanishga o'rin "
    "qolmasligi kerak.\n\n"
    "2. distractors_real — noto'g'ri 3 variantning HAR BIRI haqiqatda "
    "mavjud bo'lgan narsa (real effekt, kitob, shaxs, tushuncha)mi? "
    "Ishonarli eshitiladigan, lekin hech qanday manbada uchramaydigan "
    "o'ylab topilgan atama (masalan, mashhur psixologik effektlar ro'yxatida "
    "yo'q \"effekt\" nomi) — bu FALSE. Har bir distractorni o'z bilimingga "
    "asoslanib alohida tekshir: bu narsa chindan ham mavjudmi?\n\n"
    "3. meets_difficulty_floor — 'easy' deb belgilangan savollar uchun: "
    "savol chindan ham ko'pchilik oldindan bilmaydigan, lekin mantiqan "
    "o'ylab topish mumkin bo'lgan narsami? Agar savol ko'pchilik "
    "foydalanuvchi hech o'ylamasdan to'g'ri javob beradigan darajada oddiy "
    "bo'lsa (masalan, bitta so'zni boshqa tilga tarjima qilish, keng "
    "tarqalgan umumiy bilim) — bu FALSE, qiyinchilik yorlig'idan qat'i "
    "nazar. 'medium'/'hard' uchun bu mezonni avtomatik true qaytar.\n\n"
    "4. single_defensible_answer — savolni birinchi marta ko'rgan, sovuq "
    "holda javob beruvchi odam sifatida o'zingdan so'ra: faqat bitta variant "
    "himoyalanishi mumkinmi, yoki boshqa bir variant ham asosli "
    "argument bilan himoyalanishi mumkinmi? Agar ikkinchisi bo'lsa — FALSE.\n\n"
    "5. banned_content_found — quyidagi ro'yxatdagi taqiqlangan "
    "mazmunlardan biri savolda, javobda yoki tushuntirishda uchraydimi?\n"
    f"{BANNED_CONTENT_REMINDER}\n"
    "verdict — yuqoridagi 5 mezonning BARCHASI o'tsa (mutually_exclusive=true, "
    "distractors_real=true, meets_difficulty_floor=true, "
    "single_defensible_answer=true, banned_content_found=false) 'pass', "
    "aks holda 'fail'.\n\n"
    "reasons — 'fail' bo'lsa, aynan qaysi mezon(lar) va nima uchun "
    "muvaffaqiyatsiz bo'lganini qisqa o'zbek tilida yoz. 'pass' bo'lsa bo'sh "
    "ro'yxat qaytar.\n\n"
    "Faqat JSON qaytar, boshqa matn yozma."
)

JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "mutually_exclusive":       {"type": "boolean"},
        "distractors_real":         {"type": "boolean"},
        "meets_difficulty_floor":   {"type": "boolean"},
        "single_defensible_answer": {"type": "boolean"},
        "banned_content_found":     {"type": "boolean"},
        "verdict":                  {"type": "string", "enum": ["pass", "fail"]},
        "reasons":                  {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "mutually_exclusive", "distractors_real", "meets_difficulty_floor",
        "single_defensible_answer", "banned_content_found", "verdict", "reasons",
    ],
}


def build_user_prompt(candidate: dict) -> str:
    options_block = "\n".join(f"{i}. {opt}" for i, opt in enumerate(candidate["options"]))
    return (
        f"Savol: {candidate['question_text']}\n\n"
        f"Variantlar:\n{options_block}\n\n"
        f"To'g'ri javob indeksi: {candidate['correct_index']}\n"
        f"Tushuntirish: {candidate['explanation']}\n"
        f"Manba: {candidate['source']}\n"
        f"Qiyinchilik darajasi: {candidate['difficulty']}"
    )
