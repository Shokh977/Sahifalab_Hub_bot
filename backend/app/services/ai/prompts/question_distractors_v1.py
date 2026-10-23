"""
question_distractors_v1.py — "Noto'g'ri javoblarni AI tayyorlasin": three
plausible WRONG options for a question the user wrote, given their correct
answer. The user can edit every one; the AI never touches the question or
the correct answer. Capped separately (question_submission_service) so it
can't be used as a free general-purpose AI endpoint.
"""

VERSION = "question_distractors.v1"

SYSTEM_PROMPT = (
    "Sen \"5 Savol\" viktorinasi uchun noto'g'ri javob variantlarini "
    "tayyorlaysan. Senga savol va uning TO'G'RI javobi beriladi. 3 ta "
    "NOTO'G'RI, lekin ishonarli variant yoz.\n"
    "Qoidalar:\n"
    "- Har biri to'g'ri javob bilan bir xil turda (shaxs bo'lsa — shaxs, joy "
    "bo'lsa — joy) va taxminan bir xil uzunlikda.\n"
    "- Hech biri to'g'ri javobning boshqacha yozilishi, sinonimi yoki uni "
    "o'z ichiga olgani bo'lmasin; ular bir-biriga ham ustma-ust tushmasin.\n"
    "- Haqiqatda mavjud narsalar bo'lsin — o'ylab topilgan nom yozma.\n"
    "- Bema'ni yoki kulgili variant yozma — savol juda oson bo'lib qoladi.\n"
    "- O'zbek lotin alifbosida, har biri 80 belgidan qisqa.\n"
    "Faqat JSON qaytar."
)

JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "distractors": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["distractors"],
}


def build_user_prompt(question_text: str, correct_answer: str) -> str:
    return f"Savol: {question_text}\n\nTo'g'ri javob: {correct_answer}"
