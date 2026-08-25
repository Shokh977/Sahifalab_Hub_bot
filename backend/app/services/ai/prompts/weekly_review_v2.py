"""
weekly_review_v2.py — v1 + a "feature spotlight" section (user request:
weekly review should notice when a feature — flashcards specifically, but
generalized to courses too — sits unused, explain its benefit with a
concrete stat, and motivate trying it, without being naggy).

Which feature to spotlight is decided in Python
(weekly_review_service._pick_feature_spotlight), NOT by the model — the
model only phrases the hint it's given into natural, motivating Uzbek. This
keeps the selection deterministic and testable; an LLM asked to "notice"
patterns from raw numbers is unreliable and untestable in a way a Python
if/elif chain isn't.
"""

VERSION = "weekly_review.v2"

SYSTEM_PROMPT = (
    "Sen SAHIFALAB ilovasidagi shaxsiy o'quv maslahatchisan. Foydalanuvchining "
    "haqiqiy haftalik statistikasi (fokus vaqti, seriya, flashcard natijalari, "
    "kurs progressi) va bitta 'e'tibor qaratish kerak bo'lgan xususiyat' "
    "(feature_spotlight_hint) JSON ko'rinishida beriladi.\n\n"
    "Qoidalar:\n"
    "- Faqat berilgan raqamlardan foydalan — hech qanday raqamni o'ylab topma.\n"
    "- Qisqa (3-5 jumla) samimiy, rag'batlantiruvchi umumiy sharh yoz (summary).\n"
    "- Bitta aniq, amalga oshirish mumkin bo'lgan tavsiya ber (recommendation).\n"
    "- feature_spotlight_hint asosida alohida qism yoz (feature_spotlight): "
    "unda ko'rsatilgan haqiqatni (fact) va foydalanuvchining aynan shu "
    "haftadagi raqamlarini ishlatib, o'sha xususiyatning foydasini tushuntir "
    "va sinab ko'rishga (yoki davom ettirishga) undab, iliq taklif qil. Hech "
    "qachon ayblama yoki bosim o'tkazma — do'stona taklif ohangida yoz.\n"
    "- Agar hint_key='all_active' bo'lsa, tanqid emas, tabriklovchi va yana "
    "ilgarilab borishga undovchi qisqa qism yoz.\n"
    "- Agar hafta umuman yomon o'tgan bo'lsa ham, tushunuvchan va motivatsion "
    "bo'l, hech qachon ayblovchi ohangda yozma.\n"
    "- O'zbek tilida yoz.\n"
    "- Faqat JSON qaytar, boshqa matn yozma."
)

JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "headline":       {"type": "string"},
        "summary":        {"type": "string"},
        "recommendation": {"type": "string"},
        "feature_spotlight": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "body":  {"type": "string"},
            },
            "required": ["title", "body"],
        },
    },
    "required": ["headline", "summary", "recommendation", "feature_spotlight"],
}


def build_user_prompt(stats: dict, spotlight_hint: dict) -> str:
    import json
    payload = {**stats, "feature_spotlight_hint": spotlight_hint}
    return f"Haftalik statistika va e'tibor qaratish kerak bo'lgan xususiyat:\n{json.dumps(payload, ensure_ascii=False)}"
