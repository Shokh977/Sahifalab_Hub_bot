from fastapi import APIRouter, Depends, HTTPException, status, Query, Header
from sqlalchemy import func
from sqlalchemy.orm import Session
from datetime import datetime, UTC
from typing import Optional
from app.db.session import get_db
from app.models.models import Book, BookRating, BookReadProgress, BookPurchase
from app.schemas.schemas import BookResponse, BookListResponse, BookCreate, BookRateRequest, BookProgressRequest
from app.services.auth_service import decode_token, decode_token_payload

router = APIRouter()


# ── Auth helpers ───────────────────────────────────────────────────────────────

async def _require_token(authorization: Optional[str] = Header(None)) -> int:
    """Extract telegram_id from Bearer JWT. Raises 401 on failure."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    tid = decode_token(parts[1])
    if not tid:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return tid


async def _require_admin(authorization: Optional[str] = Header(None)) -> int:
    """Require JWT with role=admin. Returns telegram_id."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    payload = decode_token_payload(parts[1])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if payload.get("role") not in ("admin", "teacher"):
        raise HTTPException(status_code=403, detail="Admin or teacher role required")
    return payload["telegram_id"]

@router.get("/", response_model=list[BookListResponse])
async def get_books(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    category: str = Query(None),
    is_paid: bool = Query(None),
    db: Session = Depends(get_db)
):
    """Get all books with optional filters"""
    query = db.query(Book).filter(Book.is_available == True)
    
    if category:
        query = query.filter(Book.category == category)
    if is_paid is not None:
        query = query.filter(Book.is_paid == is_paid)
    
    return query.offset(skip).limit(limit).all()

@router.get("/{book_id}", response_model=BookResponse)
async def get_book(book_id: int, db: Session = Depends(get_db)):
    """Get book details"""
    book = db.query(Book).filter(Book.id == book_id).first()
    
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found"
        )
    return book

@router.get("/{book_id}/download")
async def download_book(
    book_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Download book (redirect to file URL). Requires JWT. Paid books require completed purchase."""
    book = db.query(Book).filter(Book.id == book_id).first()
    
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found"
        )
    
    # Check download permission
    if not book.is_downloadable:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This book is read-only and cannot be downloaded",
        )

    # For paid books, verify user has purchased
    if book.is_paid:
        purchase = db.query(BookPurchase).filter(
            BookPurchase.book_id == book_id,
            BookPurchase.telegram_id == caller_id,
            BookPurchase.status == "completed",
        ).first()
        if not purchase:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Purchase required to download this book",
            )

    # Update download count
    book.downloads += 1
    db.commit()
    
    # Redirect to file URL
    return {"download_url": book.file_url}

@router.get("/{book_id}/my-rating")
async def get_my_rating(
    book_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Get current user's rating for a book. Identity from JWT."""
    rating = db.query(BookRating).filter(
        BookRating.book_id == book_id,
        BookRating.telegram_id == caller_id,
    ).first()
    return {"rating": rating.rating if rating else 0}

@router.post("/{book_id}/rate")
async def rate_book(
    book_id: int,
    body: BookRateRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Rate a book (1-5 stars). Identity from JWT — body.telegram_id is ignored."""
    telegram_id = caller_id
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    if not 1 <= body.rating <= 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")

    # Upsert: update existing rating or create new
    existing = db.query(BookRating).filter(
        BookRating.book_id == book_id,
        BookRating.telegram_id == telegram_id,
    ).first()

    if existing:
        existing.rating = body.rating
        existing.updated_at = datetime.utcnow()
    else:
        db.add(BookRating(
            book_id=book_id,
            telegram_id=telegram_id,
            rating=body.rating,
        ))

    db.flush()

    # Recalculate average rating for this book
    avg = db.query(func.avg(BookRating.rating)).filter(
        BookRating.book_id == book_id
    ).scalar()
    book.rating = round(float(avg), 1) if avg else 0

    db.commit()
    return {"rating": body.rating, "average": book.rating}

@router.post("/", response_model=BookResponse, status_code=status.HTTP_201_CREATED)
async def create_book(
    book_data: BookCreate,
    db: Session = Depends(get_db),
    admin_id: int = Depends(_require_admin),
):
    """Create new book (Admin only — enforced by JWT role check)"""
    db_book = Book(**book_data.dict())
    db.add(db_book)
    db.commit()
    db.refresh(db_book)
    return db_book


@router.get("/{book_id}/progress")
async def get_book_progress(
    book_id: int,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Return the user's saved reading position for a book. Identity from JWT."""
    row = db.query(BookReadProgress).filter(
        BookReadProgress.book_id == book_id,
        BookReadProgress.telegram_id == caller_id,
    ).first()
    if not row:
        return {"page_number": 1, "cfi": None, "percent": 0}
    return {"page_number": row.page_number, "cfi": row.cfi, "percent": row.percent}


@router.post("/{book_id}/progress")
async def save_book_progress(
    book_id: int,
    body: BookProgressRequest,
    db: Session = Depends(get_db),
    caller_id: int = Depends(_require_token),
):
    """Upsert the user's reading position for a book. Identity from JWT — body.telegram_id is ignored."""
    telegram_id = caller_id
    existing = db.query(BookReadProgress).filter(
        BookReadProgress.book_id == book_id,
        BookReadProgress.telegram_id == telegram_id,
    ).first()
    if existing:
        existing.page_number = body.page_number
        existing.cfi = body.cfi
        existing.percent = body.percent
        existing.updated_at = datetime.now(UTC)
    else:
        db.add(BookReadProgress(
            book_id=book_id,
            telegram_id=telegram_id,
            page_number=body.page_number,
            cfi=body.cfi,
            percent=body.percent,
        ))
    db.commit()
    return {"success": True}

@router.put("/{book_id}", response_model=BookResponse)
async def update_book(
    book_id: int,
    book_data: BookCreate,
    db: Session = Depends(get_db),
    admin_id: int = Depends(_require_admin),
):
    """Update book (Admin only — enforced by JWT role check)"""
    db_book = db.query(Book).filter(Book.id == book_id).first()
    
    if not db_book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found"
        )
    
    for key, value in book_data.dict().items():
        setattr(db_book, key, value)
    
    db.commit()
    db.refresh(db_book)
    return db_book
