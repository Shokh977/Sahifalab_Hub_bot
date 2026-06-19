import json
import os
import httpx
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Header
from sqlalchemy.orm import Session
from typing import Optional
from app.db.session import get_db
from app.core.config import settings
from app.models.models import Quiz, QuizQuestion, Book, BookPurchase, BookRating, User
from app.models.admin_models import AdminUser, HeroContent, PaymentConfig, BookAuditLog, QuizAuditLog
from app.schemas.admin_schemas import (
    HeroContentCreate, HeroContentUpdate, HeroContentResponse,
    QuizUpload, QuizUploadResponse, QuizManagementResponse,
    BookManagementCreate, BookManagementUpdate, BookManagementResponse,
    PaymentConfigCreate, PaymentConfigUpdate, PaymentConfigResponse,
    AdminStats, AuditLogResponse
)
from app.services.auth_service import decode_token_payload

router = APIRouter()

# â”€â”€ Supabase helpers (for course/enrollment/payment data) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")


def _supabase_headers() -> dict:
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _ensure_supabase():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(
            status_code=503,
            detail="Supabase not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)",
        )


# Helper function to verify admin -- NOW uses JWT (Bearer token)
async def verify_admin(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Extract telegram_id from JWT Bearer token and verify admin role.
    No more client-supplied telegram_id query param -- that was a security hole.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
        )
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format",
        )

    payload = decode_token_payload(parts[1])
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )

    telegram_id = payload["telegram_id"]

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

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """List all books (admin view - includes unavailable)"""
    return db.query(Book).offset(skip).limit(limit).all()

