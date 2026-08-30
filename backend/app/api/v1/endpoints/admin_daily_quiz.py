"""
admin_daily_quiz.py — admin control panel for "5 Savol"
(5-savol-daily-quiz-spec.md Part 1/2/5, reworked for auto-publish — see
migrations/094_daily_quiz_auto_publish.sql). Mounted at /api/admin/daily-quiz.
Admin-only (verify_admin, reused from admin.py — same pattern as
admin_challenges.py).

GET    /week                        — full rolling-week view: every calendar day from today
                                       through days_ahead, INCLUDING days with no row yet at
                                       all ("missing"), each with its full question list —
                                       the previous /pending endpoint only ever showed days
                                       that already existed, so a day nobody had generated yet
                                       was invisible until someone clicked generate.
POST   /generate-week                — admin-triggered top-up: same pipeline as the daily cron
                                        (JWT-gated instead of cron-secret) — generates any
                                        missing day and tops up any day still stuck in 'draft'
POST   /{quiz_id}/approve           — approve a day (requires exactly 5 non-voided questions).
                                       Only ever needed for a 'draft' day — a cleanly generated
                                       'verified' day auto-publishes on its own on schedule.
POST   /{quiz_id}/reject            — reject a day (never publishes as-is)
POST   /{quiz_id}/regenerate        — ad hoc: re-run generation for one specific day (escape
                                       hatch after a reject, or a day still short after retries)
POST   /{quiz_id}/questions         — manually author a question at the next open slot (escape
                                       hatch when generation still can't reach 5, or an admin
                                       just wants to replace AI content with their own)
PATCH  /questions/{question_id}     — edit a question's text/options/answer/explanation/source
DELETE /questions/{question_id}     — remove a question outright (pre-publish only — use void
                                       instead for a live quiz, which needs refund/scoring logic)
POST   /questions/{question_id}/void — manual void (spec: "manual void") — live, refunds affected users

Nothing publishes without either a clean 'verified' generation or an
explicit admin 'approved' — rollover() in daily_quiz_service.py never
publishes a 'draft' quiz, whichever state it's in.
"""
import json
import logging
from datetime import date, datetime, timedelta, UTC
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
    """Admin-triggered equivalent of the daily generation cron. Safe to call
    any time — generate_week() leaves any day that's already 'verified' or
    further along completely untouched, and tops up (rather than skips) a
    day still stuck in 'draft'."""
    today = datetime.now(UTC).date()
    result = await svc.generate_week(db, today)
    logger.info("daily_quiz generate-week triggered by admin telegram_id=%s: %s", admin.telegram_id, result)
    return {"ok": True, **result}


def _question_dict(q) -> dict:
    return {
        "id": q.id, "position": q.position, "question_text": q.question_text,
        "options": q.options, "correct_index": q.correct_index, "explanation": q.explanation,
        "source": q.source, "difficulty": q.difficulty, "verified": q.verified,
        "verify_model_answer": q.verify_model_answer, "voided": q.voided,
        # No verify_model_answer means this question never went through the
        # AI cold-check — the natural signal that it was manually authored
        # via POST /{quiz_id}/questions rather than generated.
        "manually_authored": q.verify_model_answer is None,
    }


