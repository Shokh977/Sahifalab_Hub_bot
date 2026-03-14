import json
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Quiz, QuizQuestion
from app.schemas.schemas import QuizResponse, QuizDetailResponse, QuizCreate, QuizQuestionResponse

router = APIRouter()

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

@router.get("/{quiz_id}", response_model=QuizDetailResponse)
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
