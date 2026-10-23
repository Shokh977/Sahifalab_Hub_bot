"""
question_submission_service.py — "Siz ham savol yuboring": user-written
5 Savol questions (105_question_submissions.sql).

Flow:
  submit()            — a user sends a complete question (text, 4 options,
                        which one is right). Validated and limited server-
                        side; every daily bucket is the DB's NOW(), never a
                        client date. Lands as 'pending_review'.
  review_submission() — background AI review. ADVISORY: the cold answer
                        check (does the model, not shown the user's answer,
                        pick the same option?), the content screen, mutual
                        exclusivity, distractor plausibility, the quality
                        rules + myth list, orthography, classification and a
                        confidence rating where 'unverifiable' is a real
                        answer. Only the content screen acts on its own
                        (auto-reject); a concept-tag/text match marks it
                        'duplicate'. Everything else waits for the admin.
  approve()/reject()  — the admin's decision.
  swap()/unswap()/rebalance() — the admin puts an approved question into a
                        FUTURE scheduled quiz (never a live or past one).
                        One transaction each, audited in daily_quiz_swap_log;
                        a displaced AI question goes to daily_quiz_question_pool,
                        never deleted.
  on_quiz_published() — called right after a quiz goes live: marks its user
                        questions 'published', pays the reward (own
                        transaction, idempotent on the submission id, Tanga
                        only — never XP) and pushes the submitter. The cron
                        sweep repeats it for anything a crash left behind.

Identity key: telegram_id (bigint), as everywhere — profiles.id is not used.
Statuses: pending_review | approved | scheduled | published | rejected | duplicate.
"""
import asyncio
import html
import json
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, UTC
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services import category_config
from app.services.ai.base import AiProviderError
from app.services.ai.gemini_provider import get_provider
from app.services.ai.prompts import question_cold_answer_v1, question_distractors_v1, question_review_v1
from app.services.ai.usage import log_usage
from app.services.config_service import get_config
from app.services.daily_quiz_service import DIFFICULTY_TARGET, QUESTIONS_PER_QUIZ, normalize_concept_tag
from app.services.tanga_service import grant_tanga
from app.services.uzbek_translit import find_translit_issues

logger = logging.getLogger(__name__)

CONFIG_KEY = "question_submissions"
DEFAULT_CONFIG: dict[str, Any] = {
    "enabled": True,
    "daily_limit": 3,
    "max_pending": 10,
    "assist_daily_limit": 5,
    # The form's "Noto'g'ri javoblarni AI tayyorlasin" button: built, but off
    # in the UI until an admin flips this (the endpoint itself always works).
    "assist_in_ui": False,
    "reward_tanga": 25,
    "max_user_per_quiz": 2,
    "dedup_days": 120,
    "min_seconds_between": 20,
}

PENDING, APPROVED, SCHEDULED, PUBLISHED, REJECTED, DUPLICATE = (
    "pending_review", "approved", "scheduled", "published", "rejected", "duplicate",
)
DIFFICULTIES = ("easy", "medium", "hard")
OTHER_CATEGORY = "boshqa"
OTHER_TAG_PREFIX = "user"
ANONYMOUS_NAME = "Sahifalab foydalanuvchisi"
DEFAULT_SOURCE = "Foydalanuvchi savoli"

QUESTION_MIN, QUESTION_MAX = 10, 200
OPTION_MIN, OPTION_MAX = 1, 80
EXPLANATION_MAX = 200
SOURCE_NOTE_MAX = 200
MAX_REVIEW_ATTEMPTS = 3
EXISTING_TAGS_IN_PROMPT = 400

# pg_advisory_xact_lock keys: per-user, one namespace per operation, far
# from any id range so they can't meet another lock.
_SUBMIT_LOCK_BASE = 105_000_000_000_000
_ASSIST_LOCK_BASE = 106_000_000_000_000


