import json
from sqlalchemy.orm import Session
from app.models.models import Quiz, QuizQuestion
from app.schemas.schemas import QuizCreate

class QuizService:
    @staticmethod
    def get_all_quizzes(db: Session, category: str = None, difficulty: str = None) -> list:
        """Get all quizzes"""
        query = db.query(Quiz)
        if category:
            query = query.filter(Quiz.category == category)
        if difficulty:
            query = query.filter(Quiz.difficulty == difficulty)
        return query.all()
    
    @staticmethod
    def get_quiz_by_id(db: Session, quiz_id: int) -> Quiz:
        """Get quiz with questions"""
        return db.query(Quiz).filter(Quiz.id == quiz_id).first()
    
    @staticmethod
    def get_quiz_questions(db: Session, quiz_id: int) -> list:
        """Get questions for a quiz"""
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
                'order': q.order,
            }
            questions_data.append(q_dict)
        return questions_data
    
    @staticmethod
    def submit_quiz(db: Session, quiz_id: int, answers: list) -> dict:
        """Submit quiz answers and calculate score"""
        questions = db.query(QuizQuestion).filter(
            QuizQuestion.quiz_id == quiz_id
        ).all()
        
        score = 0
        for i, user_answer in enumerate(answers):
            if i < len(questions) and user_answer == questions[i].correct_answer:
                score += 1
        
        total = len(answers)
        percentage = (score / total * 100) if total > 0 else 0
        
        return {
            'quiz_id': quiz_id,
            'score': score,
            'total': total,
            'percentage': round(percentage, 2),
            'passed': percentage >= 60,
        }
    
    @staticmethod
    def create_quiz(db: Session, quiz_data: QuizCreate) -> Quiz:
        """Create new quiz with questions"""
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
                options=json.dumps(q_data.options),
                correct_answer=q_data.correct_answer,
                explanation=q_data.explanation,
                order=idx,
            )
            db.add(db_question)
        
        db.commit()
        db.refresh(db_quiz)
        return db_quiz
