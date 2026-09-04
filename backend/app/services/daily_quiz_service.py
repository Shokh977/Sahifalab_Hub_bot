"""
daily_quiz_service.py — "5 Savol", the daily AI quiz (5-savol-daily-quiz-spec.md).

Five questions a day, the same five for every user worldwide, released
00:00 UTC, hard-expiring at the next 00:00 UTC. This module owns:

  - generate_week()      — DAILY top-up: 10 candidates/day (freeform AI
                            generation or, for the two curated categories,
                            formatted from an admin-verified curated_facts
                            row — see category_config.py) -> cold verify +
                            deep content-check + transliteration check ->
                            best-5 selection, with in-day backfill retries
                            (_generate_full_day) if attrition leaves a day
                            short, AND top-up-in-place for a day previously
                            stuck in 'draft' (never skipped forever just
                            because a row exists). Never same-day (a live
                            generation failure must never become a live
                            outage — the week is always kept generated
                            ahead). Also tracks candidates_generated/
                            candidates_verified per day and pages admin if
                            the rejection rate exceeds 60%.
  - deliver_today()       — GET /today's core: idempotently creates the
                            per-user attempt row that starts the server
                            clock (delivered_at).
  - shuffle_for_user()    — deterministic per-(user, question) option order.
  - score_and_submit()    — server-authoritative scoring + Tanga grant,
                            reward grant in its OWN transaction (spec: a
                            reward side-effect must never roll back the
                            record of the user's answers).
  - void_question()       — live void-after-reports: excludes the question
                            from scoring and refunds affected users.
  - rollover()            — daily 00:00 UTC: close yesterday, publish today.
                            AUTO-publishes any 'verified' day (generation
                            succeeded cleanly, nothing for an admin to do)
                            as well as an explicitly 'approved' one — an
                            admin only has to act on a day stuck in 'draft'.
                            Pages admins (Telegram) if nothing publishable
                            exists for today, instead of a log line nobody
                            watches.
  - send_reminder_push()  — daily 12:00 UTC: nudge users who haven't played.

Identity key: telegram_id (bigint) throughout — see profiles.telegram_id,
the sole identity key everywhere in this codebase.
"""
import hashlib
import json
import logging
import random
from datetime import date, datetime, timedelta, UTC
from typing import Optional

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.ai.gemini_provider import get_provider
from app.services.ai.base import AiProviderError
from app.services.ai.usage import log_usage
from app.services.ai.prompts import daily_quiz_gen_v2, daily_quiz_verify_v1, daily_quiz_deepcheck_v1, daily_quiz_format_v1
from app.services.tanga_service import grant_tanga, daily_capped_grant
from app.services.config_service import get_config
from app.services import category_config
from app.services.uzbek_translit import find_translit_issues

logger = logging.getLogger(__name__)

# ── Reward table (tanga-economy-rework Part 1/4 — Tanga only, never XP) ─────
# Defaults match the pre-rework hardcoded values exactly (nothing changes
# unless an admin tunes tanga_earning in app_config). This grant is also
# subject to the SHARED daily_cap (see grant_submission_reward below) —
# it is no longer its own independent, uncapped mini-economy.
def _reward_config(db: Session) -> dict:
    cfg = get_config(db, "tanga_earning", default={}) or {}
    return {
        "played":         int(cfg.get("daily_quiz_played", 5)),
        "per_correct":     int(cfg.get("daily_quiz_per_correct", 1)),
        "perfect_bonus":   int(cfg.get("daily_quiz_perfect_bonus", 3)),
        "max":             int(cfg.get("daily_quiz_max", 13)),
    }

QUESTIONS_PER_QUIZ = 5
DIFFICULTY_TARGET = {"easy": 2, "medium": 2, "hard": 1}

REPORT_VOID_THRESHOLD = 5  # reports on one question before it's auto-voided

# 5-savol-quality-fixes brief, Part 5: "if the rejection rate exceeds 60%,
# surface it to admin — that means the generation prompt needs work, not
# the verifier." See _page_admins_high_rejection_rate.
REJECTION_RATE_ALERT_THRESHOLD = 0.6


# ═══════════════════════════════════════════════════════════════════════════
# PART 1 — Generation pipeline
# ═══════════════════════════════════════════════════════════════════════════

async def _generate_candidates(db: Session, category: dict, avoid_questions: Optional[list[str]] = None) -> list[dict]:
    """Dispatches to the freeform generator or the curated-fact formatter
    depending on category["curated"] (category_config.py). Returns [] on
    any failure (logged) — caller treats an empty candidate list as "this
    day needs attention," never as a crash."""
    if category.get("curated"):
        return await _generate_curated_candidates(db, category, avoid_questions)
    return await _generate_freeform_candidates(db, category, avoid_questions)


async def _generate_freeform_candidates(db: Session, category: dict, avoid_questions: Optional[list[str]] = None) -> list[dict]:
    """One generation call -> up to 10 raw candidate questions for that
    category. Only ever called for non-curated categories (amaliy_fan,
    kitoblar_goyalar, til_soz_tarixi) — see category_config.py."""
    provider = get_provider()
    try:
        response = await provider.generate_json(
            system_prompt=daily_quiz_gen_v2.SYSTEM_PROMPT,
            user_prompt=daily_quiz_gen_v2.build_user_prompt(category, avoid_questions),
            prompt_version=daily_quiz_gen_v2.VERSION,
            json_schema=daily_quiz_gen_v2.JSON_SCHEMA,
            temperature=0.2,  # low temperature (spec) — consistency over creativity
        )
    except AiProviderError as e:
        log_usage(db, user_id=None, feature="daily_quiz_gen", model="gemini-flash-lite-latest",
                  prompt_version=daily_quiz_gen_v2.VERSION, outcome=e.outcome, error_detail=str(e))
        logger.error("daily_quiz generation call failed for category=%s", category["key"], exc_info=True)
        return []

    log_usage(db, user_id=None, feature="daily_quiz_gen", model=response.model,
              prompt_version=daily_quiz_gen_v2.VERSION, input_tokens=response.input_tokens,
              output_tokens=response.output_tokens, cost_usd=response.cost_usd,
              latency_ms=response.latency_ms, outcome=response.outcome)

    if not response.data:
        return []
    questions = response.data.get("questions") or []
    # Defensive validation — a model can return well-formed JSON that still
    # violates the schema's intent (e.g. 3 options, an out-of-range index).
    # Silently drop malformed candidates rather than let one bad row crash
    # the whole day's pipeline; there were 10 candidates for exactly this
    # kind of loss.
    valid = []
    for q in questions:
        opts = q.get("options") or []
        idx = q.get("correct_index")
        if (
            isinstance(q.get("question_text"), str) and q["question_text"].strip()
            and isinstance(opts, list) and len(opts) == 4 and all(isinstance(o, str) for o in opts)
            and isinstance(idx, int) and 0 <= idx <= 3
            and isinstance(q.get("explanation"), str) and q["explanation"].strip()
            and isinstance(q.get("source"), str) and q["source"].strip()
            and q.get("difficulty") in ("easy", "medium", "hard")
        ):
            valid.append(q)
        else:
            logger.warning("daily_quiz candidate dropped (malformed): %r", q)
    return valid


