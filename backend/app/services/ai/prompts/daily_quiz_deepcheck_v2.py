"""
daily_quiz_deepcheck_v2.py — the "hot" second-pass content check, run
alongside (not instead of) daily_quiz_verify_v1's cold answer-only check.

v1's five criteria are unchanged (mutual exclusivity, real distractors,
difficulty floor, single defensible answer, banned content — see
daily_quiz_deepcheck_v1.py for the bugs each one catches). v2 adds the two
checks from the 5-savol-expanded-categories spec:

  6. is_term_question — the correct answer is the NAME of an effect,
     theory, principle or syndrome ("Serial mavqe effekti"). A label is
     never a fact worth repeating. -> reject when true.
  7. worth_repeating — would someone tell a friend about this fact?
     Subjective, but catches dull-but-technically-valid output better than
     any rule. -> reject when false.

The banned-content list also grows to the spec's expanded myth blacklist
and the no-dates/years/statistics rule. Debunking a myth (the "Keng
tarqalgan xato" category) is allowed; asserting one is not.
"""

VERSION = "daily_quiz_deepcheck.v2"

BANNED_CONTENT_REMINDER = (
    "Quyidagilar har doim rad etiladi (banned_content_found = true):\n"
    "- Javob sifatida sana, yil, aholi soni yoki boshqa statistik ko'rsatkich "
    "(\"Qaysi yilda...?\" savollari ham)\n"
    "- \"Buni kim aytgan?\" turidagi iqtibos-muallif savoli\n"
    "- Quyidagi afsonalardan birini HAQIQAT sifatida taqdim etish (to'g'ri "
    "javobda, tushuntirishda yoki savol matnida): o'rganish uslublari, "
    "chap/o'ng miya shaxsiyat turlari, \"miyaning faqat 10 foizidan "
    "foydalanish\", odatiy \"10 000 soat qoidasi\", marshmallow testi "
    "hayotiy natijalarni bashorat qiladi degan da'vo, Maslou piramidasi, "
    "Motsart effekti, \"kuchli poza\" effekti, ko'p turdagi aql nazariyasi, "
    "\"odat hosil qilish uchun 21 kun kerak\", oltin baliqning 3 soniyalik "
    "xotirasi, buqalar qizil RANGdan g'azablanishi, tildagi ta'm xaritasi, "
    "Xitoy devori kosmosdan ko'rinishi, Napoleon past bo'yli bo'lgani, "
    "vikinglarning shoxli dubulg'asi, Eynshteyn matematikadan yiqilgani, "
    "chaqmoq bir joyga ikki marta tushmasligi, uyquda o'rgimchak yutish, "
    "QWERTY yozishni sekinlashtirish uchun yaratilgani, tana ichidagi qon "
    "ko'k ekani.\n"
    "  Muhim: afsonani RAD ETADIGAN savol (masalan \"Buqalar qizil rangdan "
    "g'azablanadimi?\" -> \"Yo'q, ular harakatni sezadi\") taqiqlanmaydi — "
    "faqat afsonani haqiqat deb ko'rsatish taqiqlanadi.\n"
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
    "ichida\" kabi), bu FALSE.\n\n"
    "2. distractors_real — noto'g'ri 3 variantning HAR BIRI haqiqatda "
    "mavjud bo'lgan narsa (real shaxs, joy, kitob, buyum, tushuncha)mi? "
    "Ishonarli eshitiladigan, lekin hech qanday manbada uchramaydigan "
    "o'ylab topilgan nom — bu FALSE.\n\n"
    "3. meets_difficulty_floor — 'easy' deb belgilangan savollar uchun: "
    "savol ko'pchilik oldindan bilmaydigan, lekin mantiqan topish mumkin "
    "bo'lgan narsami? Bitta so'zni tarjima qilish, maktab darsligidan oddiy "
    "eslash yoki hamma biladigan umumiy bilim — bu FALSE. 'medium'/'hard' "
    "uchun avtomatik true qaytar.\n\n"
    "4. single_defensible_answer — savolni birinchi marta ko'rgan odam "
    "sifatida: faqat bitta variant himoyalanishi mumkinmi? Boshqa variant "
    "ham asosli argument bilan himoyalanishi mumkin bo'lsa — FALSE.\n\n"
    "5. banned_content_found — quyidagi taqiqlangan mazmunlardan biri "
    "uchraydimi?\n"
    f"{BANNED_CONTENT_REMINDER}\n"
    "6. is_term_question — to'g'ri javob biror effekt, nazariya, tamoyil, "
    "qonun, sindrom yoki boshqa ATAMANING NOMImi? (masalan \"Serial mavqe "
    "effekti\", \"Dunning-Kruger effekti\"). Savol \"... qanday "
    "nomlanadi?\" / \"... deb ataladi?\" shaklida bo'lsa ham TRUE. Javob "
    "shaxs, joy, buyum, sabab yoki natija bo'lsa — FALSE.\n\n"
    "7. worth_repeating — o'zingdan halol so'ra: oddiy odam bu savolning "
    "javobi va tushuntirishini bilib olgach, uni do'stiga aytib bergisi "
    "keladimi? Fakt hayratlanarli, kutilmagan yoki \"voy, shunaqami?\" "
    "degan tuyg'u uyg'otsa — TRUE. Texnik jihatdan to'g'ri, lekin zerikarli, "
    "quruq yoki darslikdagidek bo'lsa — FALSE.\n\n"
    "verdict — quyidagilarning BARCHASI bajarilsa 'pass': "
    "mutually_exclusive=true, distractors_real=true, "
    "meets_difficulty_floor=true, single_defensible_answer=true, "
    "banned_content_found=false, is_term_question=false, "
    "worth_repeating=true. Aks holda 'fail'.\n\n"
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
        "is_term_question":         {"type": "boolean"},
        "worth_repeating":          {"type": "boolean"},
        "verdict":                  {"type": "string", "enum": ["pass", "fail"]},
        "reasons":                  {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "mutually_exclusive", "distractors_real", "meets_difficulty_floor",
        "single_defensible_answer", "banned_content_found", "is_term_question",
        "worth_repeating", "verdict", "reasons",
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


def passes(data: dict) -> tuple[bool, list[str]]:
    """Re-derives the verdict from the individual flags instead of trusting
    `verdict` alone — a model can set verdict='pass' while flagging a
    failed criterion. Returns (ok, reasons)."""
    failed = []
    if data.get("mutually_exclusive") is not True:
        failed.append("variants overlap (mutually_exclusive)")
    if data.get("distractors_real") is not True:
        failed.append("invented distractor (distractors_real)")
    if data.get("meets_difficulty_floor") is not True:
        failed.append("too easy (meets_difficulty_floor)")
    if data.get("single_defensible_answer") is not True:
        failed.append("more than one defensible answer")
    if data.get("banned_content_found") is not False:
        failed.append("banned content")
    if data.get("is_term_question") is not False:
        failed.append("term question — answer is a name/label")
    if data.get("worth_repeating") is not True:
        failed.append("not worth repeating")
    if data.get("verdict") != "pass" and not failed:
        failed.append("verdict fail")
    if failed:
        return False, (data.get("reasons") or []) + failed
    return True, []
