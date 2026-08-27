import json
import hmac
import hashlib
import time
import logging
from datetime import datetime, UTC
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, OperationalError, ProgrammingError
from app.db.session import get_db

logger = logging.getLogger(__name__)
from app.core.config import settings
from app.models.models import Quiz, QuizQuestion, UserQuizCompletion
from app.schemas.schemas import (
    QuizResponse, QuizDetailPublic, QuizCreate, QuizQuestionResponse,
    QuizVerifyRequest, QuizVerifyResponse,
)
from app.services.auth_service import decode_token, decode_token_payload
from app.models.admin_models import AdminUser
from app.services.integration_service import hook_quiz_passed
from app.services.xp_service import add_xp, DEFAULT_QUIZ_XP
from app.services.challenge_service import record_challenge_progress
from app.core.admin_check import is_role_admin

router = APIRouter()


# ── Auth helpers ──────────────────────────────────────────────────────────────

async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    """Extract telegram_id from Bearer JWT. Raises 401 on failure."""
    if not authorization:
        raise HTTPException(401, "Avtorizatsiya talab qilinadi")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(401, "Noto'g'ri avtorizatsiya")
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(401, "Token muddati tugagan")
    return tid


async def _require_admin(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> int:
    """Require admin JWT — returns telegram_id."""
    if not authorization:
        raise HTTPException(401, "Avtorizatsiya talab qilinadi")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(401, "Noto'g'ri avtorizatsiya")
    payload = decode_token_payload(parts[1])
    if not payload:
        raise HTTPException(401, "Token muddati tugagan")
    telegram_id = payload["telegram_id"]
    if telegram_id in settings.ADMIN_TELEGRAM_IDS or is_role_admin(db, telegram_id):
        return telegram_id
    admin = db.query(AdminUser).filter(
        AdminUser.telegram_id == telegram_id,
        AdminUser.is_active == True,
    ).first()
    if not admin:
        raise HTTPException(403, "Faqat adminlar uchun")
    return telegram_id


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_options(q: QuizQuestion) -> list:
    return json.loads(q.options) if isinstance(q.options, str) else (q.options or [])


def _sign_result(quiz_id: int, telegram_id: int, score: int, total: int, ts: int) -> str:
    """HMAC-SHA256 token — proves the score was computed server-side."""
    payload = f"{quiz_id}:{telegram_id}:{score}:{total}:{ts}"
    return hmac.new(
        settings.SECRET_KEY.encode(),
        payload.encode(),
        hashlib.sha256,
    ).hexdigest()


# ══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/", response_model=list[QuizResponse])
async def get_quizzes(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    category: str = Query(None),
    difficulty: str = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Quiz)
    if category:
        query = query.filter(Quiz.category == category)
    if difficulty:
        query = query.filter(Quiz.difficulty == difficulty)
    return query.offset(skip).limit(limit).all()


@router.get("/{quiz_id}", response_model=QuizDetailPublic)
async def get_quiz(quiz_id: int, db: Session = Depends(get_db)):
    """
    Return quiz with questions.
    correct_answer is intentionally excluded from the response —
    scoring is done server-side via POST /{quiz_id}/verify.
    """
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz topilmadi")

    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.quiz_id == quiz_id)
        .order_by(QuizQuestion.order)
        .all()
    )

    return {
        "id": quiz.id,
        "title": quiz.title,
        "book_title": quiz.book_title,
        "description": getattr(quiz, "description", None),
        "difficulty": quiz.difficulty,
        "category": quiz.category,
        "total_questions": quiz.total_questions,
        "book_id": quiz.book_id,
        "questions": [
            {
                "id": q.id,
                "question": q.question,
                "options": _parse_options(q),
                "explanation": q.explanation,
                # correct_answer deliberately omitted
            }
            for q in questions
        ],
    }