async def _generate_curated_candidates(db: Session, category: dict, avoid_questions: Optional[list[str]] = None) -> list[dict]:
    """Format-only path for ozbek_adabiyoti/tarix_meros (brief Part 4): pulls
    admin-verified, not-recently-used facts from curated_facts (owned by the
    content-bot repo, same shared Postgres — see plan doc) and asks the model
    ONLY to build a question+distractors around each fact, never to supply
    the fact itself. A day with fewer available facts than needed simply
    comes up short through the existing retry/backfill/warning machinery in
    _generate_full_day — no special-case error path needed."""
    provider = get_provider()
    n = sum(daily_quiz_gen_v2.CANDIDATE_MIX.values())
    avoid_set = set(avoid_questions or [])

    rows = db.execute(
        text("""
            SELECT id, fact_text, source FROM curated_facts
            WHERE category = :cat AND verified = true AND active = true
              AND (last_used_at IS NULL OR last_used_at < NOW() - INTERVAL '90 days')
            ORDER BY times_used ASC, last_used_at ASC NULLS FIRST
            LIMIT :n
        """),
        {"cat": category["key"], "n": n},
    ).fetchall()

    candidates = []
    for row in rows:
        try:
            response = await provider.generate_json(
                system_prompt=daily_quiz_format_v1.SYSTEM_PROMPT,
                user_prompt=daily_quiz_format_v1.build_user_prompt(row.fact_text),
                prompt_version=daily_quiz_format_v1.VERSION,
                json_schema=daily_quiz_format_v1.JSON_SCHEMA,
                temperature=0.2,
            )
        except AiProviderError as e:
            log_usage(db, user_id=None, feature="daily_quiz_format", model="gemini-flash-lite-latest",
                      prompt_version=daily_quiz_format_v1.VERSION, outcome=e.outcome, error_detail=str(e))
            logger.error("daily_quiz format call failed for curated_fact_id=%s", row.id, exc_info=True)
            continue

        log_usage(db, user_id=None, feature="daily_quiz_format", model=response.model,
                  prompt_version=daily_quiz_format_v1.VERSION, input_tokens=response.input_tokens,
                  output_tokens=response.output_tokens, cost_usd=response.cost_usd,
                  latency_ms=response.latency_ms, outcome=response.outcome)

        q = response.data or {}
        opts = q.get("options") or []
        idx = q.get("correct_index")
        if not (
            isinstance(q.get("question_text"), str) and q["question_text"].strip()
            and isinstance(opts, list) and len(opts) == 4 and all(isinstance(o, str) for o in opts)
            and isinstance(idx, int) and 0 <= idx <= 3
            and isinstance(q.get("explanation"), str) and q["explanation"].strip()
            and q.get("difficulty") in ("easy", "medium", "hard")
        ):
            logger.warning("daily_quiz curated candidate dropped (malformed): %r", q)
            continue
        if q["question_text"] in avoid_set:
            continue

        candidates.append({
            "question_text": q["question_text"], "options": opts, "correct_index": idx,
            "explanation": q["explanation"],
            "source": row.source,  # admin-pinned, never model-authored (brief Part 4 rule #3)
            "difficulty": q["difficulty"],
            "curated_fact_id": int(row.id),
        })
    return candidates


async def _deep_verify_candidate(db: Session, candidate: dict) -> tuple[bool, list[str]]:
    """The 'hot' content check (brief Part 5) — sees the full candidate and
    judges mutual exclusivity, distractor authenticity, the difficulty
    floor, single-defensible-answer, and the banned-content list. Runs
    alongside (never instead of) _verify_candidate's cold answer-only
    check, which can't see any of this. Fails closed on any call error."""
    provider = get_provider()
    try:
        response = await provider.generate_json(
            system_prompt=daily_quiz_deepcheck_v1.SYSTEM_PROMPT,
            user_prompt=daily_quiz_deepcheck_v1.build_user_prompt(candidate),
            prompt_version=daily_quiz_deepcheck_v1.VERSION,
            json_schema=daily_quiz_deepcheck_v1.JSON_SCHEMA,
            temperature=0.0,
        )
    except AiProviderError as e:
        log_usage(db, user_id=None, feature="daily_quiz_deepcheck", model="gemini-flash-lite-latest",
                  prompt_version=daily_quiz_deepcheck_v1.VERSION, outcome=e.outcome, error_detail=str(e))
        logger.error("daily_quiz deep-check call failed", exc_info=True)
        return False, ["deep-check call failed"]

    log_usage(db, user_id=None, feature="daily_quiz_deepcheck", model=response.model,
              prompt_version=daily_quiz_deepcheck_v1.VERSION, input_tokens=response.input_tokens,
              output_tokens=response.output_tokens, cost_usd=response.cost_usd,
              latency_ms=response.latency_ms, outcome=response.outcome)

    data = response.data or {}
    if data.get("verdict") != "pass":
        reasons = data.get("reasons") or ["deep-check returned no reasons"]
        return False, reasons
    return True, []


def _check_transliteration(candidate: dict) -> list[str]:
    """Deterministic, no AI call (see uzbek_translit.py docstring for why).
    Returns human-readable reason strings, empty if clean."""
    issues = find_translit_issues(candidate)
    return [f"{i['field']}: '{i['wrong']}' -> '{i['correct']}'" for i in issues]


async def _verify_candidate(db: Session, candidate: dict) -> bool:
    """The cold, independent second call (spec: 'highest-value quality
    mechanism'). No key, no explanation, no source — just question +
    options. Disagreement -> discard. A verification call FAILING (network/
    parse error) is treated the same as disagreement: fail closed, never
    publish a question nobody actually checked."""
    provider = get_provider()
    try:
        response = await provider.generate_json(
            system_prompt=daily_quiz_verify_v1.SYSTEM_PROMPT,
            user_prompt=daily_quiz_verify_v1.build_user_prompt(candidate["question_text"], candidate["options"]),
            prompt_version=daily_quiz_verify_v1.VERSION,
            json_schema=daily_quiz_verify_v1.JSON_SCHEMA,
            temperature=0.0,
        )
    except AiProviderError as e:
        log_usage(db, user_id=None, feature="daily_quiz_verify", model="gemini-flash-lite-latest",
                  prompt_version=daily_quiz_verify_v1.VERSION, outcome=e.outcome, error_detail=str(e))
        logger.error("daily_quiz verification call failed", exc_info=True)
        return False

    log_usage(db, user_id=None, feature="daily_quiz_verify", model=response.model,
              prompt_version=daily_quiz_verify_v1.VERSION, input_tokens=response.input_tokens,
              output_tokens=response.output_tokens, cost_usd=response.cost_usd,
              latency_ms=response.latency_ms, outcome=response.outcome)

    if not response.data:
        return False
    model_answer = response.data.get("answer_index")
    candidate["verify_model_answer"] = model_answer
    return isinstance(model_answer, int) and model_answer == candidate["correct_index"]


