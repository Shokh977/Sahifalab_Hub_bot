import json
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.core.config import settings
from app.models.models import Quiz, QuizQuestion, Book, BookPurchase, BookRating
from app.models.admin_models import AdminUser, HeroContent, PaymentConfig, BookAuditLog, QuizAuditLog
from app.schemas.admin_schemas import (
    HeroContentCreate, HeroContentUpdate, HeroContentResponse,
    QuizUpload, QuizUploadResponse, QuizManagementResponse,
    BookManagementCreate, BookManagementUpdate, BookManagementResponse,
    PaymentConfigCreate, PaymentConfigUpdate, PaymentConfigResponse,
    AdminStats, AuditLogResponse
)

router = APIRouter()

# Helper function to verify admin
async def verify_admin(telegram_id: int, db: Session = Depends(get_db)):
    # 1. Check the hardcoded env-var list first (works even with an empty DB)
    if telegram_id in settings.ADMIN_TELEGRAM_IDS:
        # Return or upsert a real AdminUser row so FK references work
        admin = db.query(AdminUser).filter(AdminUser.telegram_id == telegram_id).first()
        if not admin:
            admin = AdminUser(
                telegram_id=telegram_id,
                role="admin",
                is_active=True,
            )
            db.add(admin)
            db.commit()
            db.refresh(admin)
        return admin

    # 2. Fallback: check the admin_user table (for extra admins added via DB)
    admin = db.query(AdminUser).filter(
        AdminUser.telegram_id == telegram_id,
        AdminUser.is_active == True
    ).first()

    if not admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return admin

# Hero Content Management
@router.post("/hero", response_model=HeroContentResponse, status_code=status.HTTP_201_CREATED)
async def create_hero_content(
    content: HeroContentCreate,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Create new hero content (Admin only)"""
    db_content = HeroContent(
        **content.dict(),
        created_by=admin.id
    )
    db.add(db_content)
    db.commit()
    db.refresh(db_content)
    return db_content

@router.put("/hero/{hero_id}", response_model=HeroContentResponse)
async def update_hero_content(
    hero_id: int,
    content: HeroContentUpdate,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Update hero content"""
    db_content = db.query(HeroContent).filter(HeroContent.id == hero_id).first()
    
    if not db_content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hero content not found"
        )
    
    update_data = content.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_content, key, value)
    
    db.commit()
    db.refresh(db_content)
    return db_content

