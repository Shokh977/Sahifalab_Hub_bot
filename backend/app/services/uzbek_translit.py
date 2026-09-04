"""
uzbek_translit.py — deterministic (no AI call) spelling/transliteration
check for common foreign names and terms in AI-generated Uzbek quiz text.

Deliberately NOT an AI call: an AI-based spelling checker can itself
hallucinate a "correction" as confidently as it hallucinated the original
error. A plain lookup table can only ever flag what's actually in the
table — it can miss new mistakes, but it can never invent one. Bug B's
`Honavar effekti` (an invented effect, not a misspelled real one) is
explicitly NOT this module's job — that's daily_quiz_deepcheck_v1's
distractors_real check.

WRONG_TO_CORRECT maps a common wrong rendering -> the canonical Uzbek
rendering this project has settled on. Matching is case-insensitive and
word-boundary-based so "Halo" inside "Hloya" isn't a partial
false-positive trap.

Maintenance note: only the four bug-batch entries below (hloya, germanning,
mavqye, plus the Ebbinghaus/Kahneman/Zeigarnik/Dunning-Kruger canonical
forms) have been verified against this project's own admin-reviewed
output; the "correct" side of each mapping should be re-confirmed by
whoever owns editorial style for Uzbek transliteration before this list is
treated as authoritative — add new confirmed-wrong variants here as they
turn up in future review batches, same as any other admin-maintained
blacklist in this codebase.
"""
import re

WRONG_TO_CORRECT: dict[str, str] = {
    # Bug B batch — confirmed garbled in live output.
    "hloya":      "halo",
    "germanning": "hermanning",
    "mavqye":     "mavqe",
    # Hermann Ebbinghaus — canonicalized to the Uzbek/Russian-transliteration
    # convention already used elsewhere in this project's Uzbek content
    # ("Ebbingauz"), rather than leaving the raw English spelling untranslated.
    "ebbinghaus": "ebbingauz",
    "ebingauz":   "ebbingauz",
    # Daniel Kahneman — the silent 'h' is dropped in the standard Uzbek
    # rendering (matches Russian "Канеман").
    "kahneman":   "kaneman",
    # Zeigarnik effect — Uzbek rendering follows the Russian "Зейгарник".
    "zeigarnik":  "zeygarnik",
    # Dunning-Kruger effect — same Russian-transliteration convention.
    "dunning-kruger": "danning-kryuger",
    "dunning kruger":  "danning-kryuger",
}


def find_translit_issues(candidate: dict) -> list[dict]:
    """Scans question_text/options/explanation/source for any known-wrong
    variant. Returns a list of {field, wrong, correct} — empty if clean.
    Pure string matching, deterministic, no network/AI call."""
    fields = {
        "question_text": candidate.get("question_text", ""),
        "options": " ".join(candidate.get("options") or []),
        "explanation": candidate.get("explanation", ""),
        "source": candidate.get("source", ""),
    }
    issues = []
    for field, text in fields.items():
        if not text:
            continue
        for wrong, correct in WRONG_TO_CORRECT.items():
            if re.search(rf"\b{re.escape(wrong)}\b", text, re.IGNORECASE):
                issues.append({"field": field, "wrong": wrong, "correct": correct})
    return issues
