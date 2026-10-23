"""
questions.py — "Siz ham savol yuboring": users submit their own 5 Savol
questions (105_question_submissions.sql). Mounted at /api/questions.

GET  /limits              — what the form shows: "Bugun yana 2 ta yubora olasiz",
                             pending count, AI-assist uses left, the reward.
POST /submit              — a complete question (text, 4 options, the right one).
                             Validated and limited server-side; the AI review runs
                             in the background and only advises the admin.
POST /assist-distractors  — three editable wrong options for the user's question
                             and correct answer. Own, smaller daily cap.
GET  /mine                — the user's submissions with their status label. A
                             rejection reason is never exposed.

Server-authoritative: the client never sets status, eligibility, scheduling
or reward. Daily buckets come from the database clock, never a client date.
"""
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.v1.endpoints.daily_quiz import _require_token
from app.db.session import get_db
from app.services import question_submission_service as svc

logger = logging.getLogger(__name__)
router = APIRouter()


def _raise(e: svc.SubmissionError):
    raise HTTPException(e.status, {"code": e.code, "message": e.message})


@router.get("/limits")
def get_limits(db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    return svc.limits(db, caller_id)


class SubmitBody(BaseModel):
    # Loose on purpose: the service cleans first, then validates with Uzbek
    # messages the form can show; Pydantic only guards the shapes/sizes.
    question_text: str = Field(..., max_length=2000)
    options: list[str] = Field(..., max_length=10)
    correct_index: int
    explanation: str | None = Field(None, max_length=2000)
    source_note: str | None = Field(None, max_length=2000)
    is_anonymous: bool = False
    used_ai_assist: bool = False


@router.post("/submit")
def submit(
    body: SubmitBody,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    try:
        result = svc.submit(db, caller_id, body.model_dump())
    except svc.SubmissionError as e:
        _raise(e)
    # After the row is committed. If this never runs (process restart), the
    # cron sweep reviews the row within minutes.
    background.add_task(svc.review_in_background, result["id"])
    return result


class AssistBody(BaseModel):
    question_text: str = Field(..., max_length=2000)
    correct_answer: str = Field(..., max_length=500)


@router.post("/assist-distractors")
async def assist_distractors(
    body: AssistBody,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    try:
        distractors = await svc.assist_distractors(db, caller_id, body.question_text, body.correct_answer)
    except svc.SubmissionError as e:
        _raise(e)
    return {"distractors": distractors, "assist_remaining": svc.limits(db, caller_id)["assist_remaining"]}


@router.get("/mine")
def mine(db: Session = Depends(get_db), caller_id: int = Depends(_require_token)):
    return {"submissions": svc.my_submissions(db, caller_id)}
