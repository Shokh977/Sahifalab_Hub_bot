"""
question_review_v1.py — the "hot" review of a USER-submitted 5 Savol
question ("Siz ham savol yuboring"). Unlike daily_quiz_deepcheck_v2, this
call does not decide anything: every field is advice for the admin, who
approves or rejects. The one exception is the content screen — offensive,
spam, promotional, private-person or not-a-question submissions are
rejected without reaching the queue (question_submission_service).

It runs ALONGSIDE question_cold_answer_v1 (the cold check, which never sees
the submitter's answer). This call sees the submitter's answer, so it is
the right place for: content screen, mutual exclusivity, distractor
plausibility, the quality rules and the myth blacklist, Uzbek orthography,
classification (category / difficulty / concept_tag) and the confidence
rating.

`marked_answer_verdict` is separate from `confidence` on purpose: in the
first sample run the model rated its OWN certainty ("high") on a question
whose marked answer it knew was wrong. coerce() never lets a wrong or
myth-asserting answer read above 'low'.

`unverifiable` is a first-class answer, not a failure: local Uzbek
history, regional traditions and obscure literary detail are exactly what
users will know and the model will not. A confident wrong "verified" is
worse than an honest "I cannot check this" — the prompt says so twice.
"""
from app.services.ai.prompts.daily_quiz_deepcheck_v2 import BANNED_CONTENT_REMINDER

VERSION = "question_review.v1"

CONTENT_ISSUES = ["none", "offensive", "spam", "promotional", "private_person", "not_factual_question", "other"]
CONFIDENCE = ["high", "medium", "low", "unverifiable"]
MARKED = ["correct", "incorrect", "unsure"]
DIFFICULTIES = ["easy", "medium", "hard"]

