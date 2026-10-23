"""
admin_question_submissions.py — the admin side of "Siz ham savol yuboring"
(105_question_submissions.sql). Mounted at /api/admin. verify_admin, like
every other admin router; the Telegram bot calls the same endpoints with
"Authorization: Bot <secret>" and names the acting admin in X-Acting-Admin,
which goes into the swap audit log.

View A — the queue
GET   /question-submissions?status=pending_review  — sorted where attention is
                                   needed: cold-answer disagreements, then
                                   unverifiable/low confidence, then the rest
GET   /question-submissions/{id}
POST  /question-submissions/{id}/approve   — optional edits (text, options,
                                   answer, explanation, category, difficulty)
POST  /question-submissions/{id}/reject    — internal reason, never shown/pushed
PATCH /question-submissions/{id}           — category / difficulty / concept_tag
POST  /question-submissions/{id}/rereview  — run the AI review again

View B — the schedule (GET /api/admin/daily-quiz/week carries origin and
submitter per question) and the swap:
POST  /quiz/{quiz_id}/swap       {position, submission_id}
POST  /quiz/{quiz_id}/unswap     {position}
POST  /quiz/{quiz_id}/rebalance  — one-tap fix for a broken difficulty mix
GET   /quiz/{quiz_id}/swap-log
"""
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.v1.endpoints.admin import verify_admin
from app.db.session import get_db
from app.models.admin_models import AdminUser
from app.services import question_submission_service as svc

logger = logging.getLogger(__name__)
router = APIRouter()


def _actor(admin: AdminUser, acting: Optional[str]) -> tuple[Optional[int], str]:
    """(admin telegram_id for the audit log, 'web' | 'bot')."""
    if admin.role == "bot":
        try:
            return (int(acting) if acting else None), "bot"
        except ValueError:
            return None, "bot"
    return admin.telegram_id, "web"


def _raise(e: svc.SubmissionError):
    raise HTTPException(e.status, {"code": e.code, "message": e.message})


@router.get("/question-submissions")
def list_submissions(
    status: str = svc.PENDING,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    counts = db.execute(
        text("SELECT status, COUNT(*) AS n FROM question_submissions GROUP BY status"),
    ).fetchall()
    return {
        "items": svc.admin_list(db, status, min(max(limit, 1), 300)),
        "counts": {r.status: int(r.n) for r in counts},
        "config": svc.get_settings(db),
    }


@router.get("/question-submissions/{submission_id}")
def get_submission(submission_id: int, db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin)):
    item = svc.admin_get(db, submission_id)
    if item is None:
        raise HTTPException(404, "Savol topilmadi")
    return item


class ApproveBody(BaseModel):
    question_text: Optional[str] = Field(None, max_length=2000)
    options: Optional[list[str]] = Field(None, min_length=4, max_length=4)
    correct_index: Optional[int] = Field(None, ge=0, le=3)
    explanation: Optional[str] = Field(None, max_length=2000)
    category: Optional[str] = None
    difficulty: Optional[str] = None
    concept_tag: Optional[str] = None