def select_five(candidates: list[dict]) -> tuple[list[dict], list[str]]:
    """
    Pure, deterministic selection — the ONE place difficulty mix is decided
    (spec: 2 easy, 2 medium, 1 hard). Only `verified=True` candidates are
    eligible. Returns (selected, warnings); warnings is non-empty whenever
    a bucket came up short — the caller surfaces this so admin knows a day
    needs attention, rather than silently publishing an unbalanced or
    short quiz.

    Deliberately a standalone function (not inlined into generate_week) so
    it can be unit-tested without touching the DB or the AI provider.
    """
    verified = [c for c in candidates if c.get("verified")]
    chosen_idx: set[int] = set()
    warnings: list[str] = []

    for level, need in DIFFICULTY_TARGET.items():
        pool = [i for i, c in enumerate(verified) if c["difficulty"] == level and i not in chosen_idx]
        take = pool[:need]
        chosen_idx.update(take)
        if len(take) < need:
            warnings.append(f"{level}: needed {need}, only {len(take)} verified candidate(s) available")

    if len(chosen_idx) < QUESTIONS_PER_QUIZ:
        # Backfill from whatever verified candidates remain, any difficulty —
        # a slightly off-mix day beats a short one. Still logged above.
        remaining = [i for i in range(len(verified)) if i not in chosen_idx]
        for i in remaining:
            if len(chosen_idx) >= QUESTIONS_PER_QUIZ:
                break
            chosen_idx.add(i)

    selected = [verified[i] for i in sorted(chosen_idx)]
    return selected, warnings


def _next_quiz_number(db: Session) -> int:
    row = db.execute(text("SELECT COALESCE(MAX(quiz_number), 0) AS n FROM daily_quizzes")).fetchone()
    return int(row.n) + 1


MAX_GENERATION_ROUNDS = 3  # bounds AI cost/latency — see _generate_full_day


async def _run_verification(db: Session, candidate: dict) -> None:
    """Runs all three checks (brief Part 5) and sets candidate["verified"] +
    candidate["reject_reasons"] in place. The deep-check AI call is skipped
    if the cold check already disagreed (cost saving — the candidate is
    rejected either way); the transliteration check is always run (free,
    deterministic) so reject_reasons stays informative for admin review."""
    cold_ok = await _verify_candidate(db, candidate)
    if cold_ok:
        deep_ok, deep_reasons = await _deep_verify_candidate(db, candidate)
    else:
        deep_ok, deep_reasons = False, []
    translit_reasons = _check_transliteration(candidate)

    reject_reasons = []
    if not cold_ok:
        reject_reasons.append("cold verification disagreed with correct_index")
    reject_reasons.extend(deep_reasons)
    reject_reasons.extend(translit_reasons)

    candidate["verified"] = cold_ok and deep_ok and not translit_reasons
    candidate["reject_reasons"] = reject_reasons


async def _generate_full_day(
    db: Session, category: dict, seed_pool: Optional[list[dict]] = None,
) -> tuple[list[dict], list[str], int, int]:
    """
    Generate (or top up) one day's worth of verified candidates. The old
    version called _generate_candidates exactly once and accepted whatever
    survived verification — the direct cause of "some days only 3
    questions": verification attrition has no reason to stop exactly at 5.

    This retries up to MAX_GENERATION_ROUNDS times, each round asking for a
    fresh batch of 10 candidates (avoiding near-duplicates of what's already
    in the pool, via the prompt's avoid_questions block) and merging the
    newly-verified ones in, until select_five reports a clean 5 or the round
    budget is exhausted. seed_pool lets a caller resume from questions a
    PRIOR run already verified (used by generate_week's top-up-in-place path
    for a day stuck in 'draft') instead of throwing away good work.

    Returns (selected, warnings, candidates_generated, candidates_verified) —
    the last two feed the rejection-rate tracking in generate_week (brief
    Part 5 / deliverable 1's missing aggregate metric).
    """
    pool: list[dict] = list(seed_pool or [])
    selected, warnings = select_five(pool)
    if len(selected) >= QUESTIONS_PER_QUIZ:
        return selected, [], len(pool), sum(1 for c in pool if c.get("verified"))

    for round_num in range(1, MAX_GENERATION_ROUNDS + 1):
        avoid = [c["question_text"] for c in pool]
        candidates = await _generate_candidates(db, category, avoid_questions=avoid)
        for c in candidates:
            await _run_verification(db, c)
        pool.extend(candidates)

        selected, warnings = select_five(pool)
        if len(selected) >= QUESTIONS_PER_QUIZ:
            return selected, [], len(pool), sum(1 for c in pool if c.get("verified"))
        if round_num < MAX_GENERATION_ROUNDS:
            logger.warning(
                "daily_quiz category=%s generation round %d/%d short: %d/%d verified so far — retrying",
                category["key"], round_num, MAX_GENERATION_ROUNDS, len(selected), QUESTIONS_PER_QUIZ,
            )
    return selected, warnings, len(pool), sum(1 for c in pool if c.get("verified"))


