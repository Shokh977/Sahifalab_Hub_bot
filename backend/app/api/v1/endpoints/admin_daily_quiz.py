"""
admin_daily_quiz.py — admin approval queue for "5 Savol"
(5-savol-daily-quiz-spec.md Part 1/2/5). Mounted at /api/admin/daily-quiz.
Admin-only (verify_admin, reused from admin.py — same pattern as
admin_challenges.py).

GET    /pending                     — quizzes awaiting approval (draft/verified), with questions
POST   /generate-week                — admin-triggered: generate + verify the next 7 days now
                                        (same pipeline as the Monday 05:00 UTC cron, JWT-gated
                                        instead of cron-secret — so an admin can pull the queue
                                        forward from the dashboard without waiting for Monday)
POST   /{quiz_id}/approve           — approve a day (requires exactly 5 non-voided questions)
POST   /{quiz_id}/reject            — reject a day (never publishes as-is)
POST   /{quiz_id}/regenerate        — ad hoc: re-run generation for one specific day (escape
                                       hatch after a reject, or a short/failed weekly batch day)
PATCH  /questions/{question_id}     — edit a question's text/options/answer/explanation/source
POST   /questions/{question_id}/void — manual void (spec: "manual void") — live, refunds affected users

Nothing publishes unapproved (spec constraint) — rollover() in
daily_quiz_service.py only ever publishes a quiz whose status is
'approved', never 'draft'/'verified'.
"""
import json
import logging
from datetime import date, datetime, UTC
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.v1.endpoints.admin import verify_admin
from app.models.admin_models import AdminUser
from app.services import daily_quiz_service as svc

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/generate-week")
async def generate_week_now(
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Admin-triggered equivalent of the Monday 05:00 UTC cron job. Safe to
    call any time — generate_week() skips any publish_date that already has
    a daily_quizzes row, so this can't duplicate an already-generated day."""
    today = datetime.now(UTC).date()
    result = await svc.generate_week(db, today)
    logger.info("daily_quiz generate-week triggered by admin telegram_id=%s: %s", admin.telegram_id, result)
    return {"ok": True, **result}


@router.get("/pending")
async def list_pending(db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin)):
    quizzes = db.execute(
        text("""
            SELECT id, quiz_number, publish_date, theme, status, created_at
            FROM daily_quizzes WHERE status IN ('draft', 'verified')
            ORDER BY publish_date
        """),
    ).fetchall()

    result = []
    for qz in quizzes:
        questions = db.execute(
            text("""
                SELECT id, position, question_text, options, correct_index,
                       explanation, source, difficulty, verified, verify_model_answer
                FROM daily_quiz_questions WHERE quiz_id = :qid ORDER BY position
            """),
            {"qid": qz.id},
        ).fetchall()
        result.append({
            "id": qz.id, "quiz_number": qz.quiz_number, "publish_date": qz.publish_date.isoformat(),
            "theme": qz.theme, "status": qz.status, "created_at": qz.created_at.isoformat(),
            "question_count": len(questions),
            "questions": [
                {
                    "id": q.id, "position": q.position, "question_text": q.question_text,
                    "options": q.options, "correct_index": q.correct_index, "explanation": q.explanation,
                    "source": q.source, "difficulty": q.difficulty, "verified": q.verified,
                    "verify_model_answer": q.verify_model_answer,
                }
                for q in questions
            ],
        })
    return {"quizzes": result}