class SubmissionError(Exception):
    """A refusal the client should show. `code` is stable for the client;
    `message` is the Uzbek text; `status` the HTTP status."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def get_settings(db: Session) -> dict:
    cfg = get_config(db, CONFIG_KEY, default={}) or {}
    out = dict(DEFAULT_CONFIG)
    if isinstance(cfg, dict):
        out.update({k: v for k, v in cfg.items() if k in DEFAULT_CONFIG})
    return out


# ═══════════════════════════════════════════════════════════════════════════
# Pure helpers — text cleaning and validation (unit-tested, no DB)
# ═══════════════════════════════════════════════════════════════════════════

_TAG_RE = re.compile(r"<[^>]*>")
# C0/C1 controls (minus tab/newline, which collapse to spaces below), zero-
# width and bidi-override characters (invisible text tricks).
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f​-‏‪-‮⁠-⁤⁦-⁩﻿]")
_SPACE_RE = re.compile(r"\s+")
_APOSTROPHES_RE = re.compile(r"[`ʻʼ‘’′´]")


def clean_text(value: object) -> str:
    """Entities decoded first (so "&lt;b&gt;" can't survive as a tag), then
    tags stripped, control/invisible characters removed, whitespace collapsed
    to single spaces and trimmed."""
    if not isinstance(value, str):
        return ""
    s = html.unescape(value)
    s = _TAG_RE.sub(" ", s)
    s = _CONTROL_RE.sub("", s)
    s = _SPACE_RE.sub(" ", s)
    return s.strip()


def normalize_for_compare(value: str) -> str:
    """For "are these the same option / the same question": case-folded, every
    apostrophe variant unified (oʻ / o' / o` / o’), trailing punctuation and
    spacing ignored."""
    s = _APOSTROPHES_RE.sub("'", clean_text(value)).casefold()
    s = re.sub(r"[\s.,!?;:\"«»()\-]+", " ", s)
    return s.strip()


def validate_submission(raw: dict) -> tuple[dict, list[str]]:
    """(cleaned fields, Uzbek error messages). Empty error list = valid.
    Everything is cleaned BEFORE the length checks, so padding with spaces
    or invisible characters can't meet a minimum."""
    errors: list[str] = []
    question = clean_text(raw.get("question_text"))
    options_raw = raw.get("options")
    options = [clean_text(o) for o in options_raw] if isinstance(options_raw, list) else []
    correct = raw.get("correct_index")
    explanation = clean_text(raw.get("explanation")) or None
    source_note = clean_text(raw.get("source_note")) or None

    if not QUESTION_MIN <= len(question) <= QUESTION_MAX:
        errors.append(f"Savol {QUESTION_MIN}–{QUESTION_MAX} belgidan iborat boʻlishi kerak.")
    if len(options) != 4:
        errors.append("Aynan 4 ta javob varianti boʻlishi kerak.")
    else:
        if any(not OPTION_MIN <= len(o) <= OPTION_MAX for o in options):
            errors.append(f"Har bir variant 1–{OPTION_MAX} belgidan iborat boʻlishi kerak.")
        if len({normalize_for_compare(o) for o in options}) != 4:
            errors.append("Variantlar bir-biridan farq qilishi kerak.")
    if not isinstance(correct, int) or isinstance(correct, bool) or not 0 <= correct <= 3:
        errors.append("Toʻgʻri javob belgilanmagan.")
    if explanation and len(explanation) > EXPLANATION_MAX:
        errors.append(f"Izoh {EXPLANATION_MAX} belgidan oshmasin.")
    if source_note and len(source_note) > SOURCE_NOTE_MAX:
        errors.append(f"Manba {SOURCE_NOTE_MAX} belgidan oshmasin.")

    cleaned = {
        "question_text": question,
        "options": options,
        "correct_index": correct if isinstance(correct, int) and not isinstance(correct, bool) else None,
        "explanation": explanation,
        "source_note": source_note,
        "is_anonymous": bool(raw.get("is_anonymous")),
        "used_ai_assist": bool(raw.get("used_ai_assist")),
    }
    return cleaned, errors


def queue_rank(row: dict) -> int:
    """Admin queue order: a cold-answer disagreement first, then anything
    the AI couldn't vouch for (unverifiable / low / review not done), then
    the rest. Ties: oldest first (by the caller's secondary sort)."""
    verdict = row.get("ai_verdict") or {}
    if (verdict.get("cold_answer") or {}).get("outcome") == "disagree" or verdict.get("marked_answer") == "incorrect":
        return 0
    if row.get("ai_confidence") in (None, "unverifiable", "low") or verdict.get("review_error"):
        return 1
    return 2


def difficulty_counts(difficulties: list[str]) -> dict[str, int]:
    counts = {d: 0 for d in DIFFICULTIES}
    for d in difficulties:
        if d in counts:
            counts[d] += 1
    return counts


def mix_warning(difficulties: list[str]) -> Optional[str]:
    """The 2 easy / 2 medium / 1 hard balance is advice, not a rule: None if
    it holds, else a one-line warning for the admin (who may proceed)."""
    counts = difficulty_counts(difficulties)
    if len(difficulties) < QUESTIONS_PER_QUIZ or counts == DIFFICULTY_TARGET:
        return None
    parts = [f"{k} {counts[k]}/{v}" for k, v in DIFFICULTY_TARGET.items() if counts[k] != v]
    return "Qiyinlik muvozanati buzildi: " + ", ".join(parts)


def attribution_for(name: Optional[str], is_anonymous: bool) -> str:
    if is_anonymous or not (name or "").strip():
        return ANONYMOUS_NAME
    return name.strip()


def status_label(status: str, published_quiz_number: Optional[int] = None, scheduled_date: Optional[date] = None) -> str:
    """The submitter's own view (Part 6). A rejection reason is never shown."""
    if status == PENDING:
        return "Koʻrib chiqilmoqda"
    if status == APPROVED:
        return "Qabul qilindi — tez orada chiqadi"
    if status == SCHEDULED:
        return f"{scheduled_date.strftime('%d.%m')} kuni chiqadi" if scheduled_date else "Tez orada chiqadi"
    if status == PUBLISHED:
        return f"Nashr etildi · 5 SAVOL #{published_quiz_number}" if published_quiz_number else "Nashr etildi"
    if status == DUPLICATE:
        return "Bu savol allaqachon bazamizda bor"
    return "Bu safar qoʻshilmadi"


# ═══════════════════════════════════════════════════════════════════════════
# Submitting
# ═══════════════════════════════════════════════════════════════════════════

def _usage_row(db: Session, user_id: int):
    return db.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last24,
                COUNT(*) FILTER (WHERE status = 'pending_review')               AS pending,
                MAX(created_at)                                                   AS last_at,
                MIN(created_at) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS oldest24,
                NOW()                                                             AS now
            FROM question_submissions WHERE telegram_id = :uid
        """),
        {"uid": user_id},
    ).fetchone()


def _assist_used(db: Session, user_id: int) -> int:
    return int(db.execute(
        text("""
            SELECT COUNT(*) FROM question_assist_requests
            WHERE telegram_id = :uid AND outcome <> 'error' AND created_at > NOW() - INTERVAL '24 hours'
        """),
        {"uid": user_id},
    ).scalar() or 0)


def limits(db: Session, user_id: int) -> dict:
    """What the form shows: "Bugun yana 2 ta yubora olasiz"."""
    cfg = get_settings(db)
    row = _usage_row(db, user_id)
    used = int(row.last24 or 0)
    next_slot = None
    if used >= int(cfg["daily_limit"]) and row.oldest24 is not None:
        next_slot = (row.oldest24 + timedelta(hours=24)).isoformat()
    return {
        "enabled": bool(cfg["enabled"]),
        "daily_limit": int(cfg["daily_limit"]),
        "used_today": used,
        "remaining_today": max(0, int(cfg["daily_limit"]) - used),
        "pending": int(row.pending or 0),
        "max_pending": int(cfg["max_pending"]),
        "next_slot_at": next_slot,
        "assist_enabled": bool(cfg["assist_in_ui"]),
        "assist_remaining": max(0, int(cfg["assist_daily_limit"]) - _assist_used(db, user_id)),
        "reward_tanga": int(cfg["reward_tanga"]),
    }


def submit(db: Session, user_id: int, raw: dict) -> dict:
    """Validates, enforces the limits under a per-user transaction lock (two
    simultaneous submits can't both slip under the cap), inserts, commits.
    Raises SubmissionError on any refusal — never returns success without a
    committed row."""
    cfg = get_settings(db)
    if not cfg["enabled"]:
        raise SubmissionError("disabled", "Savol yuborish hozircha oʻchirilgan.", 403)
    cleaned, errors = validate_submission(raw)
    if errors:
        raise SubmissionError("invalid", errors[0], 422)

    try:
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _SUBMIT_LOCK_BASE + user_id})
        profile = db.execute(
            text("SELECT first_name, username FROM profiles WHERE telegram_id = :uid"), {"uid": user_id},
        ).fetchone()
        if profile is None:
            raise SubmissionError("no_profile", "Profil topilmadi.", 404)

        row = _usage_row(db, user_id)
        if int(row.last24 or 0) >= int(cfg["daily_limit"]):
            raise SubmissionError(
                "daily_limit", f"Bir kunda {cfg['daily_limit']} tadan ortiq savol yuborib boʻlmaydi. Ertaga yana yuboring.", 429,
            )
        if int(row.pending or 0) >= int(cfg["max_pending"]):
            raise SubmissionError(
                "pending_limit", "Koʻrib chiqilayotgan savollaringiz koʻp. Ular tekshirilgach yana yuboring.", 429,
            )
        if row.last_at is not None and (row.now - row.last_at).total_seconds() < int(cfg["min_seconds_between"]):
            raise SubmissionError("too_fast", "Biroz kuting va qayta yuboring.", 429)

        name = (profile.first_name or profile.username or "").strip() or None
        inserted = db.execute(
            text("""
                INSERT INTO question_submissions
                    (telegram_id, question_text, options, correct_index, explanation, source_note,
                     attribution_name, is_anonymous, used_ai_assist, status)
                VALUES
                    (:uid, :q, CAST(:opts AS jsonb), :ci, :expl, :src, :name, :anon, :assist, 'pending_review')
                RETURNING id, created_at
            """),
            {
                "uid": user_id, "q": cleaned["question_text"], "opts": json.dumps(cleaned["options"]),
                "ci": cleaned["correct_index"], "expl": cleaned["explanation"], "src": cleaned["source_note"],
                "name": name, "anon": cleaned["is_anonymous"], "assist": cleaned["used_ai_assist"],
            },
        ).fetchone()
        db.commit()
    except Exception:
        db.rollback()
        raise

    remaining = max(0, int(cfg["daily_limit"]) - (int(row.last24 or 0) + 1))
    return {
        "id": int(inserted.id),
        "status": PENDING,
        "status_label": status_label(PENDING),
        "created_at": inserted.created_at.isoformat(),
        "remaining_today": remaining,
    }


def my_submissions(db: Session, user_id: int, limit: int = 50) -> list[dict]:
    rows = db.execute(
        text("""
            SELECT s.id, s.question_text, s.options, s.correct_index, s.status, s.is_anonymous,
                   s.created_at, s.published_at, s.reward_granted,
                   z.quiz_number, z.publish_date
            FROM question_submissions s
            LEFT JOIN daily_quizzes z ON z.id = s.scheduled_quiz_id
            WHERE s.telegram_id = :uid
            ORDER BY s.created_at DESC
            LIMIT :n
        """),
        {"uid": user_id, "n": limit},
    ).fetchall()
    cfg = get_settings(db)
    out = []
    for r in rows:
        published = r.status == PUBLISHED
        out.append({
            "id": int(r.id),
            "question_text": r.question_text,
            "options": list(r.options),
            "correct_index": r.correct_index,
            "status": r.status,
            "status_label": status_label(r.status, r.quiz_number, r.publish_date),
            "is_anonymous": r.is_anonymous,
            "created_at": r.created_at.isoformat(),
            # The day it appears / appeared — only once it's actually slotted in.
            "quiz_number": r.quiz_number if r.status in (SCHEDULED, PUBLISHED) else None,
            "quiz_date": r.publish_date.isoformat() if r.publish_date and r.status in (SCHEDULED, PUBLISHED) else None,
            "published_at": r.published_at.isoformat() if r.published_at else None,
            "reward_tanga": int(cfg["reward_tanga"]) if published and r.reward_granted else None,
        })
    return out


# ═══════════════════════════════════════════════════════════════════════════
# AI assist — "Noto'g'ri javoblarni AI tayyorlasin"
# ═══════════════════════════════════════════════════════════════════════════

def clean_distractors(raw: object, correct_answer: str) -> list[str]:
    """Pure: the model's suggestions made usable — cleaned, 80-char capped,
    never the correct answer (in any spelling), no repeats. May return fewer
    than 3; the caller decides what that means."""
    seen = {normalize_for_compare(correct_answer)}
    out = []
    for item in raw if isinstance(raw, list) else []:
        s = clean_text(item)[:OPTION_MAX].strip()
        key = normalize_for_compare(s)
        if not s or key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out[:3]


async def assist_distractors(db: Session, user_id: int, question_text: str, correct_answer: str) -> list[str]:
    """Three editable wrong options. The slot is reserved BEFORE the AI call
    (so parallel requests can't overrun the cap) and released (outcome
    'error') if the call fails, so a failure never costs the user a use."""
    cfg = get_settings(db)
    if not cfg["enabled"]:
        raise SubmissionError("disabled", "Savol yuborish hozircha oʻchirilgan.", 403)
    question = clean_text(question_text)
    correct = clean_text(correct_answer)
    if not QUESTION_MIN <= len(question) <= QUESTION_MAX or not OPTION_MIN <= len(correct) <= OPTION_MAX:
        raise SubmissionError("invalid", "Avval savol va toʻgʻri javobni yozing.", 422)

    try:
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": _ASSIST_LOCK_BASE + user_id})
        if _assist_used(db, user_id) >= int(cfg["assist_daily_limit"]):
            raise SubmissionError("assist_limit", "Bugungi AI yordami tugadi — variantlarni oʻzingiz yozing.", 429)
        req = db.execute(
            text("INSERT INTO question_assist_requests (telegram_id) VALUES (:uid) RETURNING id"), {"uid": user_id},
        ).fetchone()
        db.commit()
    except Exception:
        db.rollback()
        raise

    def finish(outcome: str) -> None:
        db.execute(text("UPDATE question_assist_requests SET outcome = :o WHERE id = :id"), {"o": outcome, "id": req.id})
        db.commit()

    provider = get_provider()
    try:
        response = await provider.generate_json(
            system_prompt=question_distractors_v1.SYSTEM_PROMPT,
            user_prompt=question_distractors_v1.build_user_prompt(question, correct),
            prompt_version=question_distractors_v1.VERSION,
            json_schema=question_distractors_v1.JSON_SCHEMA,
            temperature=0.7,
        )
    except AiProviderError as e:
        log_usage(db, user_id=user_id, feature="question_assist", model="gemini-flash-lite-latest",
                  prompt_version=question_distractors_v1.VERSION, outcome=e.outcome, error_detail=str(e))
        finish("error")
        raise SubmissionError("assist_failed", "AI hozir javob bermadi — variantlarni oʻzingiz yozing.", 503) from e

    log_usage(db, user_id=user_id, feature="question_assist", model=response.model,
              prompt_version=question_distractors_v1.VERSION, input_tokens=response.input_tokens,
              output_tokens=response.output_tokens, cost_usd=response.cost_usd,
              latency_ms=response.latency_ms, outcome=response.outcome)
    distractors = clean_distractors((response.data or {}).get("distractors"), correct)
    if len(distractors) < 3:
        finish("error")
        raise SubmissionError("assist_failed", "AI hozir javob bermadi — variantlarni oʻzingiz yozing.", 503)
    finish("success")
    return distractors


# ═══════════════════════════════════════════════════════════════════════════
# AI review (advisory) + dedup
# ═══════════════════════════════════════════════════════════════════════════

def _recent_tags(db: Session, days: int) -> list[str]:
    rows = db.execute(
        text("""
            SELECT q.concept_tag, MAX(z.publish_date) AS d
            FROM daily_quiz_questions q JOIN daily_quizzes z ON z.id = q.quiz_id
            WHERE q.concept_tag IS NOT NULL AND z.publish_date >= :since
            GROUP BY q.concept_tag
            ORDER BY d DESC
            LIMIT :n
        """),
        {"since": datetime.now(UTC).date() - timedelta(days=days), "n": EXISTING_TAGS_IN_PROMPT},
    ).fetchall()
    return [r.concept_tag for r in rows]


def find_duplicate(
    db: Session, concept_tag: Optional[str], question_text: str, exclude_id: Optional[int], days: int,
) -> Optional[dict]:
    """A question in any quiz dated within `days` before today or later
    (scheduled ones too), or another live submission, with the same concept
    tag or the same question text."""
    norm = normalize_for_compare(question_text)
    since = datetime.now(UTC).date() - timedelta(days=days)
    quiz_rows = db.execute(
        text("""
            SELECT q.id, q.question_text, q.concept_tag, z.quiz_number, z.publish_date
            FROM daily_quiz_questions q JOIN daily_quizzes z ON z.id = q.quiz_id
            WHERE z.publish_date >= :since AND z.status <> 'voided'
              AND (q.concept_tag = :tag OR lower(q.question_text) = lower(:qt))
              AND (q.submission_id IS NULL OR q.submission_id <> :ex)
        """),
        {"since": since, "tag": concept_tag or "", "qt": question_text, "ex": exclude_id or -1},
    ).fetchall()
    for r in quiz_rows:
        if (concept_tag and r.concept_tag == concept_tag) or normalize_for_compare(r.question_text) == norm:
            return {"kind": "quiz", "question_id": int(r.id), "quiz_number": r.quiz_number,
                    "publish_date": r.publish_date.isoformat(), "question_text": r.question_text}

    sub_rows = db.execute(
        text("""
            SELECT id, question_text, concept_tag FROM question_submissions
            WHERE id <> :ex AND status IN ('pending_review', 'approved', 'scheduled')
              AND (concept_tag = :tag OR lower(question_text) = lower(:qt))
        """),
        {"ex": exclude_id or -1, "tag": concept_tag or "", "qt": question_text},
    ).fetchall()
    for r in sub_rows:
        if (concept_tag and r.concept_tag == concept_tag) or normalize_for_compare(r.question_text) == norm:
            return {"kind": "submission", "submission_id": int(r.id), "question_text": r.question_text}
    return None


def _apostrophe_issues(sub: dict) -> list[str]:
    """Deterministic: o/g followed by a non-standard apostrophe mixed with the
    standard one in the same text — "garbled o'/g'"."""
    blob = " ".join([sub["question_text"], *sub["options"], sub.get("explanation") or ""])
    variants = set(re.findall(r"[oOgG]([`ʻʼ‘’'])", blob))
    if len(variants) > 1:
        return ["oʻ/gʻ belgisi aralash yozilgan: " + " ".join(f"o{v}" for v in sorted(variants))]
    return []


_OPEN_RANGE_RE = re.compile(r"(dan\s+(ko'p|koʻp|ortiq|kam|oshiq)|kamida|ko'pi\s+bilan|koʻpi\s+bilan|gacha|\bortiq\b|\bkam\b|\+)", re.IGNORECASE)
_NUMBER_RE = re.compile(r"\d")


def open_range_overlap(options: list[str]) -> Optional[str]:
    """Deterministic: an open-ended numeric option ("12 soatdan ko'p",
    "kamida 10", "8 soatgacha") next to another numeric option almost always
    overlaps it. The model missed exactly this in the first sample run, and
    a nested-option bug already shipped once."""
    numeric = [i for i, o in enumerate(options) if _NUMBER_RE.search(o)]
    open_ended = [i for i in numeric if _OPEN_RANGE_RE.search(_APOSTROPHES_RE.sub("'", options[i]))]
    if open_ended and len(numeric) >= 2:
        names = ", ".join(f"«{options[i]}»" for i in open_ended)
        return f"Ochiq oraliqli variant(lar) {names} boshqa raqamli variantlarni qamrab olishi mumkin"
    return None


async def _ai_review(db: Session, sub: dict, categories: list[dict], existing_tags: list[str]) -> Optional[dict]:
    provider = get_provider()
    try:
        response = await provider.generate_json(
            system_prompt=question_review_v1.SYSTEM_PROMPT,
            user_prompt=question_review_v1.build_user_prompt(sub, categories, existing_tags),
            prompt_version=question_review_v1.VERSION,
            json_schema=question_review_v1.JSON_SCHEMA,
            temperature=0.0,
            max_output_tokens=2048,
        )
    except AiProviderError as e:
        log_usage(db, user_id=None, feature="question_review", model="gemini-flash-lite-latest",
                  prompt_version=question_review_v1.VERSION, outcome=e.outcome, error_detail=str(e))
        logger.error("question_review call failed for submission %s", sub["id"], exc_info=True)
        return None
    log_usage(db, user_id=None, feature="question_review", model=response.model,
              prompt_version=question_review_v1.VERSION, input_tokens=response.input_tokens,
              output_tokens=response.output_tokens, cost_usd=response.cost_usd,
              latency_ms=response.latency_ms, outcome=response.outcome)
    if not response.data:
        return None
    return question_review_v1.coerce(response.data)


async def _cold_answer(db: Session, sub: dict) -> dict:
    provider = get_provider()
    try:
        response = await provider.generate_json(
            system_prompt=question_cold_answer_v1.SYSTEM_PROMPT,
            user_prompt=question_cold_answer_v1.build_user_prompt(sub["question_text"], sub["options"]),
            prompt_version=question_cold_answer_v1.VERSION,
            json_schema=question_cold_answer_v1.JSON_SCHEMA,
            temperature=0.0,
        )
    except AiProviderError as e:
        log_usage(db, user_id=None, feature="question_cold_check", model="gemini-flash-lite-latest",
                  prompt_version=question_cold_answer_v1.VERSION, outcome=e.outcome, error_detail=str(e))
        logger.error("question cold check failed for submission %s", sub["id"], exc_info=True)
        return {"outcome": "error"}
    log_usage(db, user_id=None, feature="question_cold_check", model=response.model,
              prompt_version=question_cold_answer_v1.VERSION, input_tokens=response.input_tokens,
              output_tokens=response.output_tokens, cost_usd=response.cost_usd,
              latency_ms=response.latency_ms, outcome=response.outcome)
    data = response.data or {}
    idx, certainty = data.get("answer_index"), data.get("certainty")
    return {
        "outcome": question_cold_answer_v1.outcome(idx, certainty, sub["correct_index"]),
        "model_index": idx if isinstance(idx, int) else None,
        "certainty": certainty if certainty in question_cold_answer_v1.CERTAINTY else None,
    }


def build_verdict(sub: dict, review: Optional[dict], cold: dict, translit: list[str], apostrophes: list[str]) -> dict:
    """Pure: the stored ai_verdict, plus `flags` — short codes the admin queue
    renders as chips, loudest first."""
    flags: list[str] = []
    if cold.get("outcome") == "disagree":
        flags.append("cold_disagree")
    if review is None:
        flags.append("review_error")
        return {
            "review_error": True,
            "cold_answer": cold,
            "orthography": translit + apostrophes,
            "flags": flags + (["orthography"] if translit or apostrophes else []),
            "prompt_versions": [question_review_v1.VERSION, question_cold_answer_v1.VERSION],
        }
    if review["content_issue"] != "none":
        flags.append(f"content_{review['content_issue']}")
    overlap_rule = open_range_overlap(list(sub.get("options") or []))
    exclusive = review["mutually_exclusive"] and overlap_rule is None
    if not exclusive:
        flags.append("options_overlap")
    if review["also_correct_option_indexes"]:
        flags.append("also_correct")
    if review["absurd_option_indexes"]:
        flags.append("absurd_options")
    if review["is_term_question"]:
        flags.append("term_question")
    # Deterministic backstop: a correct answer with a digit in it is a date,
    # year, count or statistic — the model flagged the same question one run
    # and not the next.
    options = list(sub.get("options") or [])
    ci = sub.get("correct_index")
    numeric_answer = isinstance(ci, int) and 0 <= ci < len(options) and bool(_NUMBER_RE.search(options[ci]))
    if review["answer_is_date_or_statistic"] or numeric_answer:
        flags.append("date_or_statistic")
    if review["myth_asserted"]:
        flags.append("myth")
    if review["marked_answer_verdict"] == "incorrect" and "cold_disagree" not in flags:
        flags.insert(0, "marked_wrong")
    orthography = review["orthography_issues"] + translit + apostrophes
    if orthography:
        flags.append("orthography")
    return {
        "content": {"issue": review["content_issue"], "reason": review["content_reason"]},
        "cold_answer": cold,
        "exclusivity": {
            "ok": exclusive,
            "note": "; ".join(n for n in (review["exclusivity_note"], overlap_rule) if n),
        },
        "marked_answer": review["marked_answer_verdict"],
        "distractors": {"absurd": review["absurd_option_indexes"], "also_correct": review["also_correct_option_indexes"]},
        "quality": {
            "term_question": review["is_term_question"],
            "date_or_statistic": review["answer_is_date_or_statistic"] or numeric_answer,
            "myth": review["myth_asserted"],
            "note": review["quality_note"],
        },
        "orthography": orthography,
        "suggested_explanation": review["suggested_explanation"],
        "confidence_reason": review["confidence_reason"],
        "flags": flags,
        "prompt_versions": [question_review_v1.VERSION, question_cold_answer_v1.VERSION],
    }


def _claim_for_review(db: Session, submission_id: int, sweep: bool):
    """Atomically marks one attempt as started, so the background task and
    the cron sweep can't both review the same row at once."""
    row = db.execute(
        text(f"""
            UPDATE question_submissions
            SET ai_review_attempts = ai_review_attempts + 1, updated_at = NOW()
            WHERE id = :id AND status = 'pending_review' AND ai_reviewed_at IS NULL
              AND ai_review_attempts < :max
              {"AND updated_at < NOW() - INTERVAL '5 minutes'" if sweep else "AND ai_review_attempts = 0"}
            RETURNING id, question_text, options, correct_index, explanation, source_note, ai_review_attempts
        """),
        {"id": submission_id, "max": MAX_REVIEW_ATTEMPTS},
    ).fetchone()
    db.commit()
    return row


async def review_submission(db: Session, submission_id: int, sweep: bool = False) -> Optional[dict]:
    """Runs the advisory review for one pending submission. Returns the new
    state, or None when there was nothing to do (already reviewed / claimed
    by another worker). A failed review call leaves ai_reviewed_at NULL so
    the sweep retries — up to MAX_REVIEW_ATTEMPTS, after which the row is
    stored with review_error so it still shows up (at the top) for the admin."""
    row = _claim_for_review(db, submission_id, sweep)
    if row is None:
        return None
    sub = {
        "id": int(row.id), "question_text": row.question_text, "options": list(row.options),
        "correct_index": int(row.correct_index), "explanation": row.explanation, "source_note": row.source_note,
    }
    cfg = get_settings(db)
    categories = category_config.get_categories(db)
    existing_tags = _recent_tags(db, int(cfg["dedup_days"]))

    review, cold = await asyncio.gather(_ai_review(db, sub, categories, existing_tags), _cold_answer(db, sub))
    translit = [f"{i['wrong']} -> {i['correct']}" for i in find_translit_issues(sub)]
    verdict = build_verdict(sub, review, cold, translit, _apostrophe_issues(sub))

    # Either call failing means the admin would see a half review — in
    # particular without the cold check, the one that catches a wrong answer.
    if (review is None or cold.get("outcome") == "error") and row.ai_review_attempts < MAX_REVIEW_ATTEMPTS:
        logger.warning("question review for submission %s incomplete (attempt %s) — the sweep will retry", sub["id"], row.ai_review_attempts)
        return {"status": PENDING, "retry": True}

    status, rejection_reason = PENDING, None
    category = difficulty = concept_tag = None
    confidence = "unverifiable"
    if review is not None:
        by_key = {c["key"]: c for c in categories}
        category = review["category"] if review["category"] in by_key else OTHER_CATEGORY
        prefix = by_key[category]["tag_prefix"] if category in by_key else OTHER_TAG_PREFIX
        difficulty = review["difficulty"]
        confidence = review["confidence"]
        # The two calls contradicting each other — the hot review vouches for
        # the marked answer while the cold check confidently picks another
        # option — means the model can't actually verify it (seen on obscure
        # local facts in the sample run). Say so instead of showing "high".
        if cold.get("outcome") == "disagree" and confidence in ("high", "medium"):
            confidence = "unverifiable"
            verdict["confidence_reason"] = (
                "AI tekshiruvlari bir-biriga zid: biri belgilangan javobni tasdiqladi, ikkinchisi boshqa variantni tanladi. "
                + verdict.get("confidence_reason", "")
            ).strip()
        matched = review["matching_existing_tag"]
        concept_tag = matched if matched in existing_tags else normalize_concept_tag(review["concept_tag"], prefix)
        if review["content_issue"] != "none":
            status = REJECTED
            rejection_reason = f"auto: {review['content_issue']} — {review['content_reason']}"[:500]

    if status == PENDING:
        dup = find_duplicate(db, concept_tag, sub["question_text"], sub["id"], int(cfg["dedup_days"]))
        if dup:
            status = DUPLICATE
            verdict["duplicate_of"] = dup
            verdict["flags"].append("duplicate")

    db.execute(
        text("""
            UPDATE question_submissions
            SET ai_verdict = CAST(:verdict AS jsonb), ai_confidence = :conf, category = :cat,
                difficulty = :diff, concept_tag = :tag, status = :status, rejection_reason = :reason,
                ai_reviewed_at = NOW(), updated_at = NOW()
            WHERE id = :id AND status = 'pending_review'
        """),
        {
            "verdict": json.dumps(verdict, ensure_ascii=False), "conf": confidence, "cat": category,
            "diff": difficulty, "tag": concept_tag, "status": status, "reason": rejection_reason, "id": sub["id"],
        },
    )
    db.commit()
    return {"status": status, "confidence": confidence, "flags": verdict["flags"]}


async def review_in_background(submission_id: int) -> None:
    """FastAPI BackgroundTasks entry point: its own session (the request's is
    closed by then). Any failure is logged; the sweep picks the row up."""
    from app.db.session import SessionLocal
    db = SessionLocal()
    try:
        await review_submission(db, submission_id)
    except Exception:
        db.rollback()
        logger.error("background review failed for submission %s", submission_id, exc_info=True)
    finally:
        db.close()


# ═══════════════════════════════════════════════════════════════════════════
# Admin — queue, approve, reject
# ═══════════════════════════════════════════════════════════════════════════

_ADMIN_COLUMNS = """
    s.id, s.telegram_id, s.question_text, s.options, s.correct_index, s.explanation, s.source_note,
    s.attribution_name, s.is_anonymous, s.used_ai_assist, s.status, s.rejection_reason, s.ai_verdict,
    s.ai_confidence, s.ai_reviewed_at, s.category, s.difficulty, s.concept_tag, s.quiz_question_id,
    s.scheduled_quiz_id, s.scheduled_position, s.published_at, s.reward_granted, s.created_at,
    p.first_name, p.username, COALESCE(p.questions_published_count, 0) AS published_count,
    z.quiz_number, z.publish_date
"""


def _admin_dict(r) -> dict:
    return {
        "id": int(r.id), "telegram_id": int(r.telegram_id),
        "question_text": r.question_text, "options": list(r.options), "correct_index": r.correct_index,
        "explanation": r.explanation, "source_note": r.source_note,
        "submitter_name": r.attribution_name or r.first_name or r.username,
        "is_anonymous": r.is_anonymous, "used_ai_assist": r.used_ai_assist,
        "submitter_published_count": int(r.published_count or 0),
        "status": r.status, "rejection_reason": r.rejection_reason,
        "ai_verdict": r.ai_verdict, "ai_confidence": r.ai_confidence,
        "ai_reviewed": r.ai_reviewed_at is not None,
        "category": r.category, "difficulty": r.difficulty, "concept_tag": r.concept_tag,
        "scheduled_quiz_id": r.scheduled_quiz_id, "scheduled_position": r.scheduled_position,
        "quiz_number": r.quiz_number, "quiz_date": r.publish_date.isoformat() if r.publish_date else None,
        "published_at": r.published_at.isoformat() if r.published_at else None,
        "created_at": r.created_at.isoformat(),
    }


def admin_list(db: Session, status: str = PENDING, limit: int = 100) -> list[dict]:
    rows = db.execute(
        text(f"""
            SELECT {_ADMIN_COLUMNS}
            FROM question_submissions s
            JOIN profiles p ON p.telegram_id = s.telegram_id
            LEFT JOIN daily_quizzes z ON z.id = s.scheduled_quiz_id
            WHERE s.status = :status
            ORDER BY s.created_at ASC
            LIMIT :n
        """),
        {"status": status, "n": limit},
    ).fetchall()
    items = [_admin_dict(r) for r in rows]
    if status == PENDING:
        items.sort(key=lambda d: (queue_rank(d), d["created_at"]))
    return items


def admin_get(db: Session, submission_id: int) -> Optional[dict]:
    r = db.execute(
        text(f"""
            SELECT {_ADMIN_COLUMNS}
            FROM question_submissions s
            JOIN profiles p ON p.telegram_id = s.telegram_id
            LEFT JOIN daily_quizzes z ON z.id = s.scheduled_quiz_id
            WHERE s.id = :id
        """),
        {"id": submission_id},
    ).fetchone()
    return _admin_dict(r) if r else None


def approve(db: Session, submission_id: int, admin_id: Optional[int], edits: Optional[dict] = None) -> dict:
    """pending_review (or a 'duplicate' the admin overrides) -> approved.
    `edits` may change the text, options, answer, explanation, category,
    difficulty, concept_tag; the result is re-validated like a submission.
    The explanation falls back to the AI's suggestion when nobody wrote one —
    the admin UI shows it pre-filled, so nothing is used unseen."""
    edits = edits or {}
    row = db.execute(
        text("SELECT * FROM question_submissions WHERE id = :id FOR UPDATE"), {"id": submission_id},
    ).fetchone()
    if row is None:
        db.rollback()
        raise SubmissionError("not_found", "Savol topilmadi", 404)
    if row.status not in (PENDING, DUPLICATE):
        db.rollback()
        raise SubmissionError("bad_status", f"'{row.status}' holatidagi savolni tasdiqlab boʻlmaydi", 409)

    merged = {
        "question_text": edits.get("question_text", row.question_text),
        "options": edits.get("options", list(row.options)),
        "correct_index": edits.get("correct_index", row.correct_index),
        "explanation": edits.get("explanation", row.explanation),
        "source_note": row.source_note,
    }
    cleaned, errors = validate_submission(merged)
    if errors:
        db.rollback()
        raise SubmissionError("invalid", errors[0], 422)
    suggested = ((row.ai_verdict or {}).get("suggested_explanation") or "").strip()
    explanation = cleaned["explanation"] or suggested or None
    difficulty = edits.get("difficulty") or row.difficulty or "medium"
    if difficulty not in DIFFICULTIES:
        db.rollback()
        raise SubmissionError("invalid", "difficulty: easy | medium | hard", 422)
    category = edits.get("category") or row.category or OTHER_CATEGORY
    concept_tag = edits.get("concept_tag") or row.concept_tag

    db.execute(
        text("""
            UPDATE question_submissions
            SET question_text = :q, options = CAST(:opts AS jsonb), correct_index = :ci, explanation = :expl,
                difficulty = :diff, category = :cat, concept_tag = :tag, status = 'approved',
                reviewed_by = :admin, reviewed_at = NOW(), updated_at = NOW()
            WHERE id = :id
        """),
        {
            "q": cleaned["question_text"], "opts": json.dumps(cleaned["options"]), "ci": cleaned["correct_index"],
            "expl": explanation, "diff": difficulty, "cat": category, "tag": concept_tag,
            "admin": admin_id, "id": submission_id,
        },
    )
    db.commit()
    return admin_get(db, submission_id)


def reject(db: Session, submission_id: int, admin_id: Optional[int], reason: str) -> dict:
    """Internal reason only — the submitter sees "Bu safar qoʻshilmadi" and
    is never pushed. A scheduled question must be unswapped first."""
    row = db.execute(
        text("SELECT status FROM question_submissions WHERE id = :id FOR UPDATE"), {"id": submission_id},
    ).fetchone()
    if row is None:
        db.rollback()
        raise SubmissionError("not_found", "Savol topilmadi", 404)
    if row.status in (SCHEDULED, PUBLISHED):
        db.rollback()
        raise SubmissionError("bad_status", "Rejadagi yoki nashr etilgan savolni rad etib boʻlmaydi — avval qaytarib oling (unswap)", 409)
    db.execute(
        text("""
            UPDATE question_submissions
            SET status = 'rejected', rejection_reason = :reason, reviewed_by = :admin, reviewed_at = NOW(), updated_at = NOW()
            WHERE id = :id
        """),
        {"reason": clean_text(reason)[:500] or "admin", "admin": admin_id, "id": submission_id},
    )
    db.commit()
    return admin_get(db, submission_id)


def update_meta(db: Session, submission_id: int, fields: dict) -> dict:
    """Category / difficulty / concept_tag, editable while not yet live."""
    allowed = {k: v for k, v in fields.items() if k in ("category", "difficulty", "concept_tag") and v is not None}
    if "difficulty" in allowed and allowed["difficulty"] not in DIFFICULTIES:
        raise SubmissionError("invalid", "difficulty: easy | medium | hard", 422)
    if not allowed:
        return admin_get(db, submission_id)
    sets = ", ".join(f"{k} = :{k}" for k in allowed)
    res = db.execute(
        text(f"UPDATE question_submissions SET {sets}, updated_at = NOW() WHERE id = :id AND status IN ('pending_review', 'approved', 'duplicate') RETURNING id"),
        {**allowed, "id": submission_id},
    ).fetchone()
    db.commit()
    if res is None:
        raise SubmissionError("bad_status", "Bu holatda oʻzgartirib boʻlmaydi", 409)
    return admin_get(db, submission_id)


# ═══════════════════════════════════════════════════════════════════════════
# Swap / unswap / rebalance — the admin edits a FUTURE scheduled quiz
# ═══════════════════════════════════════════════════════════════════════════

EDITABLE_QUIZ_STATUSES = ("draft", "verified", "approved")

_Q_COLUMNS = """id, position, question_text, options, correct_index, explanation, source, difficulty,
                verify_model_answer, curated_fact_id, concept_tag, origin, submission_id, voided"""


def _today() -> date:
    return datetime.now(UTC).date()


def _lock_future_quiz(db: Session, quiz_id: int):
    """The quiz row, locked for this transaction. A day whose window has
    opened (today, UTC — the same clock rollover() publishes on) or closed
    can never be edited; neither can a published/closed/voided one."""
    quiz = db.execute(
        text("SELECT id, quiz_number, publish_date, status, theme FROM daily_quizzes WHERE id = :id FOR UPDATE"),
        {"id": quiz_id},
    ).fetchone()
    if quiz is None:
        raise SubmissionError("quiz_not_found", "Viktorina topilmadi", 404)
    if quiz.publish_date <= _today() or quiz.status not in EDITABLE_QUIZ_STATUSES:
        raise SubmissionError("quiz_locked", "Jonli yoki oʻtgan viktorinani oʻzgartirib boʻlmaydi — faqat kelgusi kunlar", 409)
    return quiz


def _quiz_rows(db: Session, quiz_id: int) -> list:
    return db.execute(
        text(f"SELECT {_Q_COLUMNS} FROM daily_quiz_questions WHERE quiz_id = :qid ORDER BY position"), {"qid": quiz_id},
    ).fetchall()


def _blocked_tags(db: Session, quiz, days: int) -> set[str]:
    """Concept tags on OTHER days from `days` before this quiz onward —
    the same window generate_week blocks."""
    rows = db.execute(
        text("""
            SELECT DISTINCT q.concept_tag FROM daily_quiz_questions q JOIN daily_quizzes z ON z.id = q.quiz_id
            WHERE q.concept_tag IS NOT NULL AND z.publish_date >= :since AND z.id <> :qid AND z.status <> 'voided'
        """),
        {"since": quiz.publish_date - timedelta(days=days), "qid": quiz.id},
    ).fetchall()
    return {r.concept_tag for r in rows}


def _question_snapshot(r) -> dict:
    return {
        "id": int(r.id) if getattr(r, "id", None) is not None else None,
        "question_text": r.question_text, "options": list(r.options), "correct_index": r.correct_index,
        "explanation": r.explanation, "source": r.source, "difficulty": r.difficulty,
        "concept_tag": r.concept_tag, "origin": getattr(r, "origin", "ai"),
        "submission_id": getattr(r, "submission_id", None),
    }


def _to_pool(db: Session, quiz, r, reason: str) -> int:
    row = db.execute(
        text("""
            INSERT INTO daily_quiz_question_pool
                (theme, question_text, options, correct_index, explanation, source, difficulty,
                 verify_model_answer, curated_fact_id, concept_tag, reason, origin_quiz_id, origin_position)
            VALUES (:theme, :q, CAST(:opts AS jsonb), :ci, :expl, :src, :diff, :vma, :fact, :tag, :reason, :qid, :pos)
            RETURNING id
        """),
        {
            "theme": quiz.theme, "q": r.question_text, "opts": json.dumps(list(r.options)), "ci": r.correct_index,
            "expl": r.explanation, "src": r.source, "diff": r.difficulty, "vma": r.verify_model_answer,
            "fact": r.curated_fact_id, "tag": r.concept_tag, "reason": reason, "qid": quiz.id, "pos": r.position,
        },
    ).fetchone()
    return int(row.id)


def _insert_question(db: Session, quiz_id: int, position: int, q: dict) -> int:
    row = db.execute(
        text("""
            INSERT INTO daily_quiz_questions
                (quiz_id, position, question_text, options, correct_index, explanation, source, difficulty,
                 verified, verify_model_answer, curated_fact_id, concept_tag, origin, submission_id)
            VALUES (:qid, :pos, :q, CAST(:opts AS jsonb), :ci, :expl, :src, :diff, TRUE, :vma, :fact, :tag, :origin, :sid)
            RETURNING id
        """),
        {
            "qid": quiz_id, "pos": position, "q": q["question_text"], "opts": json.dumps(q["options"]),
            "ci": q["correct_index"], "expl": q["explanation"], "src": q["source"], "diff": q["difficulty"],
            "vma": q.get("verify_model_answer"), "fact": q.get("curated_fact_id"), "tag": q.get("concept_tag"),
            "origin": q.get("origin", "ai"), "sid": q.get("submission_id"),
        },
    ).fetchone()
    return int(row.id)


def _release_submission(db: Session, submission_id: int) -> None:
    db.execute(
        text("""
            UPDATE question_submissions
            SET status = 'approved', quiz_question_id = NULL, scheduled_quiz_id = NULL,
                scheduled_position = NULL, updated_at = NOW()
            WHERE id = :id AND status = 'scheduled'
        """),
        {"id": submission_id},
    )


def _log(db: Session, action: str, admin_id: Optional[int], via: str, quiz_id: int, position: int,
         q_in: dict, q_out: Optional[dict], submission_id=None, pool_in_id=None, pool_out_id=None) -> None:
    db.execute(
        text("""
            INSERT INTO daily_quiz_swap_log
                (action, admin_id, via, quiz_id, position, question_in, question_out, submission_id, pool_in_id, pool_out_id)
            VALUES (:a, :admin, :via, :qid, :pos, CAST(:qin AS jsonb), CAST(:qout AS jsonb), :sid, :pin, :pout)
        """),
        {
            "a": action, "admin": admin_id, "via": via, "qid": quiz_id, "pos": position,
            "qin": json.dumps(q_in, ensure_ascii=False), "qout": json.dumps(q_out, ensure_ascii=False) if q_out else None,
            "sid": submission_id, "pin": pool_in_id, "pout": pool_out_id,
        },
    )


def _quiz_summary(db: Session, quiz_id: int) -> dict:
    rows = [r for r in _quiz_rows(db, quiz_id) if not r.voided]
    diffs = [r.difficulty for r in rows]
    return {
        "question_count": len(rows),
        "user_count": sum(1 for r in rows if r.origin == "user"),
        "difficulty_counts": difficulty_counts(diffs),
        "mix_warning": mix_warning(diffs),
    }


def swap(db: Session, quiz_id: int, position: int, submission_id: int, admin_id: Optional[int], via: str = "web") -> dict:
    """Puts an approved submission at `position` of a future quiz. One
    transaction: the question row swap, the displaced AI question into the
    pool, the submission to 'scheduled', the audit row. Any refusal rolls all
    of it back."""
    if not 0 <= position < QUESTIONS_PER_QUIZ:
        raise SubmissionError("invalid", "position: 0..4", 422)
    cfg = get_settings(db)
    try:
        quiz = _lock_future_quiz(db, quiz_id)
        sub = db.execute(
            text("SELECT * FROM question_submissions WHERE id = :id FOR UPDATE"), {"id": submission_id},
        ).fetchone()
        if sub is None:
            raise SubmissionError("not_found", "Savol topilmadi", 404)
        if sub.status != APPROVED:
            raise SubmissionError("bad_status", f"Faqat tasdiqlangan savolni qoʻyish mumkin (hozir: '{sub.status}')", 409)

        rows = _quiz_rows(db, quiz_id)
        current = next((r for r in rows if r.position == position), None)
        others = [r for r in rows if r.position != position]

        user_others = sum(1 for r in others if r.origin == "user")
        if user_others + 1 > int(cfg["max_user_per_quiz"]):
            raise SubmissionError(
                "user_cap", f"Bir viktorinada {cfg['max_user_per_quiz']} tadan ortiq foydalanuvchi savoli boʻlmaydi", 409,
            )
        if sub.concept_tag and any(r.concept_tag == sub.concept_tag for r in others):
            raise SubmissionError("duplicate_in_quiz", "Bu mavzu shu kunning oʻzida bor", 409)
        if sub.concept_tag and sub.concept_tag in _blocked_tags(db, quiz, int(cfg["dedup_days"])):
            raise SubmissionError("duplicate_recent", f"Bu mavzu oxirgi {cfg['dedup_days']} kun ichida ishlatilgan", 409)

        pool_out_id = None
        q_out = None
        if current is not None:
            q_out = _question_snapshot(current)
            if current.origin == "user" and current.submission_id:
                _release_submission(db, int(current.submission_id))
            else:
                pool_out_id = _to_pool(db, quiz, current, "displaced")
            db.execute(text("DELETE FROM daily_quiz_questions WHERE id = :id"), {"id": current.id})

        cold = ((sub.ai_verdict or {}).get("cold_answer") or {}).get("model_index")
        new_q = {
            "question_text": sub.question_text, "options": list(sub.options), "correct_index": sub.correct_index,
            "explanation": sub.explanation or ((sub.ai_verdict or {}).get("suggested_explanation") or ""),
            "source": sub.source_note or DEFAULT_SOURCE, "difficulty": sub.difficulty or "medium",
            "verify_model_answer": cold if isinstance(cold, int) else None, "concept_tag": sub.concept_tag,
            "origin": "user", "submission_id": int(sub.id),
        }
        new_id = _insert_question(db, quiz_id, position, new_q)
        db.execute(
            text("""
                UPDATE question_submissions
                SET status = 'scheduled', quiz_question_id = :qq, scheduled_quiz_id = :qid,
                    scheduled_position = :pos, updated_at = NOW()
                WHERE id = :id
            """),
            {"qq": new_id, "qid": quiz_id, "pos": position, "id": sub.id},
        )
        # Filling an empty slot of a short 'draft' day can complete it —
        # same rule as the admin's manual add_question.
        if current is None and len(rows) + 1 == QUESTIONS_PER_QUIZ:
            db.execute(text("UPDATE daily_quizzes SET status = 'verified', notes = NULL WHERE id = :id AND status = 'draft'"), {"id": quiz_id})
        _log(db, "swap", admin_id, via, quiz_id, position, {**new_q, "id": new_id}, q_out,
             submission_id=int(sub.id), pool_out_id=pool_out_id)
        summary = _quiz_summary(db, quiz_id)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "ok": True, "quiz_id": quiz_id, "quiz_number": quiz.quiz_number, "publish_date": quiz.publish_date.isoformat(),
        "position": position, "question_id": new_id, "displaced": q_out, "pool_id": pool_out_id, **summary,
    }


def _pick_pool(db: Session, quiz, difficulties: tuple[str, ...], blocked: set[str], prefer_id: Optional[int] = None):
    if prefer_id is not None:
        r = db.execute(
            text("SELECT * FROM daily_quiz_question_pool WHERE id = :id AND status = 'available' FOR UPDATE"), {"id": prefer_id},
        ).fetchone()
        if r is not None and (r.concept_tag is None or r.concept_tag not in blocked):
            return r
    rows = db.execute(
        text("""
            SELECT * FROM daily_quiz_question_pool
            WHERE status = 'available' AND difficulty = ANY(:diffs)
            ORDER BY (theme = :theme) DESC, created_at ASC
            LIMIT 50
            FOR UPDATE SKIP LOCKED
        """),
        {"diffs": list(difficulties), "theme": quiz.theme},
    ).fetchall()
    return next((r for r in rows if r.concept_tag is None or r.concept_tag not in blocked), None)


def _use_pool(db: Session, pool_row, quiz_id: int) -> None:
    db.execute(
        text("UPDATE daily_quiz_question_pool SET status = 'used', used_quiz_id = :qid, used_at = NOW() WHERE id = :id"),
        {"qid": quiz_id, "id": pool_row.id},
    )


def _pool_question(p) -> dict:
    return {
        "question_text": p.question_text, "options": list(p.options), "correct_index": p.correct_index,
        "explanation": p.explanation, "source": p.source, "difficulty": p.difficulty,
        "verify_model_answer": p.verify_model_answer, "curated_fact_id": p.curated_fact_id,
        "concept_tag": p.concept_tag, "origin": "ai", "submission_id": None,
    }


def unswap(db: Session, quiz_id: int, position: int, admin_id: Optional[int], via: str = "web") -> dict:
    """Takes a user question back out of a future quiz: the AI question it
    displaced comes back from the pool (or, if that one was reused since,
    another pool question of the same difficulty), and the submission returns
    to 'approved'."""
    cfg = get_settings(db)
    try:
        quiz = _lock_future_quiz(db, quiz_id)
        rows = _quiz_rows(db, quiz_id)
        current = next((r for r in rows if r.position == position), None)
        if current is None or current.origin != "user":
            raise SubmissionError("not_user_question", "Bu oʻrinda foydalanuvchi savoli yoʻq", 409)
        last = db.execute(
            text("""
                SELECT pool_out_id FROM daily_quiz_swap_log
                WHERE quiz_id = :qid AND position = :pos AND action = 'swap' AND submission_id = :sid
                ORDER BY created_at DESC LIMIT 1
            """),
            {"qid": quiz_id, "pos": position, "sid": current.submission_id},
        ).fetchone()
        others = [r for r in rows if r.position != position]
        blocked = _blocked_tags(db, quiz, int(cfg["dedup_days"])) | {r.concept_tag for r in others if r.concept_tag}
        pool_row = _pick_pool(db, quiz, (current.difficulty,), blocked, prefer_id=last.pool_out_id if last else None)
        if pool_row is None:
            pool_row = _pick_pool(db, quiz, DIFFICULTIES, blocked)
        if pool_row is None:
            raise SubmissionError("pool_empty", "Almashtirish uchun AI savoli qolmagan — avval yangi savollar yarating", 409)

        q_out = _question_snapshot(current)
        db.execute(text("DELETE FROM daily_quiz_questions WHERE id = :id"), {"id": current.id})
        if current.submission_id:
            _release_submission(db, int(current.submission_id))
        new_q = _pool_question(pool_row)
        new_id = _insert_question(db, quiz_id, position, new_q)
        _use_pool(db, pool_row, quiz_id)
        _log(db, "unswap", admin_id, via, quiz_id, position, {**new_q, "id": new_id}, q_out,
             submission_id=current.submission_id, pool_in_id=int(pool_row.id))
        summary = _quiz_summary(db, quiz_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"ok": True, "quiz_id": quiz_id, "position": position, "question_id": new_id,
            "restored_pool_id": int(pool_row.id), **summary}


def rebalance(db: Session, quiz_id: int, admin_id: Optional[int], via: str = "web") -> dict:
    """One-tap fix for a mix a swap broke: replace one AI question from an
    over-full difficulty with a pool question from a short one. User
    questions are never moved."""
    cfg = get_settings(db)
    try:
        quiz = _lock_future_quiz(db, quiz_id)
        rows = [r for r in _quiz_rows(db, quiz_id) if not r.voided]
        counts = difficulty_counts([r.difficulty for r in rows])
        over = [d for d in DIFFICULTIES if counts[d] > DIFFICULTY_TARGET[d]]
        under = tuple(d for d in DIFFICULTIES if counts[d] < DIFFICULTY_TARGET[d])
        if not over or not under:
            db.rollback()
            return {"ok": True, "changed": False, **_quiz_summary(db, quiz_id)}
        victim = next((r for r in reversed(rows) if r.difficulty in over and r.origin != "user"), None)
        if victim is None:
            raise SubmissionError("no_ai_question", "Ortiqcha qiyinlikda faqat foydalanuvchi savollari bor", 409)
        others = [r for r in rows if r.id != victim.id]
        blocked = _blocked_tags(db, quiz, int(cfg["dedup_days"])) | {r.concept_tag for r in others if r.concept_tag}
        pool_row = _pick_pool(db, quiz, under, blocked)
        if pool_row is None:
            raise SubmissionError("pool_empty", "Muvozanat uchun mos AI savoli qolmagan", 409)

        q_out = _question_snapshot(victim)
        pool_out_id = _to_pool(db, quiz, victim, "displaced")
        db.execute(text("DELETE FROM daily_quiz_questions WHERE id = :id"), {"id": victim.id})
        new_q = _pool_question(pool_row)
        new_id = _insert_question(db, quiz_id, victim.position, new_q)
        _use_pool(db, pool_row, quiz_id)
        _log(db, "rebalance", admin_id, via, quiz_id, victim.position, {**new_q, "id": new_id}, q_out,
             pool_in_id=int(pool_row.id), pool_out_id=pool_out_id)
        summary = _quiz_summary(db, quiz_id)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"ok": True, "changed": True, "quiz_id": quiz_id, "position": int(victim.position),
            "question_id": new_id, **summary}


# ═══════════════════════════════════════════════════════════════════════════
# Keeping submissions consistent when a day is edited elsewhere
# ═══════════════════════════════════════════════════════════════════════════

def release_for_quiz(db: Session, quiz_id: int) -> int:
    """Every submission scheduled into this quiz back to 'approved' — before
    a regenerate deletes the day or a reject voids it. Doesn't commit (the
    caller's transaction does)."""
    res = db.execute(
        text("""
            UPDATE question_submissions
            SET status = 'approved', quiz_question_id = NULL, scheduled_quiz_id = NULL,
                scheduled_position = NULL, updated_at = NOW()
            WHERE scheduled_quiz_id = :qid AND status = 'scheduled'
            RETURNING id
        """),
        {"qid": quiz_id},
    ).fetchall()
    return len(res)


def reconcile_quiz(db: Session, quiz_id: int) -> int:
    """Re-links scheduled submissions to their current question row (a draft
    top-up re-inserts rows with new ids) and releases any that are no longer
    in the quiz. Doesn't commit."""
    db.execute(
        text("""
            UPDATE question_submissions s
            SET quiz_question_id = q.id, scheduled_position = q.position, updated_at = NOW()
            FROM daily_quiz_questions q
            WHERE q.submission_id = s.id AND q.quiz_id = :qid AND s.status = 'scheduled'
              AND (s.quiz_question_id IS DISTINCT FROM q.id OR s.scheduled_position IS DISTINCT FROM q.position)
        """),
        {"qid": quiz_id},
    )
    res = db.execute(
        text("""
            UPDATE question_submissions s
            SET status = 'approved', quiz_question_id = NULL, scheduled_quiz_id = NULL,
                scheduled_position = NULL, updated_at = NOW()
            WHERE s.scheduled_quiz_id = :qid AND s.status = 'scheduled'
              AND NOT EXISTS (SELECT 1 FROM daily_quiz_questions q WHERE q.quiz_id = :qid AND q.submission_id = s.id)
            RETURNING s.id
        """),
        {"qid": quiz_id},
    ).fetchall()
    return len(res)


# ═══════════════════════════════════════════════════════════════════════════
# Publication: status, reward, push
# ═══════════════════════════════════════════════════════════════════════════

def grant_publication_reward(db: Session, submission_id: int) -> bool:
    """25 Tanga (app_config) once per submission, ever. Its own transaction,
    never inside the publish or any study transaction. The reward_granted
    flip, the published-count bump and the grant commit together; a replay
    finds reward_granted already TRUE and does nothing. True if paid now."""
    amount = int(get_settings(db)["reward_tanga"])
    try:
        row = db.execute(
            text("""
                UPDATE question_submissions SET reward_granted = TRUE, updated_at = NOW()
                WHERE id = :id AND status = 'published' AND reward_granted = FALSE
                RETURNING telegram_id
            """),
            {"id": submission_id},
        ).fetchone()
        if row is None:
            db.rollback()
            return False
        key = f"question_published:{submission_id}"
        already_paid = db.execute(
            text("SELECT 1 FROM tanga_transactions WHERE idempotency_key = :k"), {"k": key},
        ).fetchone()
        if already_paid is not None:
            # A data fix re-flagged a paid row: keep the flag, change nothing else.
            db.commit()
            return False
        db.execute(
            text("UPDATE profiles SET questions_published_count = COALESCE(questions_published_count, 0) + 1 WHERE telegram_id = :uid"),
            {"uid": row.telegram_id},
        )
        if amount > 0:
            result = grant_tanga(
                db, user_id=int(row.telegram_id), amount=amount, reason="question_published",
                reference_type="question_submission", reference_id=submission_id,
                idempotency_key=key,
            )
            if not result.ok:
                db.rollback()
                logger.error("question reward not granted for submission %s: %s", submission_id, result.error)
                return False
        db.commit()  # grant_tanga commits on a fresh grant; a replay returns before committing
        return True
    except Exception:
        db.rollback()
        logger.error("question reward failed for submission %s", submission_id, exc_info=True)
        raise


async def _push_submitters(db: Session, submission_ids: list[int], quiz_id: int, quiz_number: int) -> dict:
    from app.services.daily_quiz_service import _push_batch
    if not submission_ids:
        return {"sent": 0, "failed": 0}
    rows = db.execute(
        text("""
            SELECT p.user_settings FROM question_submissions s JOIN profiles p ON p.telegram_id = s.telegram_id
            WHERE s.id = ANY(:ids)
        """),
        {"ids": submission_ids},
    ).fetchall()
    messages = [{
        "to": r.user_settings.get("expo_push_token"),
        "title": f"5 SAVOL #{quiz_number}",
        "body": "Sizning savolingiz bugungi 5 SAVOLDA! Hamma unga javob beryapti.",
        "data": {"screen": "daily_quiz", "quiz_id": quiz_id},
        "sound": "default",
    } for r in rows if r.user_settings and r.user_settings.get("expo_push_token")]
    sent, failed = await _push_batch(messages)
    return {"sent": sent, "failed": failed}


async def on_quiz_published(db: Session, quiz_id: int) -> dict:
    """Right after a quiz goes live. Each user question in it: 'scheduled' ->
    'published' (committed first), then the reward in its own transaction,
    then one push to everyone who just got published. Only rows flipped in
    THIS call are pushed, so a re-run never pushes twice; a reward that
    failed is retried by the sweep."""
    quiz = db.execute(text("SELECT id, quiz_number, publish_date FROM daily_quizzes WHERE id = :id"), {"id": quiz_id}).fetchone()
    if quiz is None:
        return {"published": 0}
    flipped = db.execute(
        text("""
            UPDATE question_submissions s
            SET status = 'published', published_at = NOW(), updated_at = NOW()
            FROM daily_quiz_questions q
            WHERE q.quiz_id = :qid AND q.submission_id = s.id AND s.status = 'scheduled'
            RETURNING s.id
        """),
        {"qid": quiz_id},
    ).fetchall()
    db.commit()
    ids = [int(r.id) for r in flipped]

    rewarded = 0
    for sid in _unrewarded(db, quiz_id):
        try:
            if grant_publication_reward(db, sid):
                rewarded += 1
        except Exception:
            pass  # logged inside; the sweep retries
    push = {"sent": 0, "failed": 0}
    if ids and quiz.publish_date == _today():
        push = await _push_submitters(db, ids, quiz_id, quiz.quiz_number)
    return {"published": len(ids), "rewarded": rewarded, **push}


def _unrewarded(db: Session, quiz_id: int) -> list[int]:
    rows = db.execute(
        text("""
            SELECT s.id FROM question_submissions s JOIN daily_quiz_questions q ON q.submission_id = s.id
            WHERE q.quiz_id = :qid AND s.status = 'published' AND s.reward_granted = FALSE
        """),
        {"qid": quiz_id},
    ).fetchall()
    return [int(r.id) for r in rows]


async def sweep(db: Session) -> dict:
    """Cron (every 10 min): retries AI reviews a background task missed,
    finishes publication for any live quiz whose hook didn't run or whose
    reward failed, and releases scheduled submissions whose day was removed."""
    reviewed = 0
    stale = db.execute(
        text("""
            SELECT id FROM question_submissions
            WHERE status = 'pending_review' AND ai_reviewed_at IS NULL AND ai_review_attempts < :max
              AND updated_at < NOW() - INTERVAL '5 minutes'
            ORDER BY created_at LIMIT 20
        """),
        {"max": MAX_REVIEW_ATTEMPTS},
    ).fetchall()
    for r in stale:
        try:
            if await review_submission(db, int(r.id), sweep=True):
                reviewed += 1
        except Exception:
            db.rollback()
            logger.error("sweep review failed for submission %s", r.id, exc_info=True)

    published = 0
    live = db.execute(
        text("""
            SELECT DISTINCT z.id FROM daily_quizzes z JOIN daily_quiz_questions q ON q.quiz_id = z.id
            JOIN question_submissions s ON s.id = q.submission_id
            WHERE z.status IN ('published', 'closed')
              AND (s.status = 'scheduled' OR (s.status = 'published' AND s.reward_granted = FALSE))
        """),
    ).fetchall()
    for r in live:
        try:
            res = await on_quiz_published(db, int(r.id))
            published += res.get("published", 0)
        except Exception:
            db.rollback()
            logger.error("sweep publication failed for quiz %s", r.id, exc_info=True)

    released = db.execute(
        text("""
            UPDATE question_submissions s
            SET status = 'approved', quiz_question_id = NULL, scheduled_quiz_id = NULL,
                scheduled_position = NULL, updated_at = NOW()
            WHERE s.status = 'scheduled' AND (
                NOT EXISTS (SELECT 1 FROM daily_quiz_questions q WHERE q.submission_id = s.id)
                OR EXISTS (SELECT 1 FROM daily_quizzes z WHERE z.id = s.scheduled_quiz_id AND z.status = 'voided')
            )
            RETURNING s.id
        """),
    ).fetchall()
    db.commit()
    return {"reviewed": reviewed, "published": published, "released": len(released)}


# ═══════════════════════════════════════════════════════════════════════════
# Results-screen attribution
# ═══════════════════════════════════════════════════════════════════════════

def attributions(db: Session, quiz_id: int) -> dict[int, str]:
    """question_id -> "Ism" (or "Sahifalab foydalanuvchisi") for the user
    questions of one quiz."""
    rows = db.execute(
        text("""
            SELECT q.id, s.attribution_name, s.is_anonymous
            FROM daily_quiz_questions q JOIN question_submissions s ON s.id = q.submission_id
            WHERE q.quiz_id = :qid AND q.origin = 'user'
        """),
        {"qid": quiz_id},
    ).fetchall()
    return {int(r.id): attribution_for(r.attribution_name, r.is_anonymous) for r in rows}
