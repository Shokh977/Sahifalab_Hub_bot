from sqlalchemy.orm import Session
from app.models.models import Book
from app.schemas.schemas import BookCreate

class BookService:
    @staticmethod
    def get_all_books(
        db: Session,
        skip: int = 0,
        limit: int = 10,
        category: str = None,
        is_paid: bool = None
    ) -> list:
        """Get books with optional filters"""
        query = db.query(Book).filter(Book.is_available == True)
        
        if category:
            query = query.filter(Book.category == category)
        if is_paid is not None:
            query = query.filter(Book.is_paid == is_paid)
        
        return query.offset(skip).limit(limit).all()
    
    @staticmethod
    def get_book_by_id(db: Session, book_id: int) -> Book:
        """Get book by ID"""
        return db.query(Book).filter(Book.id == book_id).first()
    
    @staticmethod
    def get_books_by_category(db: Session, category: str) -> list:
        """Get books by category"""
        return db.query(Book).filter(
            Book.category == category,
            Book.is_available == True
        ).all()
    
    @staticmethod
    def get_free_books(db: Session) -> list:
        """Get free books"""
        return db.query(Book).filter(
            Book.is_paid == False,
            Book.is_available == True
        ).all()
    
    @staticmethod
    def get_paid_books(db: Session) -> list:
        """Get paid books"""
        return db.query(Book).filter(
            Book.is_paid == True,
            Book.is_available == True
        ).all()
    
    @staticmethod
    def create_book(db: Session, book_data: BookCreate) -> Book:
        """Create new book"""
        db_book = Book(**book_data.dict())
        db.add(db_book)
        db.commit()
        db.refresh(db_book)
        return db_book
    
    @staticmethod
    def update_book(db: Session, book_id: int, book_data: BookCreate) -> Book:
        """Update book"""
        db_book = db.query(Book).filter(Book.id == book_id).first()
        if db_book:
            for key, value in book_data.dict().items():
                setattr(db_book, key, value)
            db.commit()
            db.refresh(db_book)
        return db_book
    
    @staticmethod
    def increment_downloads(db: Session, book_id: int) -> Book:
        """Increment download count"""
        db_book = db.query(Book).filter(Book.id == book_id).first()
        if db_book:
            db_book.downloads += 1
            db.commit()
            db.refresh(db_book)
        return db_book
    
    @staticmethod
    def search_books(db: Session, query_str: str) -> list:
        """Search books by title or author"""
        return db.query(Book).filter(
            (Book.title.ilike(f"%{query_str}%")) |
            (Book.author.ilike(f"%{query_str}%")),
            Book.is_available == True
        ).all()
