"""
app/services/ai/gemini_provider.py — Gemini implementation of AiProvider.

Reuses the same google-genai client bootstrap as the existing
app/services/ai_service.py (GEMINI_API_KEY env var, gemini-flash-lite-latest
model) — that part doesn't need reinventing. What this module adds on top:
JSON-mode structured output, multimodal image input, safety settings on,
a bounded-retry-with-backoff + per-call timeout + circuit breaker wrapper,
and per-call token/cost reporting into AiResponse.

Tier 1 billing (spec Part 4): this module does not and cannot verify that
the Google Cloud project has billing enabled / is on Tier 1 rather than the
free tier — that's a console/account setting, not something visible from
here. GEMINI_API_KEY being present only proves a key exists, not which tier
it's billed under. Confirm this in the Google Cloud console before sending
real student data through generate_json/generate_json_multimodal.

Pricing constants below are Gemini Flash-Lite's published per-token rates as
of this writing — treat as APPROXIMATE and re-verify against the current
Google AI pricing page before trusting ai_usage_log.cost_usd for real
unit-economics decisions (spec Part 4's "cost log is how the eventual
subscription gets priced").
"""
import asyncio
import json
import logging
import os
import time
from typing import Optional

from app.services.ai.base import AiProvider, AiResponse, AiProviderError
from app.services.ai import circuit_breaker

logger = logging.getLogger(__name__)

_GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
_MODEL = "gemini-flash-lite-latest"

_CALL_TIMEOUT_SECONDS = 20
# Multimodal (image) calls get a longer timeout than text — measured against
# the real flashcard-photo path (a genuine phone photo, not a screenshot):
# three consecutive same-image runs came back at 5.0s, timeout×3 (all three
# 20s retries exhausted, full failure), then 14.1s. Text-only calls in the
# same session were fast and stable (1.4-2.9s). 20s is not safely clear of
# observed image-call latency; 45s gives real headroom without making a
# genuinely stuck request hang the mobile client for a full minute-plus
# across all retries. Re-check this once the backend is actually deployed —
# these numbers are from a dev machine's network path to Google, not
# Railway's, and may not transfer directly.
_MULTIMODAL_CALL_TIMEOUT_SECONDS = 45
_MAX_RETRIES = 2
_BACKOFF_BASE_SECONDS = 1.5

# USD per token — APPROXIMATE, see module docstring.
_COST_PER_INPUT_TOKEN = 0.00000010
_COST_PER_OUTPUT_TOKEN = 0.00000040

try:
    from google import genai
    from google.genai import types
    _client = genai.Client(api_key=_GEMINI_KEY) if _GEMINI_KEY else None
except Exception:
    genai = None  # type: ignore
    types = None  # type: ignore
    _client = None


def _safety_settings():
    if types is None:
        return None
    categories = [
        types.HarmCategory.HARM_CATEGORY_HARASSMENT,
        types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    ]
    return [
        types.SafetySetting(category=cat, threshold=types.HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE)
        for cat in categories
    ]


def _estimate_cost(input_tokens: int, output_tokens: int) -> float:
    return round(input_tokens * _COST_PER_INPUT_TOKEN + output_tokens * _COST_PER_OUTPUT_TOKEN, 6)


async def _call_with_resilience(
    contents, config, prompt_version: str, timeout_seconds: int = _CALL_TIMEOUT_SECONDS,
) -> AiResponse:
    if _client is None:
        raise AiProviderError("GEMINI_API_KEY not configured", outcome="error")

    if circuit_breaker.is_open():
        raise AiProviderError("AI provider circuit is open (recent repeated failures)", outcome="error")

    last_error: Optional[Exception] = None
    for attempt in range(_MAX_RETRIES + 1):
        start = time.monotonic()
        try:
            response = await asyncio.wait_for(
                _client.aio.models.generate_content(model=_MODEL, contents=contents, config=config),
                timeout=timeout_seconds,
            )
            latency_ms = int((time.monotonic() - start) * 1000)

            usage = getattr(response, "usage_metadata", None)
            input_tokens = int(getattr(usage, "prompt_token_count", 0) or 0) if usage else 0
            output_tokens = int(getattr(usage, "candidates_token_count", 0) or 0) if usage else 0

            circuit_breaker.record_success()
            return AiResponse(
                text=getattr(response, "text", None),
                model=_MODEL,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_usd=_estimate_cost(input_tokens, output_tokens),
                latency_ms=latency_ms,
                outcome="success",
            )
        except asyncio.TimeoutError as e:
            last_error = e
            circuit_breaker.record_failure()
            logger.error("Gemini call timed out (prompt_version=%s attempt=%s)", prompt_version, attempt, exc_info=True)
        except Exception as e:
            last_error = e
            circuit_breaker.record_failure()
            logger.error("Gemini call failed (prompt_version=%s attempt=%s)", prompt_version, attempt, exc_info=True)

        if attempt < _MAX_RETRIES:
            await asyncio.sleep(_BACKOFF_BASE_SECONDS * (2 ** attempt))

    outcome = "timeout" if isinstance(last_error, asyncio.TimeoutError) else "error"
    raise AiProviderError(f"Gemini call failed after {_MAX_RETRIES + 1} attempts: {last_error}", outcome=outcome)


class GeminiProvider(AiProvider):
    async def generate_text(
        self, *, system_prompt: str, user_prompt: str, prompt_version: str,
        max_output_tokens: int = 1024, temperature: float = 0.7,
    ) -> AiResponse:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=max_output_tokens,
            temperature=temperature,
            safety_settings=_safety_settings(),
        ) if types else None
        return await _call_with_resilience(user_prompt, config, prompt_version)

    async def generate_json(
        self, *, system_prompt: str, user_prompt: str, prompt_version: str,
        json_schema: dict, max_output_tokens: int = 2048, temperature: float = 0.4,
    ) -> AiResponse:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=max_output_tokens,
            temperature=temperature,
            response_mime_type="application/json",
            response_schema=json_schema,
            safety_settings=_safety_settings(),
        ) if types else None
        result = await _call_with_resilience(user_prompt, config, prompt_version)
        result.data = _parse_json(result.text, prompt_version)
        return result

    async def generate_json_multimodal(
        self, *, system_prompt: str, user_prompt: str, prompt_version: str,
        image_bytes: bytes, image_mime_type: str, json_schema: dict,
        max_output_tokens: int = 2048, temperature: float = 0.4,
    ) -> AiResponse:
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            max_output_tokens=max_output_tokens,
            temperature=temperature,
            response_mime_type="application/json",
            response_schema=json_schema,
            safety_settings=_safety_settings(),
        ) if types else None
        contents = [
            types.Part.from_bytes(data=image_bytes, mime_type=image_mime_type),
            user_prompt,
        ] if types else [user_prompt]
        result = await _call_with_resilience(
            contents, config, prompt_version, timeout_seconds=_MULTIMODAL_CALL_TIMEOUT_SECONDS,
        )
        result.data = _parse_json(result.text, prompt_version)
        return result


def _parse_json(text: Optional[str], prompt_version: str) -> Optional[dict]:
    if not text:
        return None
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        logger.error("Gemini returned non-JSON output in JSON mode (prompt_version=%s)", prompt_version)
        raise AiProviderError("Model returned malformed JSON", outcome="error")


_provider = GeminiProvider()


def get_provider() -> AiProvider:
    """The one swap point (spec Part 4) — every AI feature calls this,
    never GeminiProvider or google.genai directly."""
    return _provider
