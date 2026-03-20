from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.sql.expression import func
from app.db.session import get_db
from app.models.admin_models import HeroContent
from app.schemas.admin_schemas import HeroContentResponse

router = APIRouter()

@router.get("/")
async def get_hero_content(db: Session = Depends(get_db)):
    """Get random active hero content for the home page"""
    content = db.query(HeroContent).filter(
        HeroContent.is_active == True
    ).order_by(func.random()).first()

    if not content:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hero content available"
        )

    # Return both native fields and mapped fields for frontend compatibility
    return {
        "id": content.id,
        "title": content.title,
        "subtitle": content.subtitle,
        "description": content.description,
        "image_url": content.image_url,
        "cta_text": content.cta_text,
        "cta_link": content.cta_link,
        # Mapped fields for HeroSection frontend component
        "text": content.title or content.description or "",
        "author": content.subtitle or "SAHIFALAB",
        "quote_type": "announcement" if content.cta_link else "quote",
    }

@router.get("/all", response_model=list[HeroContentResponse])
async def get_all_hero_content(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get all hero content"""
    return db.query(HeroContent).offset(skip).limit(limit).all()
