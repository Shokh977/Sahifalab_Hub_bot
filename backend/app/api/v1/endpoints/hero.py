from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Quote
from app.schemas.schemas import QuoteResponse

router = APIRouter()

@router.get("/", response_model=QuoteResponse)
async def get_hero_content(db: Session = Depends(get_db)):
    """Get random quote or announcement for hero section"""
    quote = db.query(Quote).filter(
        Quote.is_active == True
    ).order_by(db.func.random()).first()
    
    if not quote:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No quotes available"
        )
    return quote

@router.get("/all", response_model=list[QuoteResponse])
async def get_all_quotes(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get all quotes"""
    return db.query(Quote).offset(skip).limit(limit).all()

@router.post("/", response_model=QuoteResponse, status_code=status.HTTP_201_CREATED)
async def create_quote(quote_data: dict, db: Session = Depends(get_db)):
    """Create new quote (Admin only)"""
    db_quote = Quote(**quote_data)
    db.add(db_quote)
    db.commit()
    db.refresh(db_quote)
    return db_quote
