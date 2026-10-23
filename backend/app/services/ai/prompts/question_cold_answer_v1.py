"""
question_cold_answer_v1.py — the cold answer check for a USER-submitted
question: the model gets the question and the 4 options WITHOUT the
submitter's answer and answers from scratch. If it picks a different
option with real confidence, the submitter most likely believes something
false — the highest-value flag in the admin queue.

Differs from daily_quiz_verify_v1 (which always forces an index): the
model may say it doesn't know. A forced guess on a local-history question
would show up as a "disagreement" that is really just ignorance, and the
admin would learn to ignore the flag that matters most.
"""

VERSION = "question_cold_answer.v1"

SYSTEM_PROMPT = (
    "Senga savol va 4 ta variant beriladi. Faqat o'z bilimingga tayanib, "
    "to'g'ri variantni tanla.\n"
    "certainty:\n"
    "- sure: javobni aniq bilasan\n"
    "- likely: katta ehtimol bilan shu\n"
    "- unknown: bilmaysan yoki tekshira olmaysan (mahalliy tarix, kam ma'lum "
    "tafsilot). Bu holda ham eng ehtimolli indeksni yoz, lekin taxmin "
    "qilayotganingni yashirma.\n"
    "Faqat JSON qaytar."
)

CERTAINTY = ["sure", "likely", "unknown"]

JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "answer_index": {"type": "integer"},
        "certainty":    {"type": "string", "enum": CERTAINTY},
    },
    "required": ["answer_index", "certainty"],
}


def build_user_prompt(question_text: str, options: list[str]) -> str:
    options_block = "\n".join(f"{i}. {opt}" for i, opt in enumerate(options))
    return f"Savol: {question_text}\n\nVariantlar:\n{options_block}"


def outcome(answer_index: object, certainty: object, submitter_index: int) -> str:
    """'agree' | 'disagree' | 'inconclusive'. A different pick only counts
    as a disagreement when the model was at least 'likely' — an 'unknown'
    guess is no evidence either way."""
    if not isinstance(answer_index, int) or not 0 <= answer_index <= 3:
        return "inconclusive"
    if certainty not in ("sure", "likely"):
        return "inconclusive"
    return "agree" if answer_index == submitter_index else "disagree"
