"""
daily_quiz_format_v1.py — format-only prompt for the two curated-fact-bank
categories (ozbek_adabiyoti, tarix_meros).

Division of labor (5-savol-quality-fixes brief, Part 4): for these two
categories the model NEVER supplies the underlying fact — an admin already
verified it into curated_facts (content-bot repo, mirrors the existing
quote-bank pattern). This prompt's ONLY job is to turn one verified fact
into a question with 3 plausible-but-wrong distractors and a one-line
explanation. It must not add, alter, or embellish the fact itself — the
model is good at writing plausible wrong options around a fact it's given,
and unreliable at producing the fact in the first place (this is exactly
the failure mode that produced Bug B's hallucinated "Honavar effekti," in
a domain — Western psychology — where this model's knowledge is stronger
than it is for Uzbek literature/history).
"""

VERSION = "daily_quiz_format.v1"

SYSTEM_PROMPT = (
    "Senga TASDIQLANGAN, tekshirilgan bitta fakt beriladi. Vazifang — shu "
    "faktni \"5 Savol\" viktorinasi uchun savol shakliga o'tkazish.\n\n"
    "QAT'IY CHEKLOV: senga berilgan faktni O'ZGARTIRMA, KENGAYTIRMA yoki "
    "unga hech narsa QO'SHMA. Sen bu faktning haqiqiyligi uchun javobgar "
    "emassan — buni allaqachon admin tasdiqlagan. Sening yagona vazifang: "
    "shu faktni to'g'ri javob qilib, unga 3 ta ishonarli lekin ANIQ "
    "noto'g'ri distractor variant qo'shib, savol shakliga keltirish.\n\n"
    "Qat'iy qoidalar:\n"
    "- Savol vaziyat yoki savol shaklida bo'lsin, faktni so'zma-so'z "
    "takrorlaydigan shaklda EMAS (masalan, fakt \"Ulug'bek Samarqandda "
    "rasadxona qurdirgan\" bo'lsa, savol \"Ulug'bek Samarqandda nima "
    "qurdirgani bilan mashhur?\" bo'lishi mumkin, lekin faktni ikki marta "
    "aynan takrorlagan savol emas).\n"
    "- 3 ta noto'g'ri variant HAQIQATDA MAVJUD bo'lgan narsalar bo'lishi "
    "kerak (real shaxs, asar, joy, voqea) — o'ylab topilgan nom taqiqlanadi.\n"
    "- 4 variant bir-biridan mutlaq ajralgan bo'lsin, hech biri boshqasining "
    "ichiga kirmasin.\n"
    "- Javob sifatida sana, yil, aholi soni yoki boshqa statistik "
    "ko'rsatkich ISHLATMA — berilgan fakt shunday bo'lsa ham, savolni "
    "sifat/mohiyat jihatiga buray (masalan sana emas, NIMA sodir bo'lgani).\n"
    "- `explanation` — bir qatorli, faktni tasdiqlovchi qisqa tushuntirish.\n"
    "- `difficulty` — savol qanchalik keng tanilganiga qarab 'easy' "
    "(ko'pchilik mantiqan topa oladi lekin bilmaydi), 'medium' yoki 'hard' "
    "belgilang. Umumiy bilim darajasidagi, hamma biladigan savol hech "
    "qachon 'easy' emas — bunday savolni yaratma.\n"
    "- Barcha matn o'zbek tilida (lotin yozuvi, standart imlo — o' va g' "
    "harflarini to'g'ri ishlat).\n\n"
    "Faqat JSON qaytar, boshqa matn yozma."
)

JSON_SCHEMA = {
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
        "explanation":    {"type": "string"},
        "difficulty":     {"type": "string", "enum": ["easy", "medium", "hard"]},
    },
    "required": ["question_text", "options", "correct_index", "explanation", "difficulty"],
}


def build_user_prompt(fact_text: str) -> str:
    return f"Tasdiqlangan fakt: {fact_text}"
