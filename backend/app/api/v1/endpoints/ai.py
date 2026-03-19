from fastapi import APIRouter, HTTPException

from app.schemas.schemas import BookSummarizerRequest, BookSummarizerResponse
from app.services.ai_service import extractive_summary, key_points, answer_in_uzbek, split_sentences

router = APIRouter()


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