@router.get("/week")
async def week_overview(
    days_ahead: int = 10,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Every calendar day from today through days_ahead, whether or not it
    has a daily_quizzes row yet, each with its full question list — gives
    the dashboard visibility into gaps (a day nobody's generated at all)
    that the old draft/verified/approved-only /pending list couldn't show."""
    today = datetime.now(UTC).date()
    rows = db.execute(
        text("""
            SELECT id, quiz_number, publish_date, theme, status, notes, created_at,
                   approved_at, published_at
            FROM daily_quizzes
            WHERE publish_date BETWEEN :start AND :end
            ORDER BY publish_date
        """),
        {"start": today, "end": today + timedelta(days=days_ahead - 1)},
    ).fetchall()
    by_date = {r.publish_date: r for r in rows}

    days = []
    for i in range(days_ahead):
        d = today + timedelta(days=i)
        row = by_date.get(d)
        if row is None:
            days.append({
                "exists": False, "publish_date": d.isoformat(), "status": "missing",
                "id": None, "quiz_number": None, "theme": None, "notes": None,
                "question_count": 0, "questions": [],
            })
            continue
        questions = db.execute(
            text("""
                SELECT id, position, question_text, options, correct_index,
                       explanation, source, difficulty, verified, verify_model_answer, voided
                FROM daily_quiz_questions WHERE quiz_id = :qid ORDER BY position
            """),
            {"qid": row.id},
        ).fetchall()
        days.append({
            "exists": True, "id": row.id, "quiz_number": row.quiz_number,
            "publish_date": d.isoformat(), "theme": row.theme, "status": row.status,
            "notes": row.notes, "question_count": sum(1 for q in questions if not q.voided),
            "questions": [_question_dict(q) for q in questions],
        })
    return {"today": today.isoformat(), "days": days}


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
    # Approving TODAY's day after its 00:00 UTC rollover already passed
    # must not silently wait until tomorrow's rollover to go live.
    await svc.publish_if_ready_today(db, quiz_id)
    return {"ok": True, "status": "approved"}


@router.post("/{quiz_id}/publish-now")
async def publish_now_endpoint(
    quiz_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Manual override so a ready quiz doesn't have to wait for the 00:00
    UTC rollover cron — mainly for testing, or "let's ship today's early."
    Requires 'verified' or 'approved' status (the same two states rollover()
    itself treats as ready); publishing an already-live or still-'draft'
    quiz is rejected."""
    result = await svc.publish_now(db, quiz_id)
    if not result.get("published"):
        raise HTTPException(400, result.get("reason", "publish failed"))
    return result


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


class QuestionCreate(BaseModel):
    question_text: str = Field(..., min_length=1)
    options:        list[str] = Field(..., min_length=4, max_length=4)
    correct_index:  int = Field(..., ge=0, le=3)
    explanation:    str = Field(..., min_length=1)
    source:         str = Field(..., min_length=1)
    difficulty:     str


@router.post("/{quiz_id}/questions")
async def add_question(
    quiz_id: int,
    body: QuestionCreate,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Manually author a question for a day — the escape hatch for when
    generation still can't reach 5 even after retries, or an admin simply
    wants to swap in their own content. Inserted at the next open position
    (0-4); reaching exactly 5 flips a 'draft' day straight to 'verified' —
    a manually-completed day is exactly as publish-ready as an AI-verified
    one, so it auto-publishes on schedule same as any other."""
    quiz = db.execute(text("SELECT id, status FROM daily_quizzes WHERE id = :id"), {"id": quiz_id}).fetchone()
    if quiz is None:
        raise HTTPException(404, "Quiz not found")
    if quiz.status in ("published", "closed"):
        raise HTTPException(400, "Cannot add a question to a live quiz")
    if body.difficulty not in ("easy", "medium", "hard"):
        raise HTTPException(422, "difficulty must be easy|medium|hard")

    existing_positions = {
        r[0] for r in db.execute(
            text("SELECT position FROM daily_quiz_questions WHERE quiz_id = :qid"), {"qid": quiz_id},
        ).fetchall()
    }
    if len(existing_positions) >= svc.QUESTIONS_PER_QUIZ:
        raise HTTPException(400, f"Quiz already has {len(existing_positions)} questions (max {svc.QUESTIONS_PER_QUIZ})")
    position = next(p for p in range(svc.QUESTIONS_PER_QUIZ) if p not in existing_positions)

    db.execute(
        text("""
            INSERT INTO daily_quiz_questions
                (quiz_id, position, question_text, options, correct_index, explanation, source, difficulty, verified)
            VALUES (:qid, :pos, :qtext, CAST(:opts AS jsonb), :cidx, :expl, :src, :diff, TRUE)
        """),
        {
            "qid": quiz_id, "pos": position, "qtext": body.question_text, "opts": json.dumps(body.options),
            "cidx": body.correct_index, "expl": body.explanation, "src": body.source, "diff": body.difficulty,
        },
    )
    new_count = len(existing_positions) + 1
    if new_count == svc.QUESTIONS_PER_QUIZ:
        db.execute(
            text("UPDATE daily_quizzes SET status = 'verified', notes = NULL WHERE id = :id AND status = 'draft'"),
            {"id": quiz_id},
        )
    db.commit()
    # Completing TODAY's day to 5 after its 00:00 UTC rollover already
    # passed must not silently wait until tomorrow's rollover to go live.
    await svc.publish_if_ready_today(db, quiz_id)
    return {"ok": True, "position": position, "question_count": new_count}


@router.delete("/questions/{question_id}")
async def delete_question(
    question_id: int,
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Remove a question outright — pre-publish only (use void instead for
    a live quiz, which needs the refund/exclude-from-scoring machinery).
    Frees its position for a replacement via regenerate or POST /questions;
    drops the parent quiz back to 'draft' if that leaves it under 5."""
    q = db.execute(
        text("""
            SELECT q.id, q.quiz_id, dq.status FROM daily_quiz_questions q
            JOIN daily_quizzes dq ON dq.id = q.quiz_id
            WHERE q.id = :id
        """),
        {"id": question_id},
    ).fetchone()
    if q is None:
        raise HTTPException(404, "Question not found")
    if q.status in ("published", "closed"):
        raise HTTPException(400, "Cannot delete a question from a live quiz — void it instead")

    db.execute(text("DELETE FROM daily_quiz_questions WHERE id = :id"), {"id": question_id})
    remaining = db.execute(
        text("SELECT COUNT(*) FROM daily_quiz_questions WHERE quiz_id = :qid"), {"qid": q.quiz_id},
    ).scalar()
    if int(remaining or 0) < svc.QUESTIONS_PER_QUIZ:
        db.execute(text("UPDATE daily_quizzes SET status = 'draft' WHERE id = :id"), {"id": q.quiz_id})
    db.commit()
    return {"ok": True, "question_count": int(remaining or 0)}


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
