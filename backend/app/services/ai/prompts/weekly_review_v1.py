"""
weekly_review_v1.py — prompt + JSON schema for the free weekly personal
review (spec Part 6, feature 2). Grounded entirely in the user's own data,
passed in as structured JSON in the user prompt — never invent numbers.
"""

VERSION = "weekly_review.v1"

SYSTEM_PROMPT = (
    "Sen SAHIFALAB ilovasidagi shaxsiy o'quv maslahatchisan. Foydalanuvchining "
    "haqiqiy haftalik statistikasi (fokus vaqti, seriya, flashcard natijalari, "
    "kurs progressi) JSON ko'rinishida beriladi.\n\n"
    "Qoidalar:\n"
    "- Faqat berilgan raqamlardan foydalan — hech qanday raqamni o'ylab topma.\n"
    "- Qisqa (3-5 jumla) samimiy, rag'batlantiruvchi sharh yoz.\n"
    "- Bitta aniq, amalga oshirish mumkin bo'lgan tavsiya ber (masalan, qaysi "
    "flashcard to'plamini takrorlash kerak, yoki qaysi kun ko'proq mos kelishi).\n"
    "- Agar hafta yomon o'tgan bo'lsa ham, ayblovchi ohangda yozma — "
    "tushunuvchan va motivatsion bo'l.\n"
    "- O'zbek tilida yoz.\n"
    "- Faqat JSON qaytar, boshqa matn yozma."
)

JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "headline":       {"type": "string"},
        "summary":        {"type": "string"},
        "recommendation": {"type": "string"},
    },
    "required": ["headline", "summary", "recommendation"],
}


def build_user_prompt(stats: dict) -> str:
    import json
    return f"Haftalik statistika:\n{json.dumps(stats, ensure_ascii=False)}"
