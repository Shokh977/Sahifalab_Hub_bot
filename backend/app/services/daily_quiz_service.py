"""
daily_quiz_service.py — "5 Savol", the daily AI quiz (5-savol-daily-quiz-spec.md).

Five questions a day, the same five for every user worldwide, released
00:00 UTC, hard-expiring at the next 00:00 UTC. This module owns:

  - generate_week()      — weekly batch: 10 candidates/day -> cold
                            verification -> best-5 selection -> draft rows
                            for admin review. Never same-day (a live
                            generation failure must never become a live
                            outage — the week is always generated ahead).
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
  - rollover()            — daily 00:00 UTC: close yesterday, publish today
                            (if approved), push "tayyor" notification.
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
from app.services.ai.prompts import daily_quiz_gen_v1, daily_quiz_verify_v1
from app.services.tanga_service import grant_tanga

logger = logging.getLogger(__name__)

# ── Reward table (spec Part 4 — Tanga only, never XP) ───────────────────────
PLAYED_REWARD = 5
PER_CORRECT_REWARD = 1
PERFECT_BONUS = 3
MAX_DAILY_REWARD = 13  # = 5 + 5*1 + 3 — the mathematical ceiling, asserted not enforced separately

QUESTIONS_PER_QUIZ = 5
DIFFICULTY_TARGET = {"easy": 2, "medium": 2, "hard": 1}

REPORT_VOID_THRESHOLD = 5  # reports on one question before it's auto-voided


# ═══════════════════════════════════════════════════════════════════════════
# PART 1 — Generation pipeline
# ═══════════════════════════════════════════════════════════════════════════

async def _generate_candidates(db: Session, weekday: int) -> list[dict]:
    """One generation call -> up to 10 raw candidate questions for that
    weekday's theme. Returns [] on any failure (logged) — caller treats an
    empty candidate list as "this day needs attention," never as a crash."""
    provider = get_provider()
    theme_key, _, _ = daily_quiz_gen_v1.THEMES[weekday]
    try:
        response = await provider.generate_json(
            system_prompt=daily_quiz_gen_v1.SYSTEM_PROMPT,
            user_prompt=daily_quiz_gen_v1.build_user_prompt(weekday),
            prompt_version=daily_quiz_gen_v1.VERSION,
            json_schema=daily_quiz_gen_v1.JSON_SCHEMA,
            temperature=0.2,  # low temperature (spec) — consistency over creativity
        )
    except AiProviderError as e:
        log_usage(db, user_id=None, feature="daily_quiz_gen", model="gemini-flash-lite-latest",
                  prompt_version=daily_quiz_gen_v1.VERSION, outcome=e.outcome, error_detail=str(e))
        logger.error("daily_quiz generation call failed for theme=%s", theme_key, exc_info=True)
        return []

    log_usage(db, user_id=None, feature="daily_quiz_gen", model=response.model,
              prompt_version=daily_quiz_gen_v1.VERSION, input_tokens=response.input_tokens,
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


async def generate_week(db: Session, start_date: date, days_ahead: int = 7) -> dict:
    """
    Called weekly (spec: 'runs weekly, generating 7 days ahead'). Skips any
    publish_date that already has a daily_quizzes row — safe to re-run.
    """
    created = []
    skipped = []
    for i in range(days_ahead):
        publish_date = start_date + timedelta(days=i)
        existing = db.execute(
            text("SELECT 1 FROM daily_quizzes WHERE publish_date = :d"), {"d": publish_date},
        ).fetchone()
        if existing:
            skipped.append(publish_date.isoformat())
            continue

        weekday = publish_date.weekday()
        theme_key, theme_label, _ = daily_quiz_gen_v1.THEMES[weekday]

        candidates = await _generate_candidates(db, weekday)
        for c in candidates:
            c["verified"] = await _verify_candidate(db, c)

        selected, warnings = select_five(candidates)
        status = "verified" if len(selected) == QUESTIONS_PER_QUIZ and not warnings else "draft"

        quiz_number = _next_quiz_number(db)
        quiz_row = db.execute(
            text("""
                INSERT INTO daily_quizzes (quiz_number, publish_date, theme, status)
                VALUES (:num, :d, :theme, :status)
                RETURNING id
            """),
            {"num": quiz_number, "d": publish_date, "theme": theme_key, "status": status},
        ).fetchone()
        quiz_id = int(quiz_row.id)

        for position, q in enumerate(selected):
            db.execute(
                text("""
                    INSERT INTO daily_quiz_questions
                        (quiz_id, position, question_text, options, correct_index,
                         explanation, source, difficulty, verified, verify_model_answer)
                    VALUES
                        (:qid, :pos, :qtext, CAST(:opts AS jsonb), :cidx,
                         :expl, :src, :diff, :verified, :vma)
                """),
                {
                    "qid": quiz_id, "pos": position, "qtext": q["question_text"],
                    "opts": json.dumps(q["options"]), "cidx": q["correct_index"],
                    "expl": q["explanation"], "src": q["source"], "diff": q["difficulty"],
                    "verified": True, "vma": q.get("verify_model_answer"),
                },
            )
        db.commit()

        if warnings:
            logger.error(
                "daily_quiz %s (#%s, %s) generated SHORT — %s. Only %d/%d questions; status='draft', needs admin attention.",
                publish_date, quiz_number, theme_label, "; ".join(warnings), len(selected), QUESTIONS_PER_QUIZ,
            )
        created.append({"publish_date": publish_date.isoformat(), "quiz_number": quiz_number,
                         "theme": theme_key, "status": status, "question_count": len(selected)})

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

    total_valid = len(questions)
    tanga = PLAYED_REWARD + correct_count * PER_CORRECT_REWARD
    if total_valid > 0 and correct_count == total_valid:
        tanga += PERFECT_BONUS
    tanga = min(tanga, MAX_DAILY_REWARD)  # defensive ceiling, see module docstring

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
    committed. Idempotent on (user, quiz) so a retry can never double-grant."""
    if tanga <= 0:
        return
    grant_tanga(
        db, user_id=user_id, amount=tanga, reason="daily_quiz",
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
            db, user_id=a.user_id, amount=PER_CORRECT_REWARD, reason="daily_quiz_void_refund",
            reference_type="daily_quiz_question", reference_id=question_id,
            idempotency_key=f"daily_quiz_void:{a.user_id}:{question_id}",
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


async def publish_now(db: Session, quiz_id: int) -> dict:
    """Admin-triggered manual publish (POST /api/admin/daily-quiz/{id}/publish-now)
    — requires 'approved' status, same constraint as the cron path. Does
    NOT touch yesterday's quiz (unlike rollover()) — this is a single-quiz
    override, not a full daily rollover."""
    quiz = db.execute(
        text("SELECT id, quiz_number, publish_date, status FROM daily_quizzes WHERE id = :id"), {"id": quiz_id},
    ).fetchone()
    if quiz is None:
        return {"published": False, "reason": "not_found"}
    if quiz.status != "approved":
        return {"published": False, "reason": f"status is '{quiz.status}', must be 'approved'"}

    push_result = await _publish_quiz(db, quiz.id, quiz.quiz_number)
    logger.info("daily_quiz publish_now: quiz_number=%s (admin override) %s", quiz.quiz_number, push_result)
    return {"published": True, "quiz_number": quiz.quiz_number, **push_result}


async def rollover(db: Session, today: date) -> dict:
    """Daily 00:00 UTC (spec's two separate 00:00 bullets — 'close the
    previous window' and 'publish' — combined into one job: same trigger
    time, no reason to spend a second cron slot on it; 'keep cron count
    minimal' per spec)."""
    yesterday = today - timedelta(days=1)
    db.execute(
        text("UPDATE daily_quizzes SET status = 'closed', closed_at = :now WHERE publish_date = :d AND status = 'published'"),
        {"now": datetime.now(UTC), "d": yesterday},
    )
    db.commit()

    quiz = db.execute(
        text("SELECT id, quiz_number, status FROM daily_quizzes WHERE publish_date = :d"), {"d": today},
    ).fetchone()
    if quiz is None or quiz.status != "approved":
        logger.error(
            "daily_quiz rollover: no APPROVED quiz for %s (found status=%s) — nothing published today",
            today, quiz.status if quiz else None,
        )
        return {"published": False, "reason": "no_approved_quiz", "publish_date": today.isoformat()}

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