@router.post("/{quiz_id}/verify", response_model=QuizVerifyResponse)
async def verify_quiz(
    quiz_id: int,
    body: QuizVerifyRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """
    Server-side scoring with XP deduplication.
    telegram_id is derived from JWT — body.telegram_id is ignored.
    """
    # Always use JWT-derived identity
    telegram_id = caller_id

    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz topilmadi")

    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.quiz_id == quiz_id)
        .order_by(QuizQuestion.order)
        .all()
    )

    if len(body.answers) != len(questions):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Javoblar soni noto'g'ri: {len(body.answers)} ta keldi, "
            f"{len(questions)} ta kutilmoqda",
        )

    score = sum(
        1
        for i, q in enumerate(questions)
        if body.answers[i] == q.correct_answer
    )
    total = len(questions)
    percentage = round(score / total * 100, 1) if total else 0.0

    passed = percentage >= 80
    already_passed = False
    xp_awarded = False

    # Check + record completion (gracefully skipped if table doesn't exist yet)
    try:
        existing_completion = db.query(UserQuizCompletion).filter(
            UserQuizCompletion.telegram_id == telegram_id,
            UserQuizCompletion.quiz_id == quiz_id,
        ).first()

        already_passed = existing_completion is not None
        # XP is awarded only on the FIRST time the user scores >= 80%
        xp_awarded = passed and not already_passed

        # Record completion only when user passes for the first time
        if xp_awarded:
            try:
                completion = UserQuizCompletion(
                    quiz_id=quiz_id,
                    telegram_id=telegram_id,
                    score=score,
                    total=total,
                    percentage=percentage,
                )
                db.add(completion)
                db.commit()
            except IntegrityError:
                # Race condition: another request beat us to it
                db.rollback()
                xp_awarded = False

    except (OperationalError, ProgrammingError) as exc:
        # user_quiz_completion table hasn't been created yet — safe to ignore,
        # scoring still works, XP deduplication is temporarily disabled.
        db.rollback()
        logger.warning(
            "user_quiz_completion table missing — run migration 020. "
            "Scoring continues without XP dedup. Error: %s", exc
        )

    # ── Award XP + fire hook on first pass ───────────────────────────────────
    challenges_completed:  list = []
    challenges_progressed: list = []
    if xp_awarded:
        # tanga-economy-rework (092): the Tanga mirror here is removed — quiz
        # completion is not one of the events in the new earning table
        # (distinct from the "5 Savol" daily_quiz reason, which is separate
        # and unaffected). XP is unchanged.
        try:
            add_xp(db, user_id=telegram_id, source="QUIZ", amount=DEFAULT_QUIZ_XP)
        except Exception:
            # XP failure must not block the response, but must not be silent either
            logger.error(
                "Quiz XP award failed for user_id=%s amount=%s source=QUIZ",
                telegram_id, DEFAULT_QUIZ_XP, exc_info=True,
            )
        try:
            challenges_completed, challenges_progressed = record_challenge_progress(
                db, telegram_id, "tests_passed", 1, occurred_at=datetime.now(UTC),
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.error("Failed to record tests_passed challenge progress for user_id=%s quiz_id=%s", telegram_id, quiz_id, exc_info=True)
        # skill_tags: quizzes don't have a first-class skill_tags column yet —
        # pass empty list; future migration can add it to the Quiz model.
        hook_quiz_passed(
            db,
            user_id=telegram_id,
            quiz_id=quiz_id,
            quiz_title=quiz.title or f"Test #{quiz_id}",
            score=percentage,
            skill_tags=[],
        )

    ts = int(time.time())
    token = _sign_result(quiz_id, telegram_id, score, total, ts)

    return QuizVerifyResponse(
        quiz_id=quiz_id,
        score=score,
        total=total,
        percentage=percentage,
        passed=passed,
        certificate_eligible=passed,
        result_token=f"{ts}:{token}",
        is_first_attempt=xp_awarded,
        already_passed=already_passed,
        challenges_completed=challenges_completed,
        challenges_progressed=challenges_progressed,
    )


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — create quiz
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
async def create_quiz(
    quiz_data: QuizCreate,
    db: Session = Depends(get_db),
    admin_id: int = Depends(_require_admin),
):
    db_quiz = Quiz(
        title=quiz_data.title,
        book_title=quiz_data.book_title,
        description=quiz_data.description,
        difficulty=quiz_data.difficulty,
        category=quiz_data.category,
        book_id=quiz_data.book_id,
        total_questions=len(quiz_data.questions),
    )
    db.add(db_quiz)
    db.flush()

    for idx, q_data in enumerate(quiz_data.questions):
        db_question = QuizQuestion(
            quiz_id=db_quiz.id,
            question=q_data.question,
            options=json.dumps(q_data.options, ensure_ascii=False),
            correct_answer=q_data.correct_answer,
            explanation=q_data.explanation,
            order=idx,
        )
        db.add(db_question)

    db.commit()
    db.refresh(db_quiz)
    return db_quiz


@router.get("/by-book/{book_id}", response_model=list[QuizResponse])
async def get_quizzes_by_book(book_id: int, db: Session = Depends(get_db)):
    """Return all quizzes linked to a specific book."""
    return db.query(Quiz).filter(Quiz.book_id == book_id).all()


@router.patch("/{quiz_id}/link-book", response_model=QuizResponse)
async def link_quiz_to_book(
    quiz_id: int,
    book_id: Optional[int],
    db: Session = Depends(get_db),
    admin_id: int = Depends(_require_admin),
):
    """Set or clear the book_id link on a quiz (admin only)."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    if not quiz:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quiz topilmadi")
    quiz.book_id = book_id
    db.commit()
    db.refresh(quiz)
    return quiz
