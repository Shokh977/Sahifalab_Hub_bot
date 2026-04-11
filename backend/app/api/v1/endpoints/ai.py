from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.schemas.schemas import BookSummarizerRequest, BookSummarizerResponse
from app.services import ai_service
from app.services.auth_service import decode_token

router = APIRouter()


async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    if not authorization:
        raise HTTPException(401, "Avtorizatsiya talab qilinadi")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(401, "Noto'g'ri avtorizatsiya")
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(401, "Token muddati tugagan")
    return tid


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


@router.post('/chat', response_model=ChatResponse)
async def ai_chat(payload: ChatRequest, caller_id: int = Depends(_require_token)):
    """
    Chat endpoint for conversational AI interaction.
    Users can ask questions about books, authors, and learning.
    """
    message = (payload.message or '').strip()
    
    if not message:
        raise HTTPException(status_code=400, detail="Xabar bo'sh bo'lishi mumkin emas.")
    
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Xabar juda uzun. 2000 ta belgigacha qisqartiring.")
    
    reply = await ai_service.chat_response(message)

    return ChatResponse(reply=reply)


@router.post('/book-summarizer', response_model=BookSummarizerResponse)
async def book_summarizer(payload: BookSummarizerRequest, caller_id: int = Depends(_require_token)):
    text = (payload.text or '').strip()
    if len(text) < 120:
        raise HTTPException(status_code=400, detail="Matn juda qisqa. Kamida 120 ta belgi kiriting.")

    max_sentences = payload.max_sentences
    if max_sentences < 2 or max_sentences > 8:
        raise HTTPException(status_code=400, detail="max_sentences 2 va 8 oralig'ida bo'lishi kerak.")

    summary = ai_service.extractive_summary(text, max_sentences=max_sentences)
    points = ai_service.key_points(text, max_points=min(max_sentences + 1, 5))
    answer_fn = getattr(ai_service, "answer_in_uzbek", None)
    if callable(answer_fn):
        assistant_reply = answer_fn(text, payload.question, summary)
    else:
        assistant_reply = summary or "Qisqa izoh hozircha mavjud emas."

    words = text.split()
    sentence_count = len(ai_service.split_sentences(text))

    return BookSummarizerResponse(
        summary=summary,
        assistant_reply=assistant_reply,
        key_points=points,
        word_count=len(words),
        sentence_count=sentence_count,
    )