async def generate_week(db: Session, start_date: date, days_ahead: int = 7) -> dict:
    """
    Keeps a rolling `days_ahead`-day window generated. Safe to call as
    often as needed — it's the body of BOTH the daily cron and the admin
    "generate now" button:

      - A day with no row yet: generated fresh (with in-day backfill retries
        via _generate_full_day).
      - A day already 'verified'/'approved'/'published'/'closed'/'voided':
        left completely untouched.
      - A day stuck in 'draft' (a past run came up short even after
        retries): TOPPED UP IN PLACE — its already-verified questions are
        reused as a seed pool rather than discarded, and only the shortfall
        is regenerated. Previously such a day would be silently skipped
        forever (a row already existed, so the old skip-if-exists check
        never revisited it) — this is the other direct cause of "some days
        stayed short."

    Calling this daily (not just weekly) is what actually keeps the rolling
    week full — see main.py's scheduler.
    """
    created = []
    skipped = []
    for i in range(days_ahead):
        publish_date = start_date + timedelta(days=i)
        existing = db.execute(
            text("SELECT id, status, quiz_number FROM daily_quizzes WHERE publish_date = :d"), {"d": publish_date},
        ).fetchone()

        if existing and existing.status != "draft":
            skipped.append(publish_date.isoformat())
            continue

        weekday = publish_date.weekday()
        category = category_config.get_weekday_category(db, weekday)
        theme_key, theme_label = category["key"], category["label"]

        if existing:
            quiz_id = int(existing.id)
            quiz_number = int(existing.quiz_number)
            prior_rows = db.execute(
                text("""
                    SELECT question_text, options, correct_index, explanation, source,
                           difficulty, verify_model_answer, curated_fact_id
                    FROM daily_quiz_questions WHERE quiz_id = :qid
                """),
                {"qid": quiz_id},
            ).fetchall()
            seed_pool = [
                {
                    "question_text": r.question_text, "options": list(r.options), "correct_index": r.correct_index,
                    "explanation": r.explanation, "source": r.source, "difficulty": r.difficulty,
                    "verified": True, "verify_model_answer": r.verify_model_answer,
                    "curated_fact_id": r.curated_fact_id,
                }
                for r in prior_rows
            ]
            seed_fact_ids = {r.curated_fact_id for r in prior_rows if r.curated_fact_id}
            selected, warnings, gen_count, ver_count = await _generate_full_day(db, category, seed_pool=seed_pool)
            db.execute(text("DELETE FROM daily_quiz_questions WHERE quiz_id = :qid"), {"qid": quiz_id})
        else:
            seed_fact_ids = set()
            selected, warnings, gen_count, ver_count = await _generate_full_day(db, category)
            quiz_number = _next_quiz_number(db)
            quiz_row = db.execute(
                text("""
                    INSERT INTO daily_quizzes (quiz_number, publish_date, theme, status)
                    VALUES (:num, :d, :theme, 'draft')
                    RETURNING id
                """),
                {"num": quiz_number, "d": publish_date, "theme": theme_key},
            ).fetchone()
            quiz_id = int(quiz_row.id)

        status = "verified" if len(selected) == QUESTIONS_PER_QUIZ and not warnings else "draft"
        db.execute(
            text("""
                UPDATE daily_quizzes
                SET status = :status, notes = :notes,
                    candidates_generated = :gen, candidates_verified = :ver
                WHERE id = :id
            """),
            {
                "status": status, "notes": "; ".join(warnings) or None,
                "gen": gen_count, "ver": ver_count, "id": quiz_id,
            },
        )

        for position, q in enumerate(selected):
            db.execute(
                text("""
                    INSERT INTO daily_quiz_questions
                        (quiz_id, position, question_text, options, correct_index,
                         explanation, source, difficulty, verified, verify_model_answer,
                         curated_fact_id)
                    VALUES
                        (:qid, :pos, :qtext, CAST(:opts AS jsonb), :cidx,
                         :expl, :src, :diff, :verified, :vma, :fact_id)
                """),
                {
                    "qid": quiz_id, "pos": position, "qtext": q["question_text"],
                    "opts": json.dumps(q["options"]), "cidx": q["correct_index"],
                    "expl": q["explanation"], "src": q["source"], "diff": q["difficulty"],
                    "verified": True, "vma": q.get("verify_model_answer"),
                    "fact_id": q.get("curated_fact_id"),
                },
            )

        # Only bump usage on facts NEWLY consumed this run — a fact already
        # in the seed pool (from a prior top-up run) was already marked used
        # when it was first selected; re-inserting it here on a top-up must
        # not double-count it (brief Part 4: "avoid repeating a fact within
        # ~90 days" depends on times_used/last_used_at being accurate).
        newly_used_fact_ids = [
            q["curated_fact_id"] for q in selected
            if q.get("curated_fact_id") and q["curated_fact_id"] not in seed_fact_ids
        ]
        if newly_used_fact_ids:
            db.execute(
                text("UPDATE curated_facts SET times_used = times_used + 1, last_used_at = NOW() WHERE id = ANY(:ids)"),
                {"ids": newly_used_fact_ids},
            )

        db.commit()

        if warnings:
            logger.error(
                "daily_quiz %s (#%s, %s) generated SHORT even after %d retry round(s) — %s. "
                "Only %d/%d questions; status='draft', needs admin attention.",
                publish_date, quiz_number, theme_label, MAX_GENERATION_ROUNDS,
                "; ".join(warnings), len(selected), QUESTIONS_PER_QUIZ,
            )

        rejection_rate = (1 - ver_count / gen_count) if gen_count else 0.0
        if gen_count > 0 and rejection_rate > REJECTION_RATE_ALERT_THRESHOLD:
            await _page_admins_high_rejection_rate(publish_date, theme_label, gen_count, ver_count, rejection_rate)

        created.append({"publish_date": publish_date.isoformat(), "quiz_number": quiz_number,
                         "theme": theme_key, "status": status, "question_count": len(selected),
                         "candidates_generated": gen_count, "candidates_verified": ver_count,
                         "rejection_rate": round(rejection_rate, 3)})

        # A day for TODAY that just became ready (this run finally reached
        # 5, or a regenerate replaced a voided/short today) has already
        # missed its normal 00:00 UTC rollover — publish it now rather than
        # silently waiting until tomorrow's rollover.
        if status == "verified":
            await publish_if_ready_today(db, quiz_id)

    return {"created": created, "skipped": skipped}


# ═══════════════════════════════════════════════════════════════════════════
# PART 2 — Per-user delivery, shuffle, scoring
# ═══════════════════════════════════════════════════════════════════════════

def _seed(user_id: int, question_id: int) -> int:
    """Deterministic per-(user, question) seed — NOT Python's hash() on a
    tuple, which is fine for ints in CPython but relies on unwritten
    interpreter behaviour rather than a documented guarantee. sha256 is
    explicit, auditable, and stable across processes/versions."""
    digest = hashlib.sha256(f"{user_id}:{question_id}".encode()).hexdigest()
    return int(digest[:8], 16)


def shuffle_for_user(user_id: int, question_id: int, options: list[str]) -> tuple[list[str], list[int]]:
    """Returns (shuffled_options, perm) where perm[shown_index] = original
    index. Deterministic per (user, question) — the same user always sees
    the same order for the same question, computed on demand, never stored."""
    perm = list(range(len(options)))
    random.Random(_seed(user_id, question_id)).shuffle(perm)
    shuffled = [options[i] for i in perm]
    return shuffled, perm


def _quiz_questions(db: Session, quiz_id: int) -> list:
    return db.execute(
        text("""
            SELECT id, position, question_text, options, correct_index,
                   explanation, source, difficulty, voided
            FROM daily_quiz_questions
            WHERE quiz_id = :qid
            ORDER BY position
        """),
        {"qid": quiz_id},
    ).fetchall()