@router.post("/{quiz_id}/approve")
async def approve_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    quiz = db.execute(text("SELECT id, status FROM daily_quizzes WHERE id = :id"), {"id": quiz_id}).fetchone()
    if quiz is None:
        raise HTTPException(404, "Quiz not found")
    if quiz.status not in ("draft", "verified"):
        raise HTTPException(400, f"Cannot approve a quiz in status '{quiz.status}'")

    count = db.execute(
        text("SELECT COUNT(*) FROM daily_quiz_questions WHERE quiz_id = :qid AND NOT voided"),
        {"qid": quiz_id},
    ).scalar()
    if int(count or 0) != svc.QUESTIONS_PER_QUIZ:
        raise HTTPException(400, f"Quiz has {count} questions, needs exactly {svc.QUESTIONS_PER_QUIZ} to approve")

    db.execute(
        text("UPDATE daily_quizzes SET status = 'approved', approved_at = :now, approved_by = :uid WHERE id = :id"),
        {"now": datetime.now(UTC), "uid": admin.telegram_id, "id": quiz_id},
    )
    db.commit()
    return {"ok": True, "status": "approved"}


@router.post("/{quiz_id}/reject")
async def reject_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    quiz = db.execute(text("SELECT id, status FROM daily_quizzes WHERE id = :id"), {"id": quiz_id}).fetchone()
    if quiz is None:
        raise HTTPException(404, "Quiz not found")
    if quiz.status in ("published", "closed"):
        raise HTTPException(400, "Cannot reject a quiz that's already live — void individual questions instead")

    db.execute(text("UPDATE daily_quizzes SET status = 'voided' WHERE id = :id"), {"id": quiz_id})
    db.commit()
    return {"ok": True, "status": "voided"}


@router.post("/{quiz_id}/regenerate")
async def regenerate_quiz(
    quiz_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Escape hatch: re-run the generation pipeline for ONE specific day
    (after a reject, or a weekly batch day that came up short). Deletes the
    old draft rows for that day first — never touches an already-approved
    or published quiz."""
    quiz = db.execute(text("SELECT id, publish_date, status FROM daily_quizzes WHERE id = :id"), {"id": quiz_id}).fetchone()
    if quiz is None:
        raise HTTPException(404, "Quiz not found")
    if quiz.status in ("approved", "published", "closed"):
        raise HTTPException(400, f"Refusing to regenerate a '{quiz.status}' quiz")

    db.execute(text("DELETE FROM daily_quizzes WHERE id = :id"), {"id": quiz_id})
    db.commit()
    result = await svc.generate_week(db, quiz.publish_date, days_ahead=1)
    return {"ok": True, "result": result}


class QuestionEdit(BaseModel):
    question_text: Optional[str] = None
    options:        Optional[list[str]] = Field(None, min_length=4, max_length=4)
    correct_index:  Optional[int] = Field(None, ge=0, le=3)
    explanation:    Optional[str] = None
    source:         Optional[str] = None
    difficulty:     Optional[str] = None


@router.patch("/questions/{question_id}")
async def edit_question(
    question_id: int,
    body: QuestionEdit,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    q = db.execute(
        text("""
            SELECT dq.status FROM daily_quiz_questions q
            JOIN daily_quizzes dq ON dq.id = q.quiz_id
            WHERE q.id = :id
        """),
        {"id": question_id},
    ).fetchone()
    if q is None:
        raise HTTPException(404, "Question not found")
    if q.status in ("published", "closed"):
        raise HTTPException(400, "Cannot edit a question on a live quiz — void it instead")

    if body.difficulty is not None and body.difficulty not in ("easy", "medium", "hard"):
        raise HTTPException(422, "difficulty must be easy|medium|hard")

    fields = body.model_dump(exclude_none=True)
    if not fields:
        return {"ok": True, "changed": False}

    set_clauses = []
    params: dict = {"id": question_id}
    for key, value in fields.items():
        if key == "options":
            set_clauses.append("options = CAST(:options AS jsonb)")
            params["options"] = json.dumps(value)
        else:
            set_clauses.append(f"{key} = :{key}")
            params[key] = value

    db.execute(text(f"UPDATE daily_quiz_questions SET {', '.join(set_clauses)} WHERE id = :id"), params)
    db.commit()
    return {"ok": True, "changed": True}


@router.post("/questions/{question_id}/void")
async def void_question(
    question_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    result = svc.void_question_and_refund(db, question_id)
    if not result.get("ok"):
        raise HTTPException(400, result.get("reason", "void failed"))
    return result
