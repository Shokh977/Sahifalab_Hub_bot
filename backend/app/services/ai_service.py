import os
import re
from collections import Counter
from typing import List
from dotenv import load_dotenv

load_dotenv()

_GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")

try:
    from google import genai
    from google.genai import types
    _client = genai.Client(api_key=_GEMINI_KEY) if _GEMINI_KEY else None
except Exception:
    genai = None  # type: ignore
    types = None  # type: ignore
    _client = None

_SYSTEM_PROMPT = (
    "Sen SAHIFALAB platformasining AI yordamchisi Sam'san. "
    "16 yoshli aqlli va do'stona mentor sifatida gaplash. "
    "Asosan o'zbek tilida javob ber, lekin foydalanuvchi rus yoki ingliz tilida yozsa, shu tilda javob ber. "
    "Kitoblar, ta'lim, o'z-o'zini rivojlantirish mavzularida yordam ber. "
    "Javoblarni qisqa, aniq va iliqlik bilan ber. Emoji ishlatishingiz mumkin."
)


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


async def chat_response(message: str) -> str:
    """
    Generate a chat response using Google Gemini 2.0 Flash.
    Falls back to a simple local response if the API key is not configured.
    """
    if not message or not message.strip():
        return "Xush, nima deyishni istaysiz? 🤔"

    if not _client:
        return (
            "AI hali sozlanmagan. Administrator GEMINI_API_KEY ni "
            "backend .env fayliga qo'shishi kerak. 🔧"
        )

    try:
        config = types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            max_output_tokens=512,
            temperature=0.7,
        ) if types else None
        response = await _client.aio.models.generate_content(
            model="gemini-flash-lite-latest",
            contents=message,
            config=config,
        )
        return response.text.strip()
    except Exception as e:
        return f"Xatolik yuz berdi: {str(e)}. Iltimos, keyinroq urinib ko'ring. 🙏"


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