def deliver_today(db: Session, user_id: int, quiz_id: int) -> dict:
    """GET /today's core. Idempotent: a second call for the same (user,
    quiz) returns the SAME delivered_at — the server clock, once started,
    never resets just because the client re-fetched."""
    existing = db.execute(
        text("SELECT id, delivered_at, submitted_at, correct_count, elapsed_ms, tanga_awarded, answers FROM daily_quiz_attempts WHERE user_id = :uid AND quiz_id = :qid"),
        {"uid": user_id, "qid": quiz_id},
    ).fetchone()

    if existing is None:
        now = datetime.now(UTC)
        db.execute(
            text("""
                INSERT INTO daily_quiz_attempts (user_id, quiz_id, delivered_at)
                VALUES (:uid, :qid, :now)
                ON CONFLICT (user_id, quiz_id) DO NOTHING
            """),
            {"uid": user_id, "qid": quiz_id, "now": now},
        )
        db.commit()
        existing = db.execute(
            text("SELECT id, delivered_at, submitted_at, correct_count, elapsed_ms FROM daily_quiz_attempts WHERE user_id = :uid AND quiz_id = :qid"),
            {"uid": user_id, "qid": quiz_id},
        ).fetchone()

    questions = _quiz_questions(db, quiz_id)
    shuffled_questions = []
    for q in questions:
        if q.voided:
            continue
        shuffled, _ = shuffle_for_user(user_id, q.id, list(q.options))
        shuffled_questions.append({
            "question_id": q.id, "position": q.position,
            "question_text": q.question_text, "options": shuffled,
        })

    result = {
        "attempt_id": int(existing.id),
        "delivered_at": existing.delivered_at.isoformat(),
        "submitted": existing.submitted_at is not None,
        "correct_count": existing.correct_count,
        "questions": shuffled_questions,
    }

    # Reopening the app after already playing today needs the FULL result
    # (share ticket data, streak) — GET /today is the only call the client
    # makes in that case, so it has to carry everything, not just
    # correct_count. Previously the client tried to get this by re-calling
    # POST /submit with an empty answers list, which 422'd outright
    # (SubmitRequest.answers has min_length=1) and surfaced the raw Pydantic
    # error array as on-screen text.
    if existing.submitted_at is not None:
        ordered_questions = sorted(
            (q for q in questions if not q.voided), key=lambda q: q.position,
        )
        per_question = _score_from_stored_answers(user_id, ordered_questions, existing.answers or [])
        result["per_question_correct"] = per_question
        result["tanga_awarded"] = existing.tanga_awarded
        result["quiz_streak_days"] = _current_play_streak(db, user_id)

    return result


def score_and_submit(db: Session, user_id: int, quiz_id: int, answers: list[dict]) -> dict:
    """
    Server-authoritative scoring (spec Part 3 — never trust client score or
    timing). answers: [{"question_id": int, "selected_index": int}, ...].

    Idempotent via the UNIQUE(user_id, quiz_id) constraint on
    daily_quiz_attempts: if already submitted, returns the ORIGINAL result
    without rescoring — a replay (network retry, double-tap) can never
    change an already-final score.

    The Tanga grant happens AFTER this function's own transaction commits
    (spec Part 4: reward grant in its own transaction, never inside the
    submission transaction) — see the caller in the API endpoint.
    """
    attempt = db.execute(
        text("SELECT id, delivered_at, submitted_at, correct_count, tanga_awarded, answers FROM daily_quiz_attempts WHERE user_id = :uid AND quiz_id = :qid"),
        {"uid": user_id, "qid": quiz_id},
    ).fetchone()
    if attempt is None:
        raise ValueError("no delivered attempt — call GET /today first")

    questions = {q.id: q for q in _quiz_questions(db, quiz_id) if not q.voided}
    # Per-question right/wrong for THIS user's own answers, in question
    # position order — safe to reveal before window close (it never
    # exposes the correct answer to anyone, only "were you right"), and is
    # exactly what the spoiler-free Wordle-style share card needs.
    ordered_questions = sorted(questions.values(), key=lambda q: q.position)

    if attempt.submitted_at is not None:
        per_question = _score_from_stored_answers(user_id, ordered_questions, attempt.answers or [])
        return {
            "already_submitted": True,
            "correct_count": attempt.correct_count,
            "tanga_awarded": attempt.tanga_awarded,
            "per_question_correct": per_question,
            "quiz_streak_days": _current_play_streak(db, user_id),
        }

    now = datetime.now(UTC)
    elapsed_ms = max(0, int((now - attempt.delivered_at).total_seconds() * 1000))

    per_question = _score_from_stored_answers(user_id, ordered_questions, answers)
    correct_count = sum(1 for c in per_question if c)

    reward_cfg = _reward_config(db)
    total_valid = len(questions)
    tanga = reward_cfg["played"] + correct_count * reward_cfg["per_correct"]
    if total_valid > 0 and correct_count == total_valid:
        tanga += reward_cfg["perfect_bonus"]
    tanga = min(tanga, reward_cfg["max"])  # defensive ceiling, see module docstring

    db.execute(
        text("""
            UPDATE daily_quiz_attempts
            SET submitted_at = :now, elapsed_ms = :elapsed, answers = CAST(:answers AS jsonb),
                correct_count = :cc, tanga_awarded = :tanga
            WHERE id = :aid
        """),
        {
            "now": now, "elapsed": elapsed_ms, "answers": json.dumps(answers),
            "cc": correct_count, "tanga": tanga, "aid": int(attempt.id),
        },
    )
    _bump_play_streak(db, user_id)
    db.commit()

    return {
        "already_submitted": False,
        "correct_count": correct_count,
        "total_questions": total_valid,
        "elapsed_ms": elapsed_ms,
        "tanga_awarded": tanga,
        "per_question_correct": per_question,
        "quiz_streak_days": _current_play_streak(db, user_id),
    }


def _current_play_streak(db: Session, user_id: int) -> int:
    row = db.execute(
        text("SELECT quiz_streak_days FROM profiles WHERE telegram_id = :uid"), {"uid": user_id},
    ).fetchone()
    return int(row.quiz_streak_days or 0) if row else 0


def _score_from_stored_answers(user_id: int, ordered_questions: list, answers: list[dict]) -> list[bool]:
    by_qid = {a.get("question_id"): a.get("selected_index") for a in (answers or [])}
    result = []
    for q in ordered_questions:
        selected = by_qid.get(q.id)
        if not isinstance(selected, int):
            result.append(False)
            continue
        _, perm = shuffle_for_user(user_id, q.id, list(q.options))
        result.append(0 <= selected < len(perm) and perm[selected] == q.correct_index)
    return result


