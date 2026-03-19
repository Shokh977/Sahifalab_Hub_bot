import re
from collections import Counter
from typing import List

UZ_STOPWORDS = {
    "va", "ham", "bu", "shu", "o\'sha", "lekin", "ammo", "bilan", "uchun", "yoki",
    "deb", "ekan", "edi", "bor", "yo\'q", "bir", "ikki", "uch", "ning", "ni", "ga",
    "da", "dan", "ko\'p", "juda", "eng", "hamma", "qiladi", "qilgan", "bo\'ladi", "bo\'lgan",
    "siz", "biz", "ular", "u", "men", "sen", "kim", "nima", "qachon", "qayerda", "nima uchun",
}


def _normalize(text: str) -> str:
    text = text.replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def split_sentences(text: str) -> List[str]:
    normalized = _normalize(text)
    if not normalized:
        return []
    parts = re.split(r"(?<=[.!?])\s+", normalized)
    return [p.strip() for p in parts if p.strip()]


def _tokenize(text: str) -> List[str]:
    words = re.findall(r"[a-zA-Z\u00C0-\u024F\u0400-\u04FF\']+", text.lower())
    return [w for w in words if len(w) > 2 and w not in UZ_STOPWORDS]


def extractive_summary(text: str, max_sentences: int = 4) -> str:
    sentences = split_sentences(text)
    if not sentences:
        return ""

    if len(sentences) <= max_sentences:
        return " ".join(sentences)

    corpus_words = _tokenize(" ".join(sentences))
    if not corpus_words:
        return " ".join(sentences[:max_sentences])

    freq = Counter(corpus_words)

    scored = []
    for idx, sentence in enumerate(sentences):
        words = _tokenize(sentence)
        if not words:
            continue
        score = sum(freq[w] for w in words) / max(len(words), 1)
        scored.append((idx, score, sentence))

    if not scored:
        return " ".join(sentences[:max_sentences])

    top = sorted(scored, key=lambda x: x[1], reverse=True)[:max_sentences]
    top_sorted = sorted(top, key=lambda x: x[0])
    return " ".join([s for _, _, s in top_sorted])


def key_points(text: str, max_points: int = 5) -> List[str]:
    summary_sentences = split_sentences(extractive_summary(text, max_points))
    return summary_sentences[:max_points]


def answer_in_uzbek(text: str, question: str | None, summary: str) -> str:
    if not question:
        return (
            "Mana, kitob matni asosida qisqa va aniq mazmun tayyorladim. "
            "Agar xohlasangiz, keyingi bosqichda bo'limma-bo'lim tushuntirib beraman."
        )

    q_tokens = set(_tokenize(question))
    sentences = split_sentences(text)

    if q_tokens and sentences:
        scored = []
        for sentence in sentences:
            s_tokens = set(_tokenize(sentence))
            overlap = len(q_tokens & s_tokens)
            scored.append((overlap, sentence))
        best = sorted(scored, key=lambda x: x[0], reverse=True)[:2]
        matched = [s for score, s in best if score > 0]

        if matched:
            return (
                f"Savolingiz: \"{question.strip()}\"\n\n"
                "Matnga tayangan holda qisqa javob:\n"
                f"{' '.join(matched)}\n\n"
                "Istasangiz, bu mavzuni sodda misollar bilan ham tushuntiraman."
            )

    return (
        f"Savolingiz: \"{question.strip()}\"\n\n"
        "Aniq javob uchun matnda yetarli dalil topilmadi. Lekin umumiy mazmun quyidagicha:\n"
        f"{summary}\n\n"
        "Xohlasangiz savolni biroz aniqroq yozing, men matndan topib javob beraman."
    )
