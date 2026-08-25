"""
app/services/ai/base.py — provider-agnostic interface (spec Part 4).

No endpoint may call Gemini (or any model) directly — every AI feature goes
through an AiProvider instance obtained from get_provider(). That's the one
swap point when the model changes for cost, Uzbek quality, or whatever ships
next quarter.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class AiResponse:
    text: Optional[str] = None          # set for generate_text
    data: Optional[dict] = None         # set for generate_json — already-parsed JSON
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    outcome: str = "success"            # 'success' | 'error' | 'timeout' | 'refused'
    error_detail: Optional[str] = None


class AiProviderError(Exception):
    """Raised when a provider call fails after retries, or the circuit is open."""
    def __init__(self, message: str, outcome: str = "error"):
        super().__init__(message)
        self.outcome = outcome


class AiProvider(ABC):
    """Every method must fill in AiResponse's cost/token/latency fields —
    that's the data the eventual subscription gets priced on (spec Part 4,
    "cost and usage tracking")."""

    @abstractmethod
    async def generate_text(
        self, *, system_prompt: str, user_prompt: str, prompt_version: str,
        max_output_tokens: int = 1024, temperature: float = 0.7,
    ) -> AiResponse:
        ...

    @abstractmethod
    async def generate_json(
        self, *, system_prompt: str, user_prompt: str, prompt_version: str,
        json_schema: dict, max_output_tokens: int = 2048, temperature: float = 0.4,
    ) -> AiResponse:
        ...

    @abstractmethod
    async def generate_json_multimodal(
        self, *, system_prompt: str, user_prompt: str, prompt_version: str,
        image_bytes: bytes, image_mime_type: str, json_schema: dict,
        max_output_tokens: int = 2048, temperature: float = 0.4,
    ) -> AiResponse:
        ...