def grant_submission_reward(db: Session, user_id: int, quiz_id: int, tanga: int) -> None:
    """Separate transaction from score_and_submit() by construction — the
    caller (endpoint) invokes this AFTER score_and_submit() has already
    committed. Idempotent on (user, quiz) so a retry can never double-grant.

    tanga-economy-rework Part 1: this quiz reward (up to 13/day) now shares
    the SAME daily_cap as the focus-timer earn events (goal/60min/120min) —
    it is no longer its own independent, uncapped mini-economy. Bucketed by
    the quiz's own UTC calendar day (datetime.now(UTC).date()), not the
    user's local day like the timer events — a deliberate simplification
    since the quiz itself is a single global UTC-day construct (same 5
    questions for everyone, resets 00:00 UTC); see the accompanying report."""
    if tanga <= 0:
        return
    daily_capped_grant(
        db, user_id=user_id, amount=tanga, reason="daily_quiz",
        today=datetime.now(UTC).date(),
        reference_type="daily_quiz", reference_id=quiz_id,
        idempotency_key=f"daily_quiz:{user_id}:{quiz_id}",
    )


def _bump_play_streak(db: Session, user_id: int) -> None:
    """Separate from the study streak (streak_days) by design (spec)."""
    row = db.execute(
        text("SELECT quiz_streak_days, quiz_last_played_date FROM profiles WHERE telegram_id = :uid"),
        {"uid": user_id},
    ).fetchone()
    if row is None:
        return
    today = datetime.now(UTC).date()
    last = row.quiz_last_played_date
    if last == today:
        return  # already counted today (shouldn't happen — one attempt/day — defensive)
    new_streak = (row.quiz_streak_days or 0) + 1 if last == today - timedelta(days=1) else 1
    db.execute(
        text("UPDATE profiles SET quiz_streak_days = :s, quiz_last_played_date = :d WHERE telegram_id = :uid"),
        {"s": new_streak, "d": today, "uid": user_id},
    )


# ═══════════════════════════════════════════════════════════════════════════
# PART 3 — Results, percentile, void/refund
# ═══════════════════════════════════════════════════════════════════════════

def results_and_percentile(db: Session, quiz_id: int, user_id: int) -> Optional[dict]:
    """Same RANK()-over-percentile idiom as challenges.py's leaderboard —
    computed live, never materialised, so a void's effect on standings is
    automatically reflected with no separate 'recompute' step."""
    total = db.execute(
        text("SELECT COUNT(*) FROM daily_quiz_attempts WHERE quiz_id = :qid AND submitted_at IS NOT NULL"),
        {"qid": quiz_id},
    ).scalar() or 0

    caller = db.execute(
        text("""
            SELECT rank, correct_count, elapsed_ms FROM (
                SELECT user_id, correct_count, elapsed_ms,
                       RANK() OVER (ORDER BY correct_count DESC, elapsed_ms ASC) AS rank
                FROM daily_quiz_attempts
                WHERE quiz_id = :qid AND submitted_at IS NOT NULL
            ) ranked
            WHERE user_id = :uid
        """),
        {"qid": quiz_id, "uid": user_id},
    ).fetchone()

    percentile = None
    if caller and total > 0:
        percentile = round((1 - (caller.rank - 1) / total) * 100)

    return {
        "total_players": total,
        "caller": {
            "rank": caller.rank, "correct_count": caller.correct_count,
            "elapsed_ms": caller.elapsed_ms, "percentile": percentile,
        } if caller else None,
    }


def void_question_and_refund(db: Session, question_id: int) -> dict:
    """
    Live void-after-reports (spec Part 4/5). Refunds the +1-per-correct-
    answer Tanga to every user who had already answered this question
    correctly — the direct, auditable interpretation of "refund affected
    users." Known simplification: if a user's perfect-5/5 bonus (+3) was
    earned partly BECAUSE of this question, that bonus is not separately
    clawed back — reversing an already-granted bonus would need a
    negative-amount grant/spend variant that doesn't exist elsewhere in
    this codebase, and void events are expected to be rare (report-
    threshold crossings only). Flagged in the spec-deviations note.
    """
    q = db.execute(
        text("SELECT id, quiz_id, correct_index, voided FROM daily_quiz_questions WHERE id = :qid"),
        {"qid": question_id},
    ).fetchone()
    if q is None or q.voided:
        return {"ok": False, "reason": "not_found_or_already_voided"}

    db.execute(text("UPDATE daily_quiz_questions SET voided = TRUE WHERE id = :qid"), {"qid": question_id})
    db.commit()

    attempts = db.execute(
        text("""
            SELECT id, user_id, answers, correct_count
            FROM daily_quiz_attempts
            WHERE quiz_id = :quiz_id AND submitted_at IS NOT NULL AND answers IS NOT NULL
        """),
        {"quiz_id": q.quiz_id},
    ).fetchall()

    refunded = 0
    for a in attempts:
        answer_for_q = next((x for x in (a.answers or []) if x.get("question_id") == question_id), None)
        if answer_for_q is None:
            continue
        _, perm = shuffle_for_user(a.user_id, question_id, list(range(4)))  # perm only depends on length, not values
        selected = answer_for_q.get("selected_index")
        was_correct = isinstance(selected, int) and 0 <= selected < len(perm) and perm[selected] == q.correct_index
        if not was_correct:
            continue
        db.execute(
            text("UPDATE daily_quiz_attempts SET correct_count = GREATEST(0, correct_count - 1) WHERE id = :aid"),
            {"aid": int(a.id)},
        )
        db.commit()
        grant_tanga(
            db, user_id=a.user_id, amount=_reward_config(db)["per_correct"], reason="daily_quiz_void_refund",
            reference_type="daily_quiz_question", reference_id=question_id,
            idempotency_key=f"daily_quiz_void:{a.user_id}:{question_id}",
            celebrate=False,  # reversing a voided question is not a reward
        )
        refunded += 1

    return {"ok": True, "refunded_users": refunded}


async def _page_admins_question_voided(question_id: int, report_count: int, void_result: dict) -> None:
    """Same direct-Telegram-message channel as volume_alert_service.py's
    standing alert (this codebase's established, cheapest-available paging
    mechanism — no new vendor integration). Spec: reports crossing the
    threshold must "alert admin," not just log — a log line nobody's
    watching is exactly the failure mode the 3-day focus_sessions outage
    postmortem was about."""
    from app.core.config import settings

    admin_ids: list[int] = settings.ADMIN_TELEGRAM_IDS or []
    bot_token: str = settings.TELEGRAM_BOT_TOKEN
    message = (
        "🚩 <b>5 Savol — savol avtomatik bekor qilindi</b>\n\n"
        f"question_id: {question_id}\n"
        f"Shikoyatlar soni: {report_count}\n"
        f"Qaytarilgan foydalanuvchilar: {void_result.get('refunded_users', 0)}\n\n"
        "Savolni ko'rib chiqing — admin panelida tuzatish yoki qayta yaratish mumkin."
    )
    if not bot_token or not admin_ids:
        logger.critical("daily_quiz auto-void (no admin channel configured, logging only): %s", message)
        return
    for chat_id in admin_ids:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
                )
        except Exception:
            logger.error("Failed to page admin %s about auto-voided daily_quiz question", chat_id, exc_info=True)