# Payment Configuration
@router.post("/payments", response_model=PaymentConfigResponse, status_code=status.HTTP_201_CREATED)
async def configure_payment(
    payment_config: PaymentConfigCreate,

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

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """List all payment configurations"""
    return db.query(PaymentConfig).all()

@router.get("/payments/{provider}", response_model=PaymentConfigResponse)
async def get_payment_config(
    provider: str,

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
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Returns DB connection status and table counts. Auth: admin only (JWT)."""
    result: dict = {
        "telegram_id": admin.telegram_id,
        "is_known_admin": True,
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
    except Exception:
        result["error"] = "DB query failed"
    return result


# Admin Dashboard
@router.get("/dashboard/stats", response_model=AdminStats)
async def get_admin_stats(

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Get admin dashboard statistics (user counts sourced from Supabase profiles)"""
    total_quizzes = db.query(Quiz).count()
    total_books = db.query(Book).filter(Book.is_available == True).count()
    total_resources = total_books  # same source for now
    active_payments = db.query(PaymentConfig).filter(PaymentConfig.is_enabled == True).count()

    # â”€â”€ Pull real user counts from Supabase â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    total_users = db.query(User).count()  # Railway fallback
    active_1h   = 0
    active_24h  = 0

    if SUPABASE_URL and SUPABASE_KEY:
        try:
            now       = datetime.now(timezone.utc)
            ago_1h    = (now - timedelta(hours=1)).isoformat()
            ago_24h   = (now - timedelta(hours=24)).isoformat()

            sb_headers = {
                **_supabase_headers(),
                "Prefer":         "count=exact",
                "Range":          "0-0",
            }

            async with httpx.AsyncClient(timeout=10) as client:
                # Total profiles count
                r_total = await client.get(
                    f"{SUPABASE_URL}/rest/v1/profiles",
                    params={"select": "telegram_id"},
                    headers=sb_headers,
                )
                # Active in the last 1 hour
                r_1h = await client.get(
                    f"{SUPABASE_URL}/rest/v1/profiles",
                    params={"select": "telegram_id", "app_online_at": f"gte.{ago_1h}"},
                    headers=sb_headers,
                )
                # Active in the last 24 hours
                r_24h = await client.get(
                    f"{SUPABASE_URL}/rest/v1/profiles",
                    params={"select": "telegram_id", "app_online_at": f"gte.{ago_24h}"},
                    headers=sb_headers,
                )

            def _parse_count(resp: httpx.Response) -> int:
                """Extract the right side of 'Content-Range: 0-0/1234'."""
                cr = resp.headers.get("content-range", "") or resp.headers.get("Content-Range", "")
                try:
                    return int(cr.split("/")[-1])
                except Exception:
                    return 0

            total_users = _parse_count(r_total) or total_users
            active_1h   = _parse_count(r_1h)
            active_24h  = _parse_count(r_24h)
        except Exception:
            pass  # silently fall back to Railway count

    recent_uploads: list[str] = []

    return AdminStats(
        total_users=total_users,
        total_quizzes=total_quizzes,
        total_books=total_books,
        total_resources=total_resources,
        active_payments=active_payments,
        recent_uploads=recent_uploads,
        active_users_1h=active_1h,
        active_users_24h=active_24h,
    )

# Audit Logs
@router.get("/audit-logs/books", response_model=list[AuditLogResponse])
async def get_book_audit_logs(
    book_id: int = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),

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

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin)
):
    """Get quiz audit logs"""
    query = db.query(QuizAuditLog)
    
    if quiz_id:
        query = query.filter(QuizAuditLog.quiz_id == quiz_id)
    
    return query.order_by(QuizAuditLog.created_at.desc()).offset(skip).limit(limit).all()


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Platform Analytics (Step 15) -- admin-only, Supabase data
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/platform-analytics")
async def get_platform_analytics(

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """
    Platform-wide analytics for admin:
      - summary: courses, enrollments, teachers, total Stars, revenue estimate
      - top_courses: top 10 by enrolled_count
      - teacher_leaderboard: each teacher's Stars earned + students
      - recent_orders: last 20 completed payment orders
    """
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=15) as client:
        # All courses (public + unpublished -- admin sees everything)
        courses_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"select": "id,teacher_id,title,is_published,is_paid,enrolled_count,price"},
            headers=_supabase_headers(),
        )
        # All teacher profiles
        teachers_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/teacher_profiles",
            params={"select": "telegram_id,first_name,username"},
            headers=_supabase_headers(),
        )
        # All completed payment orders
        orders_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_payment_orders",
            params={
                "status": "eq.completed",
                "select": "order_id,course_id,student_id,amount,completed_at",
                "order": "completed_at.desc",
            },
            headers=_supabase_headers(),
        )

    courses: list[dict] = courses_res.json() if courses_res.status_code == 200 else []
    teachers: list[dict] = teachers_res.json() if teachers_res.status_code == 200 else []
    completed_orders: list[dict] = orders_res.json() if orders_res.status_code == 200 else []

    # â”€â”€ Summary aggregation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    total_courses = len(courses)
    published_courses = sum(1 for c in courses if c.get("is_published"))
    paid_courses_count = sum(1 for c in courses if c.get("is_paid"))
    total_enrollments = sum(int(c.get("enrolled_count") or 0) for c in courses)
    total_teachers = len(teachers)
    total_revenue_uzs = sum(float(o.get("amount") or 0) for o in completed_orders)

    # â”€â”€ Per-teacher aggregation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    course_to_teacher: dict[int, int] = {
        int(c["id"]): int(c.get("teacher_id") or 0)
        for c in courses if c.get("id") and c.get("teacher_id")
    }

    teacher_revenue: dict[int, float] = {}
    teacher_orders:  dict[int, int]   = {}
    for o in completed_orders:
        cid = o.get("course_id")
        tid = course_to_teacher.get(int(cid)) if cid else None
        if tid:
            teacher_revenue[tid] = teacher_revenue.get(tid, 0) + float(o.get("amount") or 0)
            teacher_orders[tid]  = teacher_orders.get(tid, 0) + 1

    teacher_courses_count: dict[int, int] = {}
    teacher_students:      dict[int, int] = {}
    for c in courses:
        tid = int(c.get("teacher_id") or 0)
        if tid:
            teacher_courses_count[tid] = teacher_courses_count.get(tid, 0) + 1
            teacher_students[tid]      = teacher_students.get(tid, 0) + int(c.get("enrolled_count") or 0)

    teacher_info: dict[int, dict] = {
        int(t["telegram_id"]): t
        for t in teachers if t.get("telegram_id")
    }

    all_teacher_ids = (
        set(course_to_teacher.values())
        | set(teacher_info.keys())
    ) - {0}

    teacher_leaderboard = sorted(
        [
            {
                "teacher_id": tid,
                "first_name": teacher_info.get(tid, {}).get("first_name") or f"Teacher {tid}",
                "username": teacher_info.get(tid, {}).get("username"),
                "courses_count": teacher_courses_count.get(tid, 0),
                "total_students": teacher_students.get(tid, 0),
                "total_revenue_uzs": teacher_revenue.get(tid, 0),
                "completed_orders": teacher_orders.get(tid, 0),
            }
            for tid in all_teacher_ids
        ],
        key=lambda x: x["total_revenue_uzs"],
        reverse=True,
    )

    # â”€â”€ Top 10 courses by enrollment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    top_courses = sorted(
        [
            {
                "id": c.get("id"),
                "title": c.get("title") or f"Course #{c.get('id')}",
                "teacher_id": c.get("teacher_id"),
                "enrolled_count": int(c.get("enrolled_count") or 0),
                "is_paid": bool(c.get("is_paid")),
                "price": int(c.get("price") or 0),
            }
            for c in courses
        ],
        key=lambda x: x["enrolled_count"],
        reverse=True,
    )[:10]

    return {
        "summary": {
            "total_courses": total_courses,
            "published_courses": published_courses,
            "paid_courses": paid_courses_count,
            "total_enrollments": total_enrollments,
            "total_teachers": total_teachers,
            "total_completed_orders": len(completed_orders),
            "total_revenue_uzs": total_revenue_uzs,
        },
        "top_courses": top_courses,
        "teacher_leaderboard": teacher_leaderboard,
        "recent_orders": completed_orders[:20],
    }


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Admin Courses Management (Step 20)
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.get("/courses")
async def admin_list_courses(

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """
    Admin: list ALL courses (published + draft) with teacher name,
    category info, enrolled_count, rating, total_lessons.
    """
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=15) as client:
        courses_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={
                "select": (
                    "id,teacher_id,title,description,thumbnail_url,"
                    "is_published,is_paid,price,level,language,"
                    "enrolled_count,rating,total_lessons,total_duration_minutes,"
                    "created_at,"
                    "course_categories(name,icon)"
                ),
                "order": "created_at.desc",
            },
            headers=_supabase_headers(),
        )
        profiles_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"select": "telegram_id,first_name,username"},
            headers=_supabase_headers(),
        )

    courses: list[dict] = courses_res.json() if courses_res.status_code == 200 else []
    profiles: list[dict] = profiles_res.json() if profiles_res.status_code == 200 else []

    profile_map: dict[int, dict] = {
        int(p["telegram_id"]): p for p in profiles if p.get("telegram_id")
    }

    result = []
    for c in courses:
        tid = int(c.get("teacher_id") or 0)
        prof = profile_map.get(tid, {})
        cat = c.get("course_categories") or {}
        result.append({
            "id": c.get("id"),
            "title": c.get("title") or "",
            "description": c.get("description") or "",
            "thumbnail_url": c.get("thumbnail_url") or "",
            "teacher_id": tid,
            "teacher_name": prof.get("first_name") or f"Teacher {tid}",
            "teacher_username": prof.get("username"),
            "category_name": cat.get("name") or "",
            "category_icon": cat.get("icon") or "ðŸ“š",
            "is_published": bool(c.get("is_published")),
            "is_paid": bool(c.get("is_paid")),
            "price": float(c.get("price") or 0),
            "level": c.get("level") or "beginner",
            "language": c.get("language") or "uz",
            "enrolled_count": int(c.get("enrolled_count") or 0),
            "rating": float(c.get("rating") or 0),
            "total_lessons": int(c.get("total_lessons") or 0),
            "total_duration_minutes": int(c.get("total_duration_minutes") or 0),
            "created_at": c.get("created_at") or "",
        })

    return result