@router.post("/question-submissions/{submission_id}/approve")
def approve(
    submission_id: int,
    body: Optional[ApproveBody] = None,
    x_acting_admin: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    actor, _ = _actor(admin, x_acting_admin)
    try:
        return svc.approve(db, submission_id, actor, (body.model_dump(exclude_none=True) if body else {}))
    except svc.SubmissionError as e:
        _raise(e)


class RejectBody(BaseModel):
    reason: str = Field("", max_length=500)


@router.post("/question-submissions/{submission_id}/reject")
def reject(
    submission_id: int,
    body: Optional[RejectBody] = None,
    x_acting_admin: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    actor, _ = _actor(admin, x_acting_admin)
    try:
        return svc.reject(db, submission_id, actor, body.reason if body else "")
    except svc.SubmissionError as e:
        _raise(e)


class MetaBody(BaseModel):
    category: Optional[str] = None
    difficulty: Optional[str] = None
    concept_tag: Optional[str] = None


@router.patch("/question-submissions/{submission_id}")
def update_meta(
    submission_id: int, body: MetaBody, db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin),
):
    try:
        return svc.update_meta(db, submission_id, body.model_dump(exclude_none=True))
    except svc.SubmissionError as e:
        _raise(e)


@router.post("/question-submissions/{submission_id}/rereview")
async def rereview(submission_id: int, db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin)):
    """Clears the stored review of a pending submission and runs it again —
    after a prompt fix, or when the first review errored."""
    row = db.execute(
        text("""
            UPDATE question_submissions
            SET ai_reviewed_at = NULL, ai_review_attempts = 0, ai_verdict = NULL, ai_confidence = NULL, updated_at = NOW()
            WHERE id = :id AND status IN ('pending_review', 'duplicate')
            RETURNING id
        """),
        {"id": submission_id},
    ).fetchone()
    if row is not None:
        db.execute(text("UPDATE question_submissions SET status = 'pending_review' WHERE id = :id"), {"id": submission_id})
    db.commit()
    if row is None:
        raise HTTPException(409, {"code": "bad_status", "message": "Faqat koʻrib chiqilayotgan savolni qayta tekshirish mumkin"})
    await svc.review_submission(db, submission_id)
    return svc.admin_get(db, submission_id)


class SwapBody(BaseModel):
    position: int = Field(..., ge=0, le=4)
    submission_id: int


@router.post("/quiz/{quiz_id}/swap")
def swap(
    quiz_id: int,
    body: SwapBody,
    x_acting_admin: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    actor, via = _actor(admin, x_acting_admin)
    try:
        return svc.swap(db, quiz_id, body.position, body.submission_id, actor, via)
    except svc.SubmissionError as e:
        _raise(e)


class UnswapBody(BaseModel):
    position: int = Field(..., ge=0, le=4)


@router.post("/quiz/{quiz_id}/unswap")
def unswap(
    quiz_id: int,
    body: UnswapBody,
    x_acting_admin: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    actor, via = _actor(admin, x_acting_admin)
    try:
        return svc.unswap(db, quiz_id, body.position, actor, via)
    except svc.SubmissionError as e:
        _raise(e)


@router.post("/quiz/{quiz_id}/rebalance")
def rebalance(
    quiz_id: int,
    x_acting_admin: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    actor, via = _actor(admin, x_acting_admin)
    try:
        return svc.rebalance(db, quiz_id, actor, via)
    except svc.SubmissionError as e:
        _raise(e)


@router.get("/quiz/{quiz_id}/swap-log")
def swap_log(quiz_id: int, db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin)):
    rows = db.execute(
        text("""
            SELECT id, action, admin_id, via, position, question_in, question_out, submission_id,
                   pool_in_id, pool_out_id, created_at
            FROM daily_quiz_swap_log WHERE quiz_id = :qid ORDER BY created_at DESC LIMIT 100
        """),
        {"qid": quiz_id},
    ).fetchall()
    return {"items": [
        {
            "id": int(r.id), "action": r.action, "admin_id": r.admin_id, "via": r.via, "position": r.position,
            "question_in": r.question_in, "question_out": r.question_out, "submission_id": r.submission_id,
            "pool_in_id": r.pool_in_id, "pool_out_id": r.pool_out_id, "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]}


@router.get("/quiz/by-date/{publish_date}")
def quiz_by_date(publish_date: str, db: Session = Depends(get_db), admin: AdminUser = Depends(verify_admin)):
    """For the bot's /swapquestion <quiz_date> ...: the quiz id of a day."""
    row = db.execute(
        text("SELECT id, quiz_number, status FROM daily_quizzes WHERE publish_date = CAST(:d AS date)"), {"d": publish_date},
    ).fetchone()
    if row is None:
        raise HTTPException(404, {"code": "quiz_not_found", "message": "Bu sanada viktorina yoʻq"})
    return {"id": int(row.id), "quiz_number": row.quiz_number, "status": row.status}
