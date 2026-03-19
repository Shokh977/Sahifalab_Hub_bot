from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.schemas.schemas import BookSummarizerRequest, BookSummarizerResponse
from app.services.ai_service import extractive_summary, key_points, answer_in_uzbek, split_sentences, chat_response

router = APIRouter()


class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


@router.post('/chat', response_model=ChatResponse)
async def ai_chat(payload: ChatRequest):
    """
    Chat endpoint for conversational AI interaction.
    Users can ask questions about books, authors, and learning.
    """
    message = (payload.message or '').strip()
    
    if not message:
        raise HTTPException(status_code=400, detail="Xabar bo'sh bo'lishi mumkin emas.")
    
    if len(message) > 2000:
        raise HTTPException(status_code=400, detail="Xabar juda uzun. 2000 ta belgigacha qisqartiring.")
    
    reply = chat_response(message)
    
    return ChatResponse(reply=reply)


@router.post('/book-summarizer', response_model=BookSummarizerResponse)
async def book_summarizer(payload: BookSummarizerRequest):
    text = (payload.text or '').strip()
    if len(text) < 120:
        raise HTTPException(status_code=400, detail="Matn juda qisqa. Kamida 120 ta belgi kiriting.")

    max_sentences = payload.max_sentences
    if max_sentences < 2 or max_sentences > 8:
        raise HTTPException(status_code=400, detail="max_sentences 2 va 8 oralig'ida bo'lishi kerak.")

    summary = extractive_summary(text, max_sentences=max_sentences)
    points = key_points(text, max_points=min(max_sentences + 1, 5))
    assistant_reply = answer_in_uzbek(text, payload.question, summary)

    words = text.split()
    sentence_count = len(split_sentences(text))

    return BookSummarizerResponse(
        summary=summary,
        assistant_reply=assistant_reply,
        key_points=points,
        word_count=len(words),
        sentence_count=sentence_count,
    )