async def _page_admins_high_rejection_rate(
    publish_date: date, theme_label: str, gen_count: int, ver_count: int, rejection_rate: float,
) -> None:
    """Brief Part 5 / deliverable 1's missing piece: 'if the rejection rate
    exceeds 60%, surface it to admin — that means the generation prompt
    needs work, not the verifier.' Same direct-Telegram-message channel as
    the other daily_quiz paging functions."""
    from app.core.config import settings

    admin_ids: list[int] = settings.ADMIN_TELEGRAM_IDS or []
    bot_token: str = settings.TELEGRAM_BOT_TOKEN
    message = (
        "⚠️ <b>5 Savol — rad etish darajasi yuqori</b>\n\n"
        f"Sana: {publish_date.isoformat()} ({theme_label})\n"
        f"Yaratilgan nomzodlar: {gen_count}\n"
        f"Tasdiqlangan: {ver_count}\n"
        f"Rad etish darajasi: {round(rejection_rate * 100)}%\n\n"
        "Bu generatsiya promptida muammo borligini bildiradi, verifikatorda "
        "emas — promptni ko'rib chiqing."
    )
    if not bot_token or not admin_ids:
        logger.critical("daily_quiz high rejection rate (no admin channel configured, logging only): %s", message)
        return
    for chat_id in admin_ids:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
                )
        except Exception:
            logger.error("Failed to page admin %s about daily_quiz high rejection rate", chat_id, exc_info=True)


async def _page_admins_rollover_failed(publish_date: date, reason: str) -> None:
    """Same direct-Telegram-message channel as _page_admins_question_voided
    — a rollover that publishes nothing is exactly the "some days none at
    all" failure mode this whole rework exists to close, so it must alert
    somebody, not just log."""
    from app.core.config import settings

    admin_ids: list[int] = settings.ADMIN_TELEGRAM_IDS or []
    bot_token: str = settings.TELEGRAM_BOT_TOKEN
    message = (
        "🚨 <b>5 Savol — bugun hech narsa e'lon qilinmadi</b>\n\n"
        f"Sana: {publish_date.isoformat()}\n"
        f"Sabab: {reason}\n\n"
        "Admin panelida (/admin/daily-quiz) ko'rib chiqing — savol qo'shish, "
        "qayta yaratish yoki qo'lda e'lon qilish mumkin."
    )
    if not bot_token or not admin_ids:
        logger.critical("daily_quiz rollover failure (no admin channel configured, logging only): %s", message)
        return
    for chat_id in admin_ids:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{bot_token}/sendMessage",
                    json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
                )
        except Exception:
            logger.error("Failed to page admin %s about daily_quiz rollover failure", chat_id, exc_info=True)


async def report_question(db: Session, question_id: int, user_id: int, reason: str) -> dict:
    """Idempotent per (question, user) via UNIQUE constraint — one report
    per user per question. Crossing REPORT_VOID_THRESHOLD auto-voids."""
    try:
        db.execute(
            text("INSERT INTO daily_quiz_reports (question_id, user_id, reason) VALUES (:qid, :uid, :reason)"),
            {"qid": question_id, "uid": user_id, "reason": reason[:500]},
        )
        db.commit()
    except Exception:
        db.rollback()
        return {"ok": True, "already_reported": True}  # not an error — idempotent from the caller's view

    count = db.execute(
        text("""
            UPDATE daily_quiz_questions SET report_count = report_count + 1
            WHERE id = :qid RETURNING report_count, voided
        """),
        {"qid": question_id},
    ).fetchone()
    db.commit()

    if count and not count.voided and count.report_count >= REPORT_VOID_THRESHOLD:
        result = void_question_and_refund(db, question_id)
        logger.warning("daily_quiz question %s auto-voided after %d reports: %s", question_id, count.report_count, result)
        await _page_admins_question_voided(question_id, count.report_count, result)
        return {"ok": True, "auto_voided": True}

    return {"ok": True, "auto_voided": False}


# ═══════════════════════════════════════════════════════════════════════════
# PART 4 — Daily rollover + reminder push (cron)
# ═══════════════════════════════════════════════════════════════════════════

def _window_bounds(publish_date: date) -> tuple[datetime, datetime]:
    start = datetime.combine(publish_date, datetime.min.time()).replace(tzinfo=UTC)
    return start, start + timedelta(days=1)


async def _push_batch(messages: list[dict]) -> tuple[int, int]:
    """Exact same batching idiom as cron.py's send_weekly_reports /
    admin_challenges.py's featured-challenge announcement — Expo's push API,
    100/request, never a per-user asyncio.create_task loop at this scale."""
    sent = failed = 0
    for i in range(0, len(messages), 100):
        batch = messages[i:i + 100]
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    "https://exp.host/--/api/v2/push/send", json=batch,
                    headers={"Content-Type": "application/json", "Accept": "application/json"},
                )
                for r in resp.json().get("data", []):
                    if r.get("status") == "ok":
                        sent += 1
                    else:
                        failed += 1
                        logger.warning("daily_quiz push failed: %s", r)
        except Exception:
            logger.error("daily_quiz push batch error", exc_info=True)
            failed += len(batch)
    return sent, failed


async def _publish_quiz(db: Session, quiz_id: int, quiz_number: int) -> dict:
    """Flips one quiz to 'published' and fires the "tayyor" push batch.
    Shared by rollover() (the daily cron) and publish_now() (an admin
    manual override — for testing, or "we're running late today")."""
    db.execute(
        text("UPDATE daily_quizzes SET status = 'published', published_at = :now WHERE id = :id"),
        {"now": datetime.now(UTC), "id": quiz_id},
    )
    db.commit()

    rows = db.execute(text("""
        SELECT user_settings FROM profiles
        WHERE user_settings->>'expo_push_token' IS NOT NULL
          AND user_settings->>'expo_push_token' != ''
          AND (user_settings->'notification_prefs'->>'daily_quiz' IS NULL
               OR user_settings->'notification_prefs'->>'daily_quiz' = 'true')
    """)).fetchall()

    messages = [{
        "to": r.user_settings.get("expo_push_token"),
        "title": f"5 SAVOL #{quiz_number} tayyor",
        "body": "Bugungi 5 ta savolga javob bering va o'rningizni ko'ring!",
        "data": {"screen": "daily_quiz", "quiz_id": quiz_id},
        "sound": "default",
    } for r in rows if r.user_settings and r.user_settings.get("expo_push_token")]

    sent, failed = await _push_batch(messages)
    return {"sent": sent, "failed": failed}


