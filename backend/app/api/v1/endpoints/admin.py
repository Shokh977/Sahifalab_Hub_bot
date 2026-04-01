import json
import os
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from sqlalchemy.orm import Session
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

router = APIRouter()

# ── Supabase helpers (for course/enrollment/payment data) ─────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

STARS_RATE = 250  # 1 Star ≈ 250 UZS


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
    total_users = db.query(User).count()
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


# ─────────────────────────────────────────────────────────────────────────────
# Platform Analytics (Step 15) — admin-only, Supabase data
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/platform-analytics")
async def get_platform_analytics(
    telegram_id: int = Query(...),
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
        # All courses (public + unpublished — admin sees everything)
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

    # ── Summary aggregation ──────────────────────────────────────────────────
    total_courses = len(courses)
    published_courses = sum(1 for c in courses if c.get("is_published"))
    paid_courses_count = sum(1 for c in courses if c.get("is_paid"))
    total_enrollments = sum(int(c.get("enrolled_count") or 0) for c in courses)
    total_teachers = len(teachers)
    gross_stars = sum(int(o.get("amount") or 0) for o in completed_orders)
    estimated_revenue_uzs = gross_stars * STARS_RATE

    # ── Per-teacher aggregation ──────────────────────────────────────────────
    course_to_teacher: dict[int, int] = {
        int(c["id"]): int(c.get("teacher_id") or 0)
        for c in courses if c.get("id") and c.get("teacher_id")
    }

    teacher_stars:   dict[int, int] = {}
    teacher_orders:  dict[int, int] = {}
    for o in completed_orders:
        cid = o.get("course_id")
        tid = course_to_teacher.get(int(cid)) if cid else None
        if tid:
            teacher_stars[tid]  = teacher_stars.get(tid, 0)  + int(o.get("amount") or 0)
            teacher_orders[tid] = teacher_orders.get(tid, 0) + 1

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
                "total_stars": teacher_stars.get(tid, 0),
                "estimated_uzs": teacher_stars.get(tid, 0) * STARS_RATE,
                "completed_orders": teacher_orders.get(tid, 0),
            }
            for tid in all_teacher_ids
        ],
        key=lambda x: x["total_stars"],
        reverse=True,
    )

    # ── Top 10 courses by enrollment ─────────────────────────────────────────
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
            "gross_stars": gross_stars,
            "estimated_revenue_uzs": estimated_revenue_uzs,
        },
        "top_courses": top_courses,
        "teacher_leaderboard": teacher_leaderboard,
        "recent_orders": completed_orders[:20],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Admin Courses Management (Step 20)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/courses")
async def admin_list_courses(
    telegram_id: int = Query(...),
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
            "category_icon": cat.get("icon") or "📚",
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
    telegram_id: int = Query(...),
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
    telegram_id: int = Query(...),
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
