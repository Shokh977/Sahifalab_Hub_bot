"""
daily_quiz.py — user-facing endpoints for "5 Savol" (5-savol-daily-quiz-spec.md
Part 5). Admin approval-queue endpoints live in admin_daily_quiz.py; cron
triggers live in cron.py.

GET  /api/quiz/today            — today's published quiz, shuffled options,
                                   no correct answers. Starts the server clock.
POST /api/quiz/submit           — answers; server scores, times, grants Tanga.
GET  /api/quiz/results/{quiz_id} — only after window close.
POST /api/quiz/report           — report a question; auto-voids past threshold.
"""
import logging
from datetime import datetime, timedelta, UTC
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services.auth_service import decode_token
from app.services import daily_quiz_service as svc

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


def _window_close(publish_date) -> datetime:
    start = datetime.combine(publish_date, datetime.min.time()).replace(tzinfo=UTC)
    return start + timedelta(days=1)


@router.get("/today")
async def get_today(db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    today = datetime.now(UTC).date()
    quiz = db.execute(
        text("SELECT id, quiz_number, theme, publish_date FROM daily_quizzes WHERE publish_date = :d AND status = 'published'"),
        {"d": today},
    ).fetchone()
    if quiz is None:
        return {"quiz": None}

    delivery = svc.deliver_today(db, caller_id, quiz.id)
    close_at = _window_close(quiz.publish_date)
    seconds_remaining = max(0, int((close_at - datetime.now(UTC)).total_seconds()))

    return {
        "quiz": {
            "id": quiz.id,
            "quiz_number": quiz.quiz_number,
            "theme": quiz.theme,
            "state": "submitted" if delivery["submitted"] else "in_progress",
            "correct_count": delivery["correct_count"],  # only meaningful once submitted
            "seconds_remaining": seconds_remaining,
            "questions": delivery["questions"] if not delivery["submitted"] else [],
        },
    }


class SubmitAnswer(BaseModel):
    question_id: int
    selected_index: int = Field(..., ge=0, le=3)


class SubmitRequest(BaseModel):
    quiz_id: int
    answers: list[SubmitAnswer] = Field(..., min_length=1, max_length=5)


@router.post("/submit")
async def submit(
    body: SubmitRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    try:
        result = svc.score_and_submit(
            db, caller_id, body.quiz_id,
            [{"question_id": a.question_id, "selected_index": a.selected_index} for a in body.answers],
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    # Reward grant is a SEPARATE transaction from scoring (spec Part 4) —
    # score_and_submit() has already committed by the time we get here, so a
    # grant failure can never roll back the recorded answers/score.
    if not result["already_submitted"]:
        try:
            svc.grant_submission_reward(db, caller_id, body.quiz_id, result["tanga_awarded"])
        except Exception:
            logger.error(
                "daily_quiz Tanga grant failed for user_id=%s quiz_id=%s — score is safe, Tanga is not",
                caller_id, body.quiz_id, exc_info=True,
            )

    return result


@router.get("/results/{quiz_id}")
async def get_results(
    quiz_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    quiz = db.execute(
        text("SELECT id, quiz_number, theme, publish_date, status FROM daily_quizzes WHERE id = :id"),
        {"id": quiz_id},
    ).fetchone()
    if quiz is None:
        raise HTTPException(404, "Viktorina topilmadi")

    close_at = _window_close(quiz.publish_date)
    if datetime.now(UTC) < close_at:
        raise HTTPException(425, "Natijalar hali yopilmagan — oyna tugagach ko'rinadi")

    questions = db.execute(
        text("""
            SELECT id, position, question_text, options, correct_index, explanation, source, difficulty, voided
            FROM daily_quiz_questions WHERE quiz_id = :qid ORDER BY position
        """),
        {"qid": quiz_id},
    ).fetchall()

    leaderboard_rows = db.execute(
        text("""
            SELECT user_id, correct_count, elapsed_ms,
                   RANK() OVER (ORDER BY correct_count DESC, elapsed_ms ASC) AS rank,
                   p.first_name, p.username, p.photo_url
            FROM daily_quiz_attempts a
            JOIN profiles p ON p.telegram_id = a.user_id
            WHERE a.quiz_id = :qid AND a.submitted_at IS NOT NULL
            ORDER BY rank LIMIT 20
        """),
        {"qid": quiz_id},
    ).fetchall()

    standing = svc.results_and_percentile(db, quiz_id, caller_id)
    streak_row = db.execute(
        text("SELECT quiz_streak_days FROM profiles WHERE telegram_id = :uid"), {"uid": caller_id},
    ).fetchone()

    return {
        "quiz_streak_days": int(streak_row.quiz_streak_days or 0) if streak_row else 0,
        "quiz": {"id": quiz.id, "quiz_number": quiz.quiz_number, "theme": quiz.theme,
                 "publish_date": quiz.publish_date.isoformat()},
        "questions": [
            {
                "question_id": q.id, "position": q.position, "question_text": q.question_text,
                "options": q.options, "correct_index": q.correct_index,
                "explanation": q.explanation, "source": q.source, "voided": q.voided,
            }
            for q in questions
        ],
        "leaderboard": [
            {"rank": r.rank, "user_id": r.user_id, "first_name": r.first_name,
             "username": r.username, "photo_url": r.photo_url,
             "correct_count": r.correct_count, "elapsed_ms": r.elapsed_ms}
            for r in leaderboard_rows
        ],
        "total_players": standing["total_players"],
        "caller": standing["caller"],
    }


class ReportRequest(BaseModel):
    question_id: int
    reason: str = Field(..., max_length=500)


@router.post("/report")
async def report(
    body: ReportRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    return await svc.report_question(db, body.question_id, caller_id, body.reason)