async def publish_if_ready_today(db: Session, quiz_id: int) -> bool:
    """A day that just BECAME ready — generation/top-up finally reached 5,
    an admin approved a fixed-up 'draft', or a manually-authored question
    completed it — should go live immediately if it's for TODAY. Without
    this, fixing a day after its normal 00:00 UTC rollover window already
    passed would silently wait until TOMORROW's rollover to actually
    publish it (rollover only ever looks at publish_date = today, so a
    day fixed at, say, 03:00 UTC today has already missed today's only
    rollover run). Called from generate_week's per-day loop and from the
    admin approve/add-question endpoints. No-op for any day that isn't
    today, isn't in a publish-eligible status, or is already live."""
    today = datetime.now(UTC).date()
    quiz = db.execute(
        text("SELECT id, quiz_number, publish_date, status FROM daily_quizzes WHERE id = :id"), {"id": quiz_id},
    ).fetchone()
    if quiz is None or quiz.publish_date != today or quiz.status not in ("verified", "approved"):
        return False
    valid_count = db.execute(
        text("SELECT COUNT(*) FROM daily_quiz_questions WHERE quiz_id = :qid AND NOT voided"), {"qid": quiz_id},
    ).scalar()
    if int(valid_count or 0) != QUESTIONS_PER_QUIZ:
        return False
    await _publish_quiz(db, quiz.id, quiz.quiz_number)
    logger.info(
        "daily_quiz publish_if_ready_today: published quiz_number=%s for %s (fixed after its rollover window)",
        quiz.quiz_number, today,
    )
    return True


async def publish_now(db: Session, quiz_id: int) -> dict:
    """Admin-triggered manual publish (POST /api/admin/daily-quiz/{id}/publish-now)
    — requires 'verified' or 'approved' status, same as rollover()'s gate.
    Does NOT touch yesterday's quiz (unlike rollover()) — this is a
    single-quiz override, not a full daily rollover."""
    quiz = db.execute(
        text("SELECT id, quiz_number, publish_date, status FROM daily_quizzes WHERE id = :id"), {"id": quiz_id},
    ).fetchone()
    if quiz is None:
        return {"published": False, "reason": "not_found"}
    if quiz.status not in ("verified", "approved"):
        return {"published": False, "reason": f"status is '{quiz.status}', must be 'verified' or 'approved'"}

    push_result = await _publish_quiz(db, quiz.id, quiz.quiz_number)
    logger.info("daily_quiz publish_now: quiz_number=%s (admin override) %s", quiz.quiz_number, push_result)
    return {"published": True, "quiz_number": quiz.quiz_number, **push_result}


async def rollover(db: Session, today: date) -> dict:
    """Daily 00:00 UTC (spec's two separate 00:00 bullets — 'close the
    previous window' and 'publish' — combined into one job: same trigger
    time, no reason to spend a second cron slot on it; 'keep cron count
    minimal' per spec).

    Auto-publishes a 'verified' day (generation succeeded cleanly, nothing
    for an admin to do) exactly like an explicitly 'approved' one — approval
    is now only ever REQUIRED for a day that generation left in 'draft'.
    A day stuck in 'draft', or genuinely missing, pages the admins instead
    of silently publishing nothing (see _page_admins_rollover_failed)."""
    yesterday = today - timedelta(days=1)
    db.execute(
        text("UPDATE daily_quizzes SET status = 'closed', closed_at = :now WHERE publish_date = :d AND status = 'published'"),
        {"now": datetime.now(UTC), "d": yesterday},
    )
    db.commit()

    quiz = db.execute(
        text("SELECT id, quiz_number, status FROM daily_quizzes WHERE publish_date = :d"), {"d": today},
    ).fetchone()
    if quiz is None or quiz.status not in ("verified", "approved"):
        reason = f"status is '{quiz.status}', needs 'verified' or 'approved'" if quiz else "no daily_quizzes row exists for today"
        logger.error("daily_quiz rollover: %s — nothing published for %s", reason, today)
        await _page_admins_rollover_failed(today, reason)
        return {"published": False, "reason": "no_publishable_quiz", "publish_date": today.isoformat()}

    # Defense in depth: a status of verified/approved reflects state at
    # generation/approval time, not necessarily this exact moment (a
    # pre-publish void could have dropped the count since). Re-check the
    # live count right before actually publishing rather than trust it.
    valid_count = db.execute(
        text("SELECT COUNT(*) FROM daily_quiz_questions WHERE quiz_id = :qid AND NOT voided"),
        {"qid": quiz.id},
    ).scalar()
    if int(valid_count or 0) != QUESTIONS_PER_QUIZ:
        db.execute(text("UPDATE daily_quizzes SET status = 'draft' WHERE id = :id"), {"id": quiz.id})
        db.commit()
        reason = f"quiz_number={quiz.quiz_number} has {valid_count}/{QUESTIONS_PER_QUIZ} valid questions at publish time"
        logger.error("daily_quiz rollover: %s — flipped back to 'draft', nothing published for %s", reason, today)
        await _page_admins_rollover_failed(today, reason)
        return {"published": False, "reason": "question_count_mismatch_at_publish", "publish_date": today.isoformat()}

    push_result = await _publish_quiz(db, quiz.id, quiz.quiz_number)
    sent, failed = push_result["sent"], push_result["failed"]
    logger.info("daily_quiz rollover: published quiz_number=%s sent=%d failed=%d", quiz.quiz_number, sent, failed)
    return {"published": True, "quiz_number": quiz.quiz_number, "sent": sent, "failed": failed}


async def send_reminder_push(db: Session, today: date) -> dict:
    """Daily 12:00 UTC (17:00 Tashkent / 21:00 Seoul) — spec: 'this reminder
    is where most of the retention comes from.'"""
    quiz = db.execute(
        text("SELECT id, quiz_number FROM daily_quizzes WHERE publish_date = :d AND status = 'published'"),
        {"d": today},
    ).fetchone()
    if quiz is None:
        return {"sent": 0, "failed": 0, "reason": "no_published_quiz_today"}

    rows = db.execute(text("""
        SELECT p.user_settings FROM profiles p
        WHERE p.user_settings->>'expo_push_token' IS NOT NULL
          AND p.user_settings->>'expo_push_token' != ''
          AND (p.user_settings->'notification_prefs'->>'daily_quiz' IS NULL
               OR p.user_settings->'notification_prefs'->>'daily_quiz' = 'true')
          AND NOT EXISTS (
              SELECT 1 FROM daily_quiz_attempts a
              WHERE a.quiz_id = :qid AND a.user_id = p.telegram_id AND a.submitted_at IS NOT NULL
          )
    """), {"qid": quiz.id}).fetchall()

    messages = [{
        "to": r.user_settings.get("expo_push_token"),
        "title": "Bugungi 5 Savolni hali o'ynamadingiz!",
        "body": f"5 SAVOL #{quiz.quiz_number} — vaqt tugashidan oldin ulguring.",
        "data": {"screen": "daily_quiz", "quiz_id": quiz.id},
        "sound": "default",
    } for r in rows if r.user_settings and r.user_settings.get("expo_push_token")]

    sent, failed = await _push_batch(messages)
    return {"sent": sent, "failed": failed}