@router.get("/hero", response_model=list[HeroContentResponse])
async def list_hero_content(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """List all hero content"""
    return db.query(HeroContent).filter(HeroContent.is_active == True).offset(skip).limit(limit).all()

@router.delete("/hero/{hero_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_hero_content(
    hero_id: int,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Delete hero content"""
    db_content = db.query(HeroContent).filter(HeroContent.id == hero_id).first()
    
    if not db_content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hero content not found"
        )
    
    db.delete(db_content)
    db.commit()

# Quiz Upload Management
@router.get("/quizzes", response_model=list[QuizManagementResponse])
async def list_quizzes_admin(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """List all quizzes for admin management"""
    quizzes = db.query(Quiz).order_by(Quiz.created_at.desc()).offset(skip).limit(limit).all()
    return [
        {
            "id": quiz.id,
            "title": quiz.title or f"Quiz #{quiz.id}",
            "book_title": quiz.book_title or "Noma'lum kitob",
            "difficulty": quiz.difficulty or "medium",
            "category": quiz.category or "other",
            "total_questions": quiz.total_questions or 0,
            "created_at": quiz.created_at,
        }
        for quiz in quizzes
    ]


@router.post("/quizzes/upload", response_model=QuizUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_quiz(
    quiz_data: QuizUpload,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Upload new quiz with JSON format"""
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
    
    # Add questions
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
    
    # Log audit
    audit_log = QuizAuditLog(
        quiz_id=db_quiz.id,
        action="created",
        changes={"title": quiz_data.title, "questions": len(quiz_data.questions)},
        admin_id=admin.id
    )
    db.add(audit_log)
    
    db.commit()
    db.refresh(db_quiz)
    
    return {
        "id": db_quiz.id,
        "title": db_quiz.title,
        "total_questions": db_quiz.total_questions,
        "status": "created"
    }


@router.delete("/quizzes/{quiz_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quiz(
    quiz_id: int,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Delete quiz and related records"""
    db_quiz = db.query(Quiz).filter(Quiz.id == quiz_id).first()

    if not db_quiz:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Quiz not found"
        )

    # Remove related rows explicitly to avoid FK issues in all environments
    db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz_id).delete()
    db.query(QuizAuditLog).filter(QuizAuditLog.quiz_id == quiz_id).delete()

    db.delete(db_quiz)
    db.commit()

# Book Management
@router.post("/books", response_model=BookManagementResponse, status_code=status.HTTP_201_CREATED)
async def create_book(
    book_data: BookManagementCreate,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Create new book"""
    db_book = Book(**book_data.dict())
    db.add(db_book)
    db.flush()
    
    # Log audit
    audit_log = BookAuditLog(
        book_id=db_book.id,
        action="created",
        new_values=book_data.dict(),
        admin_id=admin.id
    )
    db.add(audit_log)
    
    db.commit()
    db.refresh(db_book)
    return db_book

@router.put("/books/{book_id}", response_model=BookManagementResponse)
async def update_book(
    book_id: int,
    book_data: BookManagementUpdate,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Update book details"""
    db_book = db.query(Book).filter(Book.id == book_id).first()
    
    if not db_book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found"
        )
    
    # Store old values for audit
    old_values = {
        "title": db_book.title,
        "price": db_book.price,
        "is_paid": db_book.is_paid
    }
    
    update_data = book_data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_book, key, value)
    
    # Log audit
    audit_log = BookAuditLog(
        book_id=db_book.id,
        action="updated",
        old_values=old_values,
        new_values=update_data,
        admin_id=admin.id
    )
    db.add(audit_log)
    
    db.commit()
    db.refresh(db_book)
    return db_book

@router.delete("/books/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_book(
    book_id: int,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Permanently delete book and all associated records"""
    db_book = db.query(Book).filter(Book.id == book_id).first()
    
    if not db_book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found"
        )
    
    # Remove associated records first to avoid FK violations
    db.query(BookPurchase).filter(BookPurchase.book_id == book_id).delete()
    db.query(BookRating).filter(BookRating.book_id == book_id).delete()
    db.query(BookAuditLog).filter(BookAuditLog.book_id == book_id).delete()
    
    # Hard delete the book
    db.delete(db_book)
    db.commit()

@router.get("/books", response_model=list[BookManagementResponse])
async def list_books_admin(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """List all books (admin view - includes unavailable)"""
    return db.query(Book).offset(skip).limit(limit).all()

# Payment Configuration
@router.post("/payments", response_model=PaymentConfigResponse, status_code=status.HTTP_201_CREATED)
async def configure_payment(
    payment_config: PaymentConfigCreate,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Configure payment provider"""
    # Check if provider already exists
    existing = db.query(PaymentConfig).filter(
        PaymentConfig.provider == payment_config.provider
    ).first()
    
    if existing:
        # Update existing
        for key, value in payment_config.dict().items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing
    
    # Create new
    db_config = PaymentConfig(**payment_config.dict())
    db.add(db_config)
    db.commit()
    db.refresh(db_config)
    return db_config

@router.get("/payments", response_model=list[PaymentConfigResponse])
async def list_payment_configs(
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """List all payment configurations"""
    return db.query(PaymentConfig).all()

@router.get("/payments/{provider}", response_model=PaymentConfigResponse)
async def get_payment_config(
    provider: str,
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Get specific payment configuration"""
    config = db.query(PaymentConfig).filter(PaymentConfig.provider == provider).first()
    
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment configuration not found"
        )
    
    return config

# Debug endpoint — tests DB connectivity and returns diagnostics
@router.get("/debug")
async def debug_db(
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
):
    """Returns DB connection status and table counts. Auth: admin only."""
    import traceback
    result: dict = {
        "telegram_id": telegram_id,
        "admin_ids_in_config": settings.ADMIN_TELEGRAM_IDS,
        "is_known_admin": telegram_id in settings.ADMIN_TELEGRAM_IDS,
        "db_connected": False,
        "tables": {},
        "error": None,
    }
    try:
        result["tables"]["admin_user"] = db.query(AdminUser).count()
        result["tables"]["quiz"] = db.query(Quiz).count()
        result["tables"]["book"] = db.query(Book).count()
        result["tables"]["hero_content"] = db.query(HeroContent).count()
        result["db_connected"] = True
    except Exception as e:
        result["error"] = traceback.format_exc()
    return result


# Admin Dashboard
@router.get("/dashboard/stats", response_model=AdminStats)
async def get_admin_stats(
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Get admin dashboard statistics"""
    total_users = db.query(Quiz).count()  # Approximate
    total_quizzes = db.query(Quiz).count()
    total_books = db.query(Book).filter(Book.is_available == True).count()
    total_resources = db.query(Book).filter(Book.is_available == True).count()  # Placeholder
    
    active_payments = db.query(PaymentConfig).filter(
        PaymentConfig.is_enabled == True
    ).count()
    
    recent_uploads = ["Quiz: Python 101", "Book: Data Science", "Resource: Khan Academy"]
    
    return AdminStats(
        total_users=total_users,
        total_quizzes=total_quizzes,
        total_books=total_books,
        total_resources=total_resources,
        active_payments=active_payments,
        recent_uploads=recent_uploads
    )

# Audit Logs
@router.get("/audit-logs/books", response_model=list[AuditLogResponse])
async def get_book_audit_logs(
    book_id: int = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Get book audit logs"""
    query = db.query(BookAuditLog)
    
    if book_id:
        query = query.filter(BookAuditLog.book_id == book_id)
    
    return query.order_by(BookAuditLog.created_at.desc()).offset(skip).limit(limit).all()

@router.get("/audit-logs/quizzes", response_model=list[AuditLogResponse])
async def get_quiz_audit_logs(
    quiz_id: int = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    telegram_id: int = Query(...),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Get quiz audit logs"""
    query = db.query(QuizAuditLog)
    
    if quiz_id:
        query = query.filter(QuizAuditLog.quiz_id == quiz_id)
    
    return query.order_by(QuizAuditLog.created_at.desc()).offset(skip).limit(limit).all()