SYSTEM_PROMPT = (
    "Sen \"5 Savol\" kundalik viktorinasi uchun FOYDALANUVCHI yuborgan "
    "savolni ko'rib chiquvchi yordamchisan. Savolni foydalanuvchi o'zi "
    "yozgan: savol, 4 variant va u to'g'ri deb belgilagan javob. Sening "
    "vazifang qaror qilish emas — adminga MASLAHAT berish. Admin oxirgi "
    "qarorni o'zi qabul qiladi.\n\n"
    "Har bir band bo'yicha tekshir:\n\n"
    "1. content_issue — savol viktorinaga umuman yaroqlimi?\n"
    "   - offensive: haqorat, nafrat, behayo yoki siyosiy/diniy tahqir\n"
    "   - spam: ma'nosiz matn, takroriy belgilar, test uchun yozilgan narsa\n"
    "   - promotional: reklama, kanal/sayt/mahsulot targ'iboti, havola\n"
    "   - private_person: oddiy (mashhur bo'lmagan) shaxs haqida shaxsiy "
    "ma'lumot — ism-familiya, manzil, telefon, \"sinfdoshim kim?\" kabi\n"
    "   - not_factual_question: fakt so'ramaydi (fikr, \"eng zo'r\", "
    "topishmoq, hazil, shaxsiy savol)\n"
    "   - other: boshqa jiddiy muammo (content_reason ichida yoz)\n"
    "   - none: muammo yo'q\n\n"
    "2. mutually_exclusive — 4 variant bir-biridan aniq ajralib turadimi? "
    "Bir variant boshqasining ichiga kirsa yoki ustma-ust tushsa — false. "
    "Ayniqsa ochiq oraliqlarni tekshir: \"12 soatdan ko'p\" variantI "
    "\"14-17 soat\" ni ham qamrab oladi; \"kamida 10\", \"... gacha\", "
    "\"... dan ortiq\" kabilar boshqa raqamli variantlar bilan deyarli doim "
    "ustma-ust tushadi. exclusivity_note ichida qaysi variantlar ekanini yoz.\n\n"
    "3. absurd_option_indexes — FAQAT hech kim, hatto taxmin qilib ham "
    "tanlamaydigan hazil yoki ma'nosiz variantlar (masalan, poytaxt savolida "
    "\"Oy\"). Shunchaki noto'g'ri, lekin bir xil turdagi variant bema'ni "
    "EMAS. also_correct_option_indexes — "
    "belgilangan javobdan tashqari, asosli dalil bilan to'g'ri deb "
    "himoyalash mumkin bo'lgan variantlar. Indekslar 0 dan boshlanadi.\n\n"
    "4. Sifat qoidalari:\n"
    "   - is_term_question: to'g'ri javob effekt, nazariya, tamoyil yoki "
    "sindromning NOMI (\"... qanday nomlanadi?\" savollari ham) — true\n"
    "   - answer_is_date_or_statistic: javob sana, yil, aholi soni yoki "
    "boshqa statistik ko'rsatkich — true\n"
    "   - myth_asserted: quyidagi afsonalardan biri HAQIQAT sifatida "
    "taqdim etilgan — true (afsonani rad etish mumkin):\n"
    f"{BANNED_CONTENT_REMINDER}\n"
    "5. orthography_issues — o'zbek lotin imlosidagi xatolar: o' / g' "
    "noto'g'ri yoki buzuq yozilgan (\"o`\", \"g’\" aralash, \"ozbek\" "
    "o'rniga \"o'zbek\" kerak kabi), xorijiy nomlarning noto'g'ri "
    "transliteratsiyasi. Har biri qisqa: \"xato -> to'g'ri\". Bo'lmasa bo'sh "
    "ro'yxat.\n\n"
    "6. Tasnif:\n"
    "   - category: berilgan kategoriyalar ro'yxatidan BITTA kalit. Hech biri "
    "mos kelmasa \"boshqa\".\n"
    "   - difficulty: easy (ko'pchilik mantiqan topadi), medium (biroz "
    "bilim kerak), hard (kam odam biladi).\n"
    "   - concept_tag: savol tayangan FAKTning ingliz tilidagi qisqa "
    "snake_case nomi (masalan algorithm_name_origin, honey_never_spoils). "
    "Agar savol pastdagi mavjud teglardan biri bilan AYNAN BIR XIL faktni "
    "so'rasa, matching_existing_tag ga o'sha tegni aynan ko'chir; aks holda "
    "bo'sh satr.\n\n"
    "7. suggested_explanation — nega belgilangan javob to'g'ri ekanini "
    "tushuntiruvchi BITTA qisqa jumla (o'zbek lotin). Javobni takrorlama — "
    "yangi tafsilot qo'sh. Agar belgilangan javob noto'g'ri yoki "
    "tekshirib bo'lmasa — bo'sh satr.\n\n"
    "8. marked_answer_verdict — FOYDALANUVCHI BELGILAGAN javob haqida "
    "(sening bilimingiz haqida emas!):\n"
    "   - correct: belgilangan javob to'g'ri\n"
    "   - incorrect: belgilangan javob noto'g'ri (boshqa variant to'g'ri yoki "
    "javob afsona)\n"
    "   - unsure: aniq ayta olmaysan\n\n"
    "9. confidence — belgilangan javob TO'G'RI ekaniga ishonching:\n"
    "   - high: belgilangan javob to'g'ri, bu fakt xalqaro manbalarda keng "
    "hujjatlashtirilgan va sen uni aniq bilasan\n"
    "   - medium: katta ehtimol bilan to'g'ri\n"
    "   - low: shubhang bor yoki belgilangan javob noto'g'ri deb o'ylaysan "
    "(marked_answer_verdict = incorrect bo'lsa — har doim low)\n"
    "   - unverifiable: tekshira olmaysan. Mahalliy o'zbek tarixi, viloyat va "
    "tuman urf-odatlari, mahalliy joylar, kam ma'lum adabiy tafsilotlar "
    "(dostonning qaysi bobida nima borligi kabi) — agar fakt xalqaro "
    "manbalarda keng uchramasa, odatda shu javob to'g'ri.\n"
    "   MUHIM: taxmin QILMA. Faqat o'xshash narsani eslash yoki \"mantiqan "
    "shunday bo'lsa kerak\" — bu bilish emas, \"unverifiable\" qaytar. "
    "Ishonch bilan aytilgan noto'g'ri tasdiq halol \"tekshira olmayman\" dan "
    "ancha yomon. confidence_reason — bitta qisqa jumla.\n\n"
    "Faqat JSON qaytar, boshqa matn yozma."
)

JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "content_issue":               {"type": "string", "enum": CONTENT_ISSUES},
        "content_reason":              {"type": "string"},
        "mutually_exclusive":          {"type": "boolean"},
        "exclusivity_note":            {"type": "string"},
        "absurd_option_indexes":       {"type": "array", "items": {"type": "integer"}},
        "also_correct_option_indexes": {"type": "array", "items": {"type": "integer"}},
        "is_term_question":            {"type": "boolean"},
        "answer_is_date_or_statistic": {"type": "boolean"},
        "myth_asserted":               {"type": "boolean"},
        "quality_note":                {"type": "string"},
        "orthography_issues":          {"type": "array", "items": {"type": "string"}},
        "category":                    {"type": "string"},
        "difficulty":                  {"type": "string", "enum": DIFFICULTIES},
        "concept_tag":                 {"type": "string"},
        "matching_existing_tag":       {"type": "string"},
        "suggested_explanation":       {"type": "string"},
        "marked_answer_verdict":       {"type": "string", "enum": MARKED},
        "confidence":                  {"type": "string", "enum": CONFIDENCE},
        "confidence_reason":           {"type": "string"},
    },
    "required": [
        "content_issue", "content_reason", "mutually_exclusive", "exclusivity_note",
        "absurd_option_indexes", "also_correct_option_indexes", "is_term_question",
        "answer_is_date_or_statistic", "myth_asserted", "quality_note", "orthography_issues",
        "category", "difficulty", "concept_tag", "matching_existing_tag",
        "suggested_explanation", "marked_answer_verdict", "confidence", "confidence_reason",
    ],
}


def build_user_prompt(submission: dict, categories: list[dict], existing_tags: list[str]) -> str:
    options_block = "\n".join(f"{i}. {opt}" for i, opt in enumerate(submission["options"]))
    category_block = "\n".join(f"- {c['key']}: {c['label']}" for c in categories)
    tags_block = ", ".join(existing_tags) if existing_tags else "(yo'q)"
    parts = [
        f"Savol: {submission['question_text']}",
        f"Variantlar:\n{options_block}",
        f"Foydalanuvchi belgilagan to'g'ri javob indeksi: {submission['correct_index']}",
    ]
    if submission.get("explanation"):
        parts.append(f"Foydalanuvchi izohi: {submission['explanation']}")
    if submission.get("source_note"):
        parts.append(f"Foydalanuvchi qayerdan biladi: {submission['source_note']}")
    parts.append(f"Kategoriyalar:\n{category_block}\n- boshqa: Boshqa")
    parts.append(f"Oxirgi 120 kunda ishlatilgan teglar: {tags_block}")
    return "\n\n".join(parts)


def coerce(data: dict, n_options: int = 4) -> dict:
    """The model's JSON, made safe to store and sort on: unknown enum values
    fall back to the cautious side (an unknown confidence reads as
    'unverifiable', so it lands near the top of the admin queue, never
    silently as 'high'), indexes are kept in range."""
    def idx_list(v):
        return sorted({i for i in (v or []) if isinstance(i, int) and 0 <= i < n_options})

    issue = data.get("content_issue")
    conf = data.get("confidence") if data.get("confidence") in CONFIDENCE else "unverifiable"
    diff = data.get("difficulty")
    marked = data.get("marked_answer_verdict") if data.get("marked_answer_verdict") in MARKED else "unsure"
    # The model rating its OWN knowledge as "high" while saying the user's
    # answer is wrong happened in the first sample run: the confidence is
    # about the marked answer, so a wrong answer is never above 'low', and an
    # asserted myth can't be either.
    if conf in ("high", "medium") and (marked == "incorrect" or data.get("myth_asserted") is True):
        conf = "low"
    return {
        "content_issue": issue if issue in CONTENT_ISSUES else "none",
        "content_reason": str(data.get("content_reason") or "")[:300],
        "mutually_exclusive": data.get("mutually_exclusive") is not False,
        "exclusivity_note": str(data.get("exclusivity_note") or "")[:300],
        "absurd_option_indexes": idx_list(data.get("absurd_option_indexes")),
        "also_correct_option_indexes": idx_list(data.get("also_correct_option_indexes")),
        "is_term_question": data.get("is_term_question") is True,
        "answer_is_date_or_statistic": data.get("answer_is_date_or_statistic") is True,
        "myth_asserted": data.get("myth_asserted") is True,
        "quality_note": str(data.get("quality_note") or "")[:300],
        "orthography_issues": [str(x)[:120] for x in (data.get("orthography_issues") or [])][:10],
        "category": str(data.get("category") or "").strip(),
        "difficulty": diff if diff in DIFFICULTIES else "medium",
        "concept_tag": str(data.get("concept_tag") or "").strip(),
        "matching_existing_tag": str(data.get("matching_existing_tag") or "").strip(),
        "suggested_explanation": str(data.get("suggested_explanation") or "").strip()[:300],
        "marked_answer_verdict": marked,
        "confidence": conf,
        "confidence_reason": str(data.get("confidence_reason") or "")[:300],
    }