@router.patch("/courses/{course_id}/publish")
async def admin_toggle_course_publish(
    course_id: int,

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Admin: toggle is_published for any course."""
    _ensure_supabase()

    # Fetch current status
    async with httpx.AsyncClient(timeout=10) as client:
        chk = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}", "select": "id,is_published"},
            headers=_supabase_headers(),
        )
    rows = chk.json() if chk.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Course not found")

    new_status = not bool(rows[0].get("is_published"))

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.patch(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}"},
            json={"is_published": new_status},
            headers=_supabase_headers(),
        )
    if res.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"Failed to update course: {res.text}")

    return {"ok": True, "course_id": course_id, "is_published": new_status}


@router.delete("/courses/{course_id}")
async def admin_delete_course(
    course_id: int,

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Admin: delete any course."""
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.delete(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={"id": f"eq.{course_id}"},
            headers=_supabase_headers(),
        )
    if res.status_code not in (200, 204):
        raise HTTPException(status_code=502, detail=f"Failed to delete course: {res.text}")

    return {"ok": True, "deleted_id": course_id}


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Payout Management -- Teacher Wallet Admin Endpoints
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

from app.services import wallet_service as ws
from pydantic import BaseModel as _PayoutBase


class _PayoutActionBody(_PayoutBase):
    admin_note: str = ""


@router.get("/payouts/pending")
async def list_pending_payouts(

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Admin: list all pending withdrawal requests with teacher info."""
    try:
        return {"payouts": await ws.list_pending_payouts()}
    except Exception as e:
        raise HTTPException(status_code=500, detail="To'lovlarni olishda xatolik")


@router.get("/payouts/all")
async def list_all_payouts(

    status_filter: str = Query(None, alias="status"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """Admin: list all payout requests, optionally filtered by status."""
    try:
        return {"payouts": await ws.list_all_payouts(status_filter=status_filter, limit=limit)}
    except Exception as e:
        raise HTTPException(status_code=500, detail="To'lovlar ro'yxatini olishda xatolik")


@router.post("/payouts/{payout_id}/approve")
async def approve_payout(
    payout_id: int,
    body: _PayoutActionBody = _PayoutActionBody(),

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """
    Admin: mark a pending payout as PAID.
    Moves money from pending_withdrawal â†’ withdrawn_total.
    """
    try:
        result = await ws.approve_payout(payout_id, admin_note=body.admin_note)
        return {"success": True, "payout": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="To'lovni tasdiqlashda xatolik")


@router.post("/payouts/{payout_id}/reject")
async def reject_payout(
    payout_id: int,
    body: _PayoutActionBody = _PayoutActionBody(),

    db: Session = Depends(get_db),
    admin: AdminUser = Depends(verify_admin),
):
    """
    Admin: reject a pending payout.
    Returns money from pending_withdrawal â†’ available_balance.
    """
    try:
        result = await ws.reject_payout(payout_id, admin_note=body.admin_note)
        return {"success": True, "payout": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="To'lovni rad etishda xatolik")


# ── Pending enrollments (step-12 manual enrollment) ───────────────────────────

def _pending_supabase_headers() -> dict:
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "return=representation",
    }


class _GrantBody(BaseModel):
    actual_amount:     Optional[int] = None
    payment_method:    Optional[str] = None
    notes:             Optional[str] = None
    send_notification: bool = True


class _CancelBody(BaseModel):
    reason: Optional[str] = None


class _DirectGrantBody(BaseModel):
    course_id:      int
    payment_method: Optional[str] = None
    amount:         Optional[int] = None
    notes:          Optional[str] = None


@router.get("/pending-enrollments")
async def list_pending_enrollments(
    status:    str = Query("awaiting_payment"),
    search:    Optional[str] = Query(None),
    page:      int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """List pending enrollment requests with user + course info (Admin only)."""
    admin = await verify_admin(authorization=authorization, db=db)
    _ensure_supabase()

    params: dict = {
        "status": f"eq.{status}",
        "select": "id,user_id,course_id,reference_code,expected_amount,status,created_at,expires_at,admin_notes,actual_amount,payment_method",
        "order":  "created_at.desc",
        "limit":  str(page_size),
        "offset": str((page - 1) * page_size),
    }

    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/pending_enrollments",
            params=params,
            headers={**_pending_supabase_headers(), "Prefer": "count=exact"},
        )
    rows  = res.json() if res.status_code == 200 else []
    total = int(res.headers.get("content-range", "0/0").split("/")[-1] or 0)

    if not rows:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}

    # Enrich: fetch profiles and course titles
    user_ids   = list({r["user_id"]   for r in rows})
    course_ids = list({r["course_id"] for r in rows})

    async with httpx.AsyncClient(timeout=10) as client:
        profiles_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={
                "telegram_id": f"in.({','.join(str(u) for u in user_ids)})",
                "select":      "telegram_id,first_name,username,photo_url",
            },
            headers=_pending_supabase_headers(),
        )
    profiles_by_id = {
        p["telegram_id"]: p
        for p in (profiles_res.json() if profiles_res.status_code == 200 else [])
    }

    async with httpx.AsyncClient(timeout=10) as client:
        courses_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/courses",
            params={
                "id":     f"in.({','.join(str(c) for c in course_ids)})",
                "select": "id,title,thumbnail_url,price",
            },
            headers=_pending_supabase_headers(),
        )
    courses_by_id = {
        c["id"]: c
        for c in (courses_res.json() if courses_res.status_code == 200 else [])
    }

    enriched = [
        {
            **r,
            "user":   profiles_by_id.get(r["user_id"]),
            "course": courses_by_id.get(r["course_id"]),
        }
        for r in rows
    ]

    if search:
        q = search.lower()
        enriched = [
            r for r in enriched
            if q in r["reference_code"].lower()
            or (r["user"] and q in (r["user"].get("first_name", "") + r["user"].get("username", "")).lower())
            or (r["course"] and q in r["course"].get("title", "").lower())
        ]

    return {"items": enriched, "total": total, "page": page, "page_size": page_size}


@router.post("/pending-enrollments/{pending_id}/grant")
async def grant_pending_enrollment(
    pending_id: int,
    body:  _GrantBody,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Mark pending enrollment as granted and create real course_enrollment (Admin only)."""
    admin = await verify_admin(authorization=authorization, db=db)
    _ensure_supabase()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Fetch the pending row
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/pending_enrollments",
            params={"id": f"eq.{pending_id}", "select": "*", "limit": "1"},
            headers=_pending_supabase_headers(),
        )
    rows = res.json() if res.status_code == 200 else []
    if not rows:
        raise HTTPException(status_code=404, detail="Pending enrollment not found")
    pending = rows[0]

    if pending["status"] not in ("awaiting_payment", "paid"):
        raise HTTPException(status_code=400, detail=f"Cannot grant: status is {pending['status']}")

    user_id   = pending["user_id"]
    course_id = pending["course_id"]

    # Check if not already enrolled
    async with httpx.AsyncClient(timeout=10) as client:
        already_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            params={
                "course_id":  f"eq.{course_id}",
                "student_id": f"eq.{user_id}",
                "is_active":  "eq.true",
                "select":     "id",
                "limit":      "1",
            },
            headers=_pending_supabase_headers(),
        )
    already = len(already_res.json() if already_res.status_code == 200 else []) > 0

    if not already:
        async with httpx.AsyncClient(timeout=10) as client:
            enroll_res = await client.post(
                f"{SUPABASE_URL}/rest/v1/course_enrollments",
                json={"course_id": course_id, "student_id": user_id, "is_active": True},
                headers=_pending_supabase_headers(),
            )
        if enroll_res.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail="Failed to create enrollment")

    # Update pending enrollment to 'granted'
    async with httpx.AsyncClient(timeout=10) as client:
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/pending_enrollments",
            params={"id": f"eq.{pending_id}"},
            json={
                "status":         "granted",
                "actual_amount":  body.actual_amount,
                "payment_method": body.payment_method,
                "admin_notes":    body.notes,
                "processed_by":   admin.telegram_id,
                "processed_at":   now_iso,
            },
            headers=_pending_supabase_headers(),
        )

    if body.send_notification:
        try:
            from app.api.v1.endpoints.notifications import send_notification
            await send_notification(
                user_id, "course_granted", "COURSE",
                {"course_id": course_id},
            )
        except Exception:
            pass  # notification failure must not block the grant

    return {"ok": True}


