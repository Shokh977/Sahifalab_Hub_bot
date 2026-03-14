from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Book
from app.schemas.schemas import BookResponse, BookCreate

router = APIRouter()

@router.get("/", response_model=list[BookResponse])
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
async def download_book(book_id: int, db: Session = Depends(get_db)):
    """Download book (redirect to file URL)"""
    book = db.query(Book).filter(Book.id == book_id).first()
    
    if not book:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Book not found"
        )
    
    # Update download count
    book.downloads += 1
    db.commit()
    
    # Redirect to file URL
    return {"download_url": book.file_url}

@router.post("/", response_model=BookResponse, status_code=status.HTTP_201_CREATED)
async def create_book(book_data: BookCreate, db: Session = Depends(get_db)):
    """Create new book (Admin only)"""
    db_book = Book(**book_data.dict())
    db.add(db_book)
    db.commit()
    db.refresh(db_book)
    return db_book

@router.put("/{book_id}", response_model=BookResponse)
async def update_book(
    book_id: int,
    book_data: BookCreate,
    db: Session = Depends(get_db)
):
    """Update book (Admin only)"""
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
