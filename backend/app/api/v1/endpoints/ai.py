import base64
import logging
import re
from datetime import datetime, timedelta, UTC
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.schemas import BookSummarizerRequest, BookSummarizerResponse
from app.services import ai_service
from app.services.auth_service import decode_token
from app.services.ai import limiter as ai_limiter
from app.services.ai.gemini_provider import get_provider
from app.services.ai.base import AiProviderError
from app.services.ai import cache as ai_cache
from app.services.ai.usage import log_usage
from app.services.ai.prompts import flashcard_gen_v1
from app.services.config_service import get_config

logger = logging.getLogger(__name__)

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


# ═══════════════════════════════════════════════════════════════════════════
# Spec Part 4-6 — AI feature layer proper (provider abstraction, dual-gate,
# flashcard generation, weekly review read). The chat/book-summarizer routes
# above are pre-existing and out of scope — "do not build a general chatbot"
# (spec Part 6) means don't extend that surface, not that it must be removed.
# ═══════════════════════════════════════════════════════════════════════════

_DEFAULT_GATE = {"free_daily_allowance": 3, "hard_daily_cap": 20, "prices": {}}


@router.get("/limits")
async def get_ai_limits(db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    """
    Spec Part 7: "Show cost before confirming any Tanga spend, and show
    remaining free allowance." The mobile client calls this before offering
    an AI action so it can render the price / remaining-free-actions /
    daily-cap-reached state up front, not just after a 402.
    """
    gate = get_config(db, "ai_dual_gate", default=_DEFAULT_GATE)
    gate = {**_DEFAULT_GATE, **(gate or {})}
    today = datetime.now(UTC).date()
    usage_row = db.execute(
        text("SELECT free_used, paid_used FROM ai_daily_usage WHERE user_id = :uid AND usage_date = :day"),
        {"uid": caller_id, "day": today},
    ).fetchone()
    free_used = int(usage_row.free_used) if usage_row else 0
    paid_used = int(usage_row.paid_used) if usage_row else 0
    return {
        "free_daily_allowance": gate["free_daily_allowance"],
        "free_remaining_today": max(0, gate["free_daily_allowance"] - free_used),
        "hard_daily_cap": gate["hard_daily_cap"],
        "actions_used_today": free_used + paid_used,
        "actions_remaining_today": max(0, gate["hard_daily_cap"] - free_used - paid_used),
        "prices": gate["prices"],
    }


class FlashcardGenerateRequest(BaseModel):
    action_id: str = Field(..., max_length=128)   # client-generated, for idempotency + retry-safety
    text: Optional[str] = Field(None, max_length=8000)
    image_base64: Optional[str] = None
    image_mime_type: Optional[str] = Field(None, max_length=64)
    # Output language override, e.g. "en"/"uz"/"ru". None or "auto" (default)
    # means "keep the source material's own language" — see
    # flashcard_gen_v1.SYSTEM_PROMPT. Also the cache-key dimension that lets
    # a regenerate-in-another-language request bypass a stale cached result.
    language: Optional[str] = Field(None, max_length=32)


_MAX_IMAGE_BYTES = 6 * 1024 * 1024  # 6MB decoded
_LANGUAGE_RE = re.compile(r"^[a-z]{2,8}(-[a-z]{2,8})?$")


def _normalize_language(raw: Optional[str]) -> str:
    if not raw:
        return "auto"
    candidate = raw.strip().lower()
    if candidate in ("", "auto"):
        return "auto"
    # Reject anything that isn't a plain language code — this string is
    # interpolated straight into the model's user prompt, so it must not be
    # able to smuggle extra instructions in.
    return candidate if _LANGUAGE_RE.match(candidate) else "auto"


@router.post("/flashcards/generate")
async def generate_flashcards(
    body: FlashcardGenerateRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """
    Spec Part 6, feature 1. Input: pasted text OR a photographed page.
    Output: a structured deck preview (NOT saved yet — the user reviews and
    edits before POST /flashcards/generate/confirm actually creates it).

    Flow: dual-gate check_and_charge() (deduct-first) -> cache lookup ->
    provider call on miss -> refund on failure (spec Part 5: "a user must
    never be charged for a failed call").
    """
    has_text = bool(body.text and body.text.strip())
    has_image = bool(body.image_base64)
    if has_text == has_image:  # neither or both — exactly one input mode
        raise HTTPException(400, "Matn yoki rasm yuboring (ikkalasi emas, bittasi).")

    image_bytes: Optional[bytes] = None
    if has_image:
        if not body.image_mime_type:
            raise HTTPException(400, "image_mime_type talab qilinadi.")
        try:
            image_bytes = base64.b64decode(body.image_base64, validate=True)
        except Exception:
            raise HTTPException(400, "image_base64 noto'g'ri formatda.")
        if len(image_bytes) > _MAX_IMAGE_BYTES:
            raise HTTPException(400, "Rasm hajmi juda katta (6MB dan oshmasin).")

    gate_result = ai_limiter.check_and_charge(db, caller_id, feature="flashcard_gen", action_id=body.action_id)
    if not gate_result.allowed:
        status_map = {
            "insufficient_balance": (402, "Tanga yetarli emas."),
            "daily_cap_reached":    (429, "Bugungi AI limitiga yetdingiz. Ertaga qayta urinib ko'ring."),
            "global_ceiling_reached": (503, "AI xizmati hozircha band. Birozdan so'ng urinib ko'ring."),
        }
        code, msg = status_map.get(gate_result.reason, (429, "So'rov rad etildi."))
        raise HTTPException(code, msg)

    resolved_language = _normalize_language(body.language)
    normalized_input = (body.text or "").strip() if has_text else f"image:{gate_result.idempotency_key}"
    cached = None if has_image else ai_cache.get_cached(db, "flashcard_gen", normalized_input, language=resolved_language)

    try:
        if cached is not None:
            data = cached
            model_used, prompt_version = "cache", flashcard_gen_v1.VERSION
            log_usage(db, caller_id, feature="flashcard_gen", model=model_used,
                      prompt_version=prompt_version, cache_hit=True, outcome="success")
        else:
            provider = get_provider()
            if has_image:
                response = await provider.generate_json_multimodal(
                    system_prompt=flashcard_gen_v1.SYSTEM_PROMPT,
                    user_prompt=flashcard_gen_v1.build_image_prompt(resolved_language),
                    prompt_version=flashcard_gen_v1.VERSION,
                    image_bytes=image_bytes, image_mime_type=body.image_mime_type,
                    json_schema=flashcard_gen_v1.JSON_SCHEMA,
                )
            else:
                response = await provider.generate_json(
                    system_prompt=flashcard_gen_v1.SYSTEM_PROMPT,
                    user_prompt=flashcard_gen_v1.build_user_prompt(normalized_input, resolved_language),
                    prompt_version=flashcard_gen_v1.VERSION,
                    json_schema=flashcard_gen_v1.JSON_SCHEMA,
                )
            log_usage(db, caller_id, feature="flashcard_gen", model=response.model,
                      prompt_version=flashcard_gen_v1.VERSION, input_tokens=response.input_tokens,
                      output_tokens=response.output_tokens, cost_usd=response.cost_usd,
                      latency_ms=response.latency_ms, outcome=response.outcome)
            data = response.data
            if not data or not data.get("cards"):
                raise AiProviderError("Model returned no cards", outcome="refused")
            if not has_image:
                ai_cache.store_cached(db, "flashcard_gen", normalized_input, data, language=resolved_language)
    except AiProviderError as e:
        ai_limiter.refund(db, caller_id, "flashcard_gen", body.action_id, gate_result.tanga_spent)
        logger.error("Flashcard generation failed for user_id=%s action_id=%s", caller_id, body.action_id, exc_info=True)
        raise HTTPException(502, "Flashcard yaratib bo'lmadi. Qayta urinib ko'ring — Tanga qaytarildi.")
    except Exception:
        ai_limiter.refund(db, caller_id, "flashcard_gen", body.action_id, gate_result.tanga_spent)
        logger.error("Unexpected flashcard generation error for user_id=%s", caller_id, exc_info=True)
        raise HTTPException(500, "Kutilmagan xatolik. Tanga qaytarildi.")

    return {
        "deck_title": data.get("deck_title") or "Yangi to'plam",
        "cards": data.get("cards", []),
        "tanga_spent": gate_result.tanga_spent,
        "free_remaining_today": gate_result.free_remaining,
        "action_id": body.action_id,
    }


class GeneratedCard(BaseModel):
    front: str = Field(..., max_length=500)
    back:  str = Field(..., max_length=1000)


class FlashcardGenerateConfirmRequest(BaseModel):
    deck_title: str = Field(..., max_length=120)
    description: Optional[str] = Field(None, max_length=500)
    color: Optional[str] = Field(None, max_length=20)
    icon:  Optional[str] = Field(None, max_length=20)
    cards: list[GeneratedCard] = Field(..., min_length=1, max_length=50)


@router.post("/flashcards/generate/confirm", status_code=201)
async def confirm_generated_flashcards(
    body: FlashcardGenerateConfirmRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """
    Saves the deck the user reviewed/edited after /flashcards/generate.
    Does NOT charge Tanga again — the AI call was already paid for at
    generation time; editing/discarding cards before saving is free.
    """
    now = datetime.now(UTC)
    deck_row = db.execute(
        text("""
            INSERT INTO flashcard_decks (user_id, title, description, color, icon, card_count, created_at, updated_at)
            VALUES (:uid, :title, :desc, :color, :icon, :count, :now, :now)
            RETURNING id
        """),
        {
            "uid": caller_id, "title": body.deck_title, "desc": body.description,
            "color": body.color or "#6366F1", "icon": body.icon or "🤖",
            "count": len(body.cards), "now": now,
        },
    ).fetchone()
    deck_id = int(deck_row.id)

    for i, card in enumerate(body.cards):
        db.execute(
            text("""
                INSERT INTO flashcards (deck_id, front_text, back_text, position, created_at)
                VALUES (:did, :front, :back, :pos, :now)
            """),
            {"did": deck_id, "front": card.front, "back": card.back, "pos": i, "now": now},
        )
    db.commit()

    return {"ok": True, "deck_id": deck_id, "card_count": len(body.cards)}


@router.get("/weekly-review")
async def get_latest_weekly_review(db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    """Spec Part 6, feature 2 — always free. Returns the caller's most
    recent cron-generated weekly review (possibly from a prior week, if
    this week's batch hasn't reached their telegram_id%7 slot yet).

    Also returns `live_stats`: the same deterministic, no-LLM stats this
    week's review will eventually be built from, computed on demand
    whenever the CURRENT week's review isn't ready yet. This lets the
    client show real numbers (a live in-progress bar chart, streak, etc.)
    instead of an empty state while waiting for the cron-staggered batch —
    no AI call, no Tanga, no rate-limit exposure, since it's the same plain
    aggregation query the batch job itself runs.
    """
    today = datetime.now(UTC).date()
    this_week_start = today - timedelta(days=today.weekday())

    row = db.execute(
        text("""
            SELECT week_start, content, created_at FROM weekly_reviews
            WHERE user_id = :uid ORDER BY week_start DESC LIMIT 1
        """),
        {"uid": caller_id},
    ).fetchone()

    review = None
    if row:
        review = {
            "week_start": row.week_start.isoformat(),
            "created_at": row.created_at.isoformat() if row.created_at else None,
            **(row.content or {}),
        }

    live_stats = None
    if not row or row.week_start < this_week_start:
        from app.services.weekly_review_service import gather_user_stats
        live_stats = gather_user_stats(db, caller_id, this_week_start, today)

    return {"review": review, "live_stats": live_stats}
