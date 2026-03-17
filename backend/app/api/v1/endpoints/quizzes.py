import json
import hmac
import hashlib
import time
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.config import settings
from app.models.models import Quiz, QuizQuestion
from app.schemas.schemas import (
    QuizResponse, QuizDetailPublic, QuizCreate, QuizQuestionResponse,
    QuizVerifyRequest, QuizVerifyResponse,
)

router = APIRouter()


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
):
    """
    Server-side scoring.

    The client submits raw selected option indices (one per question, ordered).
    The server compares them against stored correct_answer values and returns
    a score plus an HMAC-signed result_token.  The token can later be used to
    validate a certificate request without trusting the client's claimed score.
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

    ts = int(time.time())
    token = _sign_result(quiz_id, body.telegram_id, score, total, ts)

    return QuizVerifyResponse(
        quiz_id=quiz_id,
        score=score,
        total=total,
        percentage=percentage,
        passed=percentage >= 60,
        certificate_eligible=percentage >= 80,
        result_token=f"{ts}:{token}",
    )


# ══════════════════════════════════════════════════════════════════════════════
# ADMIN — create quiz
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
async def create_quiz(quiz_data: QuizCreate, db: Session = Depends(get_db)):
    db_quiz = Quiz(
        title=quiz_data.title,
        book_title=quiz_data.book_title,
        description=quiz_data.description,
        difficulty=quiz_data.difficulty,
        category=quiz_data.category,
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


@router.get("/", response_model=list[QuizResponse])
async def get_quizzes(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    category: str = Query(None),
    difficulty: str = Query(None),
    db: Session = Depends(get_db)
):
    """Get all quizzes with optional filters"""
    query = db.query(Quiz)
    
    if category:
        query = query.filter(Quiz.category == category)
    if difficulty:
        query = query.filter(Quiz.difficulty == difficulty)
    
    return query.offset(skip).limit(limit).all()

@router.get("/{quiz_id}", response_model=QuizDetailPublic)
async def get_quiz(quiz_id: int, db: Session = Depends(get_db)):
    """Get quiz with questions"""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    # Load questions
    questions = db.query(QuizQuestion).filter(
        QuizQuestion.quiz_id == quiz_id
    ).order_by(QuizQuestion.order).all()
    
    # Parse options JSON
    questions_data = []
    for q in questions:
        q_dict = {
            'id': q.id,
            'question': q.question,
            'options': json.loads(q.options) if isinstance(q.options, str) else q.options,
            'correct_answer': q.correct_answer,
            'explanation': q.explanation,
        }
        questions_data.append(q_dict)
    
    return {
        'id': quiz.id,
        'title': quiz.title,
        'book_title': quiz.book_title,
        'difficulty': quiz.difficulty,
        'category': quiz.category,
        'total_questions': quiz.total_questions,
        'questions': questions_data,
    }

@router.get("/{quiz_id}/questions", response_model=list[dict])
async def get_quiz_questions(quiz_id: int, db: Session = Depends(get_db)):
    """Get questions for a quiz"""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    questions = db.query(QuizQuestion).filter(
        QuizQuestion.quiz_id == quiz_id
    ).order_by(QuizQuestion.order).all()
    
    questions_data = []
    for q in questions:
        q_dict = {
            'id': q.id,
            'question': q.question,
            'options': json.loads(q.options) if isinstance(q.options, str) else q.options,
            'correct_answer': q.correct_answer,
            'explanation': q.explanation,
        }
        questions_data.append(q_dict)
    
    return questions_data

@router.post("/{quiz_id}/submit", status_code=status.HTTP_200_OK)
async def submit_quiz(
    quiz_id: int,
    answers: dict,
    db: Session = Depends(get_db)
):
    """Submit quiz answers and get score"""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()
    
    if not quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )
    
    user_answers = answers.get('answers', [])
    score = 0
    total = len(user_answers)
    
    questions = db.query(QuizQuestion).filter(
        QuizQuestion.quiz_id == quiz_id
    ).all()
    
    for i, user_answer in enumerate(user_answers):
        if i < len(questions) and user_answer == questions[i].correct_answer:
            score += 1
    
    percentage = (score / total * 100) if total > 0 else 0
    
    return {
        'quiz_id': quiz_id,
        'score': score,
        'total': total,
        'percentage': round(percentage, 2),
        'passed': percentage >= 60,
    }

@router.post("/", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
async def create_quiz(quiz_data: QuizCreate, db: Session = Depends(get_db)):
    """Create new quiz (Admin only)"""
    # Create quiz
    db_quiz = Quiz(
        title=quiz_data.title,
        book_title=quiz_data.book_title,
        description=quiz_data.description,
        difficulty=quiz_data.difficulty,
        category=quiz_data.category,
        total_questions=len(quiz_data.questions),
    )
    db.add(db_quiz)
    db.flush()
    
    # Create questions
    for idx, q_data in enumerate(quiz_data.questions):
        db_question = QuizQuestion(
            quiz_id=db_quiz.id,
            question=q_data.question,
            options=json.dumps(q_data.options),
            correct_answer=q_data.correct_answer,
            explanation=q_data.explanation,
            order=idx,
        )
        db.add(db_question)
    
    db.commit()
    db.refresh(db_quiz)
    return db_quiz
