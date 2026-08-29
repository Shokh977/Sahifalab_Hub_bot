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
    "- Til: agar foydalanuvchi ko'rsatmasida aniq chiqish tili berilgan bo'lsa "
    "(masalan \"Chiqish tili: ingliz\"), barcha kartalarni (deck_title ham) "
    "o'sha tilda yoz. Aks holda, manba matni yoki rasmidagi tilni saqla — "
    "boshqa tilga tarjima QILMA (masalan, ingliz tilidagi manbadan ingliz "
    "tilidagi kartalar yarat, uni o'zbekchaga tarjima qilma).\n"
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

# Client sends an ISO-ish code (or omits it / sends "auto"). Names here are
# only used to phrase the instruction in Uzbek for the model; any other
# code (e.g. "ko", "fr") is still passed through verbatim as a fallback so
# language support isn't hard-limited to this map.
_LANGUAGE_NAMES = {
    "uz": "o'zbek",
    "en": "ingliz",
    "ru": "rus",
    "ar": "arab",
    "tr": "turk",
    "ko": "koreys",
    "de": "nemis",
    "fr": "fransuz",
    "es": "ispan",
}


def _language_instruction(language: "str | None") -> str:
    if not language or language == "auto":
        return ""
    label = _LANGUAGE_NAMES.get(language.lower(), language)
    return f" Chiqish tili: {label}."


def build_user_prompt(source_text: str, language: "str | None" = None) -> str:
    truncated = source_text[:MAX_INPUT_CHARS]
    instruction = _language_instruction(language)
    return f"Quyidagi matndan flashcard to'plami yarat.{instruction}\n\n{truncated}"


def build_image_prompt(language: "str | None" = None) -> str:
    instruction = _language_instruction(language)
    return f"Ushbu rasmdagi matndan flashcard to'plami yarat.{instruction}"
