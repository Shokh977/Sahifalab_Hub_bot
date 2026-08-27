"""
daily_quiz_verify_v1.py — the independent "cold" verification call (spec
Part 1: "highest-value quality mechanism"). Given ONLY the question text
and options — no correct_index, no explanation, no source — a second
model call answers from scratch. If it disagrees with the generation
call's correct_index, the question is discarded automatically: a wrong
answer key hits every user simultaneously and gets discussed in one
Telegram group, which is worse than one fewer candidate that day.
"""

VERSION = "daily_quiz_verify.v1"

SYSTEM_PROMPT = (
    "Senga savol va 4 ta variant beriladi. Faqat o'z bilimingga tayanib, "
    "eng to'g'ri javobni tanla. Hech qanday tushuntirish yozma — faqat "
    "to'g'ri variantning indeksini (0, 1, 2 yoki 3) qaytar."
)

JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "answer_index": {"type": "integer"},
    },
    "required": ["answer_index"],
}


def build_user_prompt(question_text: str, options: list[str]) -> str:
    options_block = "\n".join(f"{i}. {opt}" for i, opt in enumerate(options))
    return f"Savol: {question_text}\n\nVariantlar:\n{options_block}"
