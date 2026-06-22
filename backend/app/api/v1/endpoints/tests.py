"""
tests.py — Course lesson quiz system.

PUT  /api/tests/{lesson_id}/questions  — upsert quiz data for a lesson (admin/teacher)
GET  /api/tests/{lesson_id}            — get quiz metadata (admin)
POST /api/tests/{lesson_id}/attempts   — start a test attempt (student)
POST /api/tests/{test_id}/attempts/{attempt_id}/submit — submit answers (student)
"""

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.models import LessonQuiz, LessonQuizAttempt
from app.services.auth_service import decode_token
from app.services.xp_service import add_xp

router = APIRouter()

LESSON_QUIZ_XP = 20   # XP awarded for passing a lesson quiz


# ── Auth ──────────────────────────────────────────────────────────────────────

async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    if not authorization:
        raise HTTPException(401, "Avtorizatsiya talab qilinadi")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(401, "Noto'g'ri token formati")
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(401, "Token muddati tugagan")
    return tid


# ── Schemas ───────────────────────────────────────────────────────────────────

class QuizOptionIn(BaseModel):
    id:         str
    text:       str
    is_correct: bool


class QuizQuestionIn(BaseModel):
    id:          str
    text:        str
    explanation: str = ""
    options:     List[QuizOptionIn]
    type:        str = "single"   # 'single' | 'multiple'


class UpsertQuizBody(BaseModel):
    title:          str = "Test"
    questions:      List[QuizQuestionIn]
    time_limit_min: Optional[int] = None
    passing_score:  int = 70
    is_final:       bool = False


class SubmitAnswerIn(BaseModel):
    question_id:        int
    selected_option_id: Optional[int] = None
    text:               Optional[str] = None


class SubmitBody(BaseModel):
    answers: List[SubmitAnswerIn]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _questions_to_public(raw_questions: list, attempt_id: int) -> list:
    """Strip correct answers from questions before sending to student."""
    out = []
    for idx, q in enumerate(raw_questions):
        options = [
            {"id": i + 1, "text": opt["text"]}
            for i, opt in enumerate(q.get("options", []))
        ]
        qtype = q.get("type", "single")
        out.append({
            "id":            idx + 1,
            "question_text": q.get("text", ""),
            "question_image": None,
            "question_type": "multiple_choice" if qtype == "multiple" else "single_choice",
            "options":       options,
            "order_index":   idx,
        })
    return out


def _score_attempt(quiz: LessonQuiz, answers: list) -> dict:
    """Score answers against correct options. Returns scoring result dict."""
    questions = quiz.questions or []
    correct_count = 0

    answered_questions = []
    for idx, q in enumerate(questions):
        q_id = idx + 1
        options = q.get("options", [])
        correct_indices = [i + 1 for i, opt in enumerate(options) if opt.get("is_correct")]

        user_ans = next((a for a in answers if a.get("question_id") == q_id), None)
        user_option_id = user_ans.get("selected_option_id") if user_ans else None

        is_correct = user_option_id in correct_indices if user_option_id else False
        if is_correct:
            correct_count += 1

        # Text for display
        user_text = ""
        correct_text = ""
        if user_option_id and 1 <= user_option_id <= len(options):
            user_text = options[user_option_id - 1].get("text", "")
        first_correct = correct_indices[0] if correct_indices else None
        if first_correct and 1 <= first_correct <= len(options):
            correct_text = options[first_correct - 1].get("text", "")

        answered_questions.append({
            "id":             q_id,
            "question_text":  q.get("text", ""),
            "user_answer":    user_text or (user_ans.get("text") if user_ans else "") or "Javob berilmagan",
            "correct":        is_correct,
            "correct_answer": correct_text,
            "explanation":    q.get("explanation", "") or None,
        })

    total = len(questions)
    score_pct = (correct_count / total * 100) if total > 0 else 0
    passed = score_pct >= quiz.passing_score

    return {
        "score_pct":          round(score_pct, 1),
        "passed":             passed,
        "correct_count":      correct_count,
        "wrong_count":        total - correct_count,
        "total_questions":    total,
        "show_answers":       True,
        "is_final":           quiz.is_final,
        "answered_questions": answered_questions,
    }


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.put("/{lesson_id}/questions")
async def upsert_quiz(
    lesson_id: int,
    body:      UpsertQuizBody,
    db:        Session = Depends(get_db),
    telegram_id: int   = Depends(_require_token),
):
    """Save or update quiz questions for a lesson. Called by the admin panel."""
    quiz = db.query(LessonQuiz).filter(LessonQuiz.lesson_id == lesson_id).first()
    if quiz:
        quiz.title          = body.title
        quiz.questions      = [q.model_dump() for q in body.questions]
        quiz.time_limit_min = body.time_limit_min
        quiz.passing_score  = body.passing_score
        quiz.is_final       = body.is_final
        quiz.updated_at     = datetime.utcnow()
    else:
        quiz = LessonQuiz(
            lesson_id      = lesson_id,
            title          = body.title,
            questions      = [q.model_dump() for q in body.questions],
            time_limit_min = body.time_limit_min,
            passing_score  = body.passing_score,
            is_final       = body.is_final,
        )
        db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return {"id": quiz.id, "lesson_id": quiz.lesson_id, "question_count": len(quiz.questions or [])}


