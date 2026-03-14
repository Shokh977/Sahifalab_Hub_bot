from sqlalchemy.orm import Session
from app.models.models import Quote
from app.schemas.schemas import QuoteResponse
import random

class HeroService:
    @staticmethod
    def get_random_quote(db: Session) -> Quote:
        """Get a random active quote"""
        quotes = db.query(Quote).filter(Quote.is_active == True).all()
        if not quotes:
            return None
        return random.choice(quotes)
    
    @staticmethod
    def get_daily_quote(db: Session) -> Quote:
        """Get quote of the day (first active quote)"""
        return db.query(Quote).filter(Quote.is_active == True).first()
    
    @staticmethod
    def get_quotes_by_type(db: Session, quote_type: str) -> list:
        """Get quotes by type (quote or announcement)"""
        return db.query(Quote).filter(
            Quote.is_active == True,
            Quote.quote_type == quote_type
        ).all()
    
    @staticmethod
    def create_quote(db: Session, text: str, author: str, quote_type: str) -> Quote:
        """Create new quote"""
        quote = Quote(
            text=text,
            author=author,
            quote_type=quote_type,
            is_active=True
        )
        db.add(quote)
        db.commit()
        db.refresh(quote)
        return quote
