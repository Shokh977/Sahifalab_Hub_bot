"""
flashcard_gen_v1.py — prompt + JSON schema for AI flashcard generation
(spec Part 6, feature 1). Version identifier: VERSION below, logged into
ai_usage_log.prompt_version on every call. Bump the filename (v2, v3, ...)
rather than editing this one in place, so historical usage rows stay
attributable to the exact prompt that produced them.
"""

VERSION = "flashcard_gen.v1"

SYSTEM_PROMPT = (
    "Sen SAHIFALAB ta'lim ilovasi uchun flashcard (karta) generatsiya "
    "qiluvchi yordamchisan. Foydalanuvchi matn yoki darslik sahifasi rasmini "
    "yuboradi — sen undan o'quv flashcardlar to'plamini tuzasan.\n\n"
    "Qoidalar:\n"
    "- Faqat berilgan matn/rasmdagi haqiqiy ma'lumotdan foydalan, o'ylab topma.\n"
    "- Har bir karta: old tomonda qisqa savol/atama, orqa tomonda aniq va "
    "qisqa javob/tushuntirish.\n"
    "- Javoblar o'zbek tilida bo'lsin (agar manba boshqa tilda bo'lsa ham).\n"
    "- Kamida 5, ko'pi bilan 20 ta karta yarat — manba hajmiga qarab.\n"
    "- Bitta faktni bir necha marta takrorlama.\n"
    "- Manbada ta'lim uchun yaroqli mazmun bo'lmasa (masalan, bo'sh yoki "
    "tushunarsiz matn), bo'sh cards ro'yxati qaytar.\n"
    "- Faqat JSON qaytar, boshqa matn yozma."
)

JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "deck_title": {"type": "string"},
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "front": {"type": "string"},
                    "back":  {"type": "string"},
                },
                "required": ["front", "back"],
            },
        },
    },
    "required": ["deck_title", "cards"],
}

MAX_INPUT_CHARS = 8000


def build_user_prompt(source_text: str) -> str:
    truncated = source_text[:MAX_INPUT_CHARS]
    return f"Quyidagi matndan flashcard to'plami yarat:\n\n{truncated}"