@router.get("/{lesson_id}")
async def get_quiz_meta(
    lesson_id:   int,
    db:          Session = Depends(get_db),
    telegram_id: int     = Depends(_require_token),
):
    """Return quiz metadata + questions (with correct answers) for admin."""
    quiz = db.query(LessonQuiz).filter(LessonQuiz.lesson_id == lesson_id).first()
    if not quiz:
        raise HTTPException(404, "Test topilmadi")
    return {
        "lesson_id":      quiz.lesson_id,
        "title":          quiz.title,
        "questions":      quiz.questions,
        "time_limit_min": quiz.time_limit_min,
        "passing_score":  quiz.passing_score,
        "is_final":       quiz.is_final,
    }


@router.post("/{lesson_id}/attempts")
async def start_attempt(
    lesson_id:   int,
    db:          Session = Depends(get_db),
    telegram_id: int     = Depends(_require_token),
):
    """Start a test attempt. Returns attempt_id + shuffled questions (no answers)."""
    quiz = db.query(LessonQuiz).filter(LessonQuiz.lesson_id == lesson_id).first()
    if not quiz or not quiz.questions:
        raise HTTPException(404, "Test topilmadi yoki savollar yo'q")

    attempt = LessonQuizAttempt(
        lesson_id   = lesson_id,
        telegram_id = telegram_id,
        started_at  = datetime.utcnow(),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return {
        "attempt_id":     attempt.id,
        "test_id":        lesson_id,
        "title":          quiz.title,
        "time_limit_min": quiz.time_limit_min,
        "passing_score":  quiz.passing_score,
        "is_final":       quiz.is_final,
        "questions":      _questions_to_public(quiz.questions, attempt.id),
    }


@router.post("/{test_id}/attempts/{attempt_id}/submit")
async def submit_attempt(
    test_id:     int,
    attempt_id:  int,
    body:        SubmitBody,
    db:          Session = Depends(get_db),
    telegram_id: int     = Depends(_require_token),
):
    """Submit answers and get results."""
    attempt = db.query(LessonQuizAttempt).filter(
        LessonQuizAttempt.id          == attempt_id,
        LessonQuizAttempt.telegram_id == telegram_id,
        LessonQuizAttempt.lesson_id   == test_id,
    ).first()
    if not attempt:
        raise HTTPException(404, "Urinish topilmadi")
    if attempt.submitted_at is not None:
        raise HTTPException(409, "Bu urinish allaqachon yuborilgan")

    quiz = db.query(LessonQuiz).filter(LessonQuiz.lesson_id == test_id).first()
    if not quiz:
        raise HTTPException(404, "Test topilmadi")

    answers_raw = [a.model_dump() for a in body.answers]
    result = _score_attempt(quiz, answers_raw)

    elapsed = int((datetime.utcnow() - attempt.started_at).total_seconds())

    attempt.submitted_at = datetime.utcnow()
    attempt.answers      = answers_raw
    attempt.score_pct    = result["score_pct"]
    attempt.passed       = result["passed"]

    xp = 0
    if result["passed"]:
        try:
            xp_result = add_xp(db, telegram_id, "QUIZ", LESSON_QUIZ_XP)
            xp = xp_result.get("xp_added", 0)
        except Exception:
            pass

    attempt.xp_awarded = xp
    db.commit()

    return {
        **result,
        "elapsed_seconds":    elapsed,
        "xp_awarded":         xp,
        "certificate_issued": False,
        "certificate_code":   None,
    }