@router.post("/pending-enrollments/{pending_id}/cancel")
async def cancel_pending_enrollment(
    pending_id: int,
    body:  _CancelBody = _CancelBody(),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Cancel a pending enrollment request (Admin only)."""
    admin = await verify_admin(authorization=authorization, db=db)
    _ensure_supabase()

    async with httpx.AsyncClient(timeout=10) as client:
        await client.patch(
            f"{SUPABASE_URL}/rest/v1/pending_enrollments",
            params={"id": f"eq.{pending_id}"},
            json={
                "status":      "cancelled",
                "admin_notes": body.reason,
                "processed_by": admin.telegram_id,
                "processed_at": datetime.now(timezone.utc).isoformat(),
            },
            headers=_pending_supabase_headers(),
        )

    return {"ok": True}


@router.post("/users/{telegram_id}/grant-course")
async def direct_grant_course(
    telegram_id: int,
    body: _DirectGrantBody,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """Directly enroll a user in a course, bypassing the reference-code flow (Admin only)."""
    admin = await verify_admin(authorization=authorization, db=db)
    _ensure_supabase()

    # Check already enrolled
    async with httpx.AsyncClient(timeout=10) as client:
        already_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            params={
                "course_id":  f"eq.{body.course_id}",
                "student_id": f"eq.{telegram_id}",
                "is_active":  "eq.true",
                "select":     "id",
                "limit":      "1",
            },
            headers=_pending_supabase_headers(),
        )
    if len(already_res.json() if already_res.status_code == 200 else []) > 0:
        return {"ok": True, "already_enrolled": True}

    async with httpx.AsyncClient(timeout=10) as client:
        enroll_res = await client.post(
            f"{SUPABASE_URL}/rest/v1/course_enrollments",
            json={"course_id": body.course_id, "student_id": telegram_id, "is_active": True},
            headers=_pending_supabase_headers(),
        )
    if enroll_res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Failed to create enrollment")

    try:
        from app.api.v1.endpoints.notifications import send_notification
        await send_notification(
            telegram_id, "course_granted", "COURSE",
            {"course_id": body.course_id},
        )
    except Exception:
        pass

    return {"ok": True, "already_enrolled": False}
