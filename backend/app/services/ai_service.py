import re
from collections import Counter
from typing import List

UZ_STOPWORDS = {
    "va", "ham", "bu", "shu", "o\'sha", "lekin", "ammo", "bilan", "uchun", "yoki",
    "deb", "ekan", "edi", "bor", "yo\'q", "bir", "ikki", "uch", "ning", "ni", "ga",
    "da", "dan", "ko\'p", "juda", "eng", "hamma", "qiladi", "qilgan", "bo\'ladi", "bo\'lgan",
    "siz", "biz", "ular", "u", "men", "sen", "kim", "nima", "qachon", "qayerda", "nima uchun",
}

# Knowledge base for common book-related questions
BOOK_KNOWLEDGE_BASE = {
    "abdulla qahhor": {
        "description": "O'zbek adabiyotining ajoyib biri. U satiraviy hikoyalar va romanlar yozgan.",
        "works": ["Adir Va Bovajon", "Tushkun Qalb"],
        "period": "20-asrning boshida faoliyat ko'rsatgan",
    },
    "berdavli": {
        "description": "O'zbek adabiyotining klassik muallifi.",
        "works": ["Arabiya Kechasi"],
        "period": "19-asrda yashagan",
    },
    "navoi": {
        "description": "O'zbek adabiyotining asosiy yaratuvchisi, shoir va mualliflar.",
        "works": ["Xamsа", "Qamusi gujart"],
        "period": "15-16-asrlarda yashagan",
    },
}

GENERAL_RESPONSES = {
    "salom": "Assalomu alaykum! 👋 Sizga qanday yordam bera olaman?",
    "rahmat": "Marhamat! Yana sizga yordam bera olaman deb umidvaram. 😊",
    "bilmaydi": "Dono bolish kerak! Kitoblar o'qib, bilimlaringizni oshiring. 📚",
}


def _normalize(text: str) -> str:
    """Normalize text by removing extra whitespace and special characters."""
    text = text.replace("\r", " ").replace("\n", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _tokenize(text: str) -> List[str]:
    """Tokenize Uzbek text, removing stopwords."""
    words = re.findall(r"[a-zA-Z\u00C0-\u024F\u0400-\u04FF\']+", text.lower())
    return [w for w in words if len(w) > 2 and w not in UZ_STOPWORDS]


def _detect_question_type(message: str) -> str:
    """Detect if the message is asking about a book, author, or is a greeting."""
    msg_lower = message.lower()
    
    # Check for greeting
    if any(word in msg_lower for word in ["salom", "assalomu", "xush", "yo\'q"]):
        return "greeting"
    
    # Check for thanks
    if any(word in msg_lower for word in ["rahmat", "shukriya"]):
        return "thanks"
    
    # Check for book/author questions
    if any(word in msg_lower for word in ["kitob", "muallif", "shoir", "roman", "hikoya", "asar", "asari"]):
        return "book_question"
    
    # Check for author names
    for author_name in BOOK_KNOWLEDGE_BASE.keys():
        if author_name in msg_lower:
            return "author_question"
    
    # Default to general knowledge question
    return "general_question"


def _get_knowledge_response(message: str) -> str:
    """Search knowledge base for relevant answers about books and authors."""
    msg_lower = message.lower()
    
    # Check if asking about a specific author
    for author_name, info in BOOK_KNOWLEDGE_BASE.items():
        if author_name in msg_lower:
            return (
                f"**{author_name.title()}** haqida:\n\n"
                f"{info['description']}\n\n"
                f"Asarlari: {', '.join(info['works'])}\n"
                f"Davrі: {info['period']}\n\n"
                "Ushbu muallifning kitoblarini o'qish orqali O'zbek adabiyoti bilan tanishishingiz mumkin."
            )
    
    # General book-related responses
    return (
        "O'zbek adabiyoti juda boy va qiziqarli! 📚\n\n"
        "Men siz haqida bilgan narsalarni aytib bera olaman:\n"
        "• Muallif va shoir haqida\n"
        "• Ularning asarlari haqida\n"
        "• O'qish usullari haqida\n\n"
        "Agar konkret muallif yoki kitob haqida bilmoqchi bo'lsangiz, uning nomini ayting!"
    )


def _format_response(text: str) -> str:
    """Format response with nice spacing and emoji."""
    if not text:
        return "Uzur, savol tushunarsiz bo'ldi. Iltimos, aniqroq ayting. 🤔"
    return text.strip()


def chat_response(message: str) -> str:
    """
    Generate a chat response based on user message.
    This is designed to feel like chatting with a knowledgeable friend.
    """
    
    if not message or not message.strip():
        return "Xush, nima deyishni istaysiz? 🤔"
    
    normalized_msg = _normalize(message)
    
    # Detect question type
    question_type = _detect_question_type(normalized_msg)
    
    # Handle greetings
    if question_type == "greeting":
        for key, response in GENERAL_RESPONSES.items():
            if key in normalized_msg.lower():
                return response
        return "Assalomu alaykum! 👋 Kitoblar yoki ta'lim haqida savol bo'lsa, men yordamga tayyorman."
    
    # Handle thanks
    if question_type == "thanks":
        return "Marhamat! 😊 Yana nima yordam kerak?"
    
    # Handle book/author questions
    if question_type == "author_question" or question_type == "book_question":
        response = _get_knowledge_response(normalized_msg)
        return _format_response(response)
    
    # Default general knowledge response
    return (
        "Buguni qanday savolingiz bor? 🤓\n\n"
        "Men sizga quyidagi mavzular bo'yicha yordam bera olaman:\n"
        "• 📚 O'zbek adabiyoti va klassiklari\n"
        "• ✍️ Muallif va shoir haqida\n"
        "• 📖 Kitob qanday o'qish kerak\n"
        "• 💡 O'qish texnikasi va maslahatlar\n\n"
        f"Savolingiz: \"{normalized_msg}\"\n\n"
        "Agar bu mavzulardan biri bo'yicha malumat istasangiz, aniqroq ayting!"
    )


def split_sentences(text: str) -> List[str]:
    normalized = _normalize(text)
    if not normalized:
        return []
    parts = re.split(r"(?<=[.!?])\s+", normalized)
    return [p.strip() for p in parts if p.strip()]


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
