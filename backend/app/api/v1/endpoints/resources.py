from fastapi import APIRouter, Depends, HTTPException, Header, status, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.db.session import get_db
from app.models.models import Resource
from app.schemas.schemas import ResourceResponse, ResourceCreate
from app.services.auth_service import decode_token_payload
from app.core.config import settings
from app.models.admin_models import AdminUser

router = APIRouter()


async def _require_admin(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> int:
    """Require admin JWT — returns telegram_id."""
    if not authorization:
        raise HTTPException(401, "Avtorizatsiya talab qilinadi")
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(401, "Noto'g'ri avtorizatsiya")
    payload = decode_token_payload(parts[1])
    if not payload:
        raise HTTPException(401, "Token muddati tugagan")
    telegram_id = payload["telegram_id"]
    if telegram_id in settings.ADMIN_TELEGRAM_IDS:
        return telegram_id
    admin = db.query(AdminUser).filter(
        AdminUser.telegram_id == telegram_id,
        AdminUser.is_active == True,
    ).first()
    if not admin:
        raise HTTPException(403, "Faqat adminlar uchun")
    return telegram_id

@router.get("/", response_model=list[ResourceResponse])
async def get_resources(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    category: str = Query(None),
    resource_type: str = Query(None),
    db: Session = Depends(get_db)
):
    """Get all resources with optional filters"""
    query = db.query(Resource)
    
    if category:
        query = query.filter(Resource.category == category)
    if resource_type:
        query = query.filter(Resource.resource_type == resource_type)
    
    return query.offset(skip).limit(limit).all()

@router.get("/{resource_id}", response_model=ResourceResponse)
async def get_resource(resource_id: int, db: Session = Depends(get_db)):
    """Get resource details"""
    resource = db.query(Resource).filter(Resource.id == resource_id).first()
    
    if not resource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    return resource

@router.post("/", response_model=ResourceResponse, status_code=status.HTTP_201_CREATED)
async def create_resource(
    resource_data: ResourceCreate,
    db: Session = Depends(get_db),
    admin_id: int = Depends(_require_admin),
):
    """Create new resource (Admin only)"""
    db_resource = Resource(**resource_data.dict())
    db.add(db_resource)
    db.commit()
    db.refresh(db_resource)
    return db_resource

@router.put("/{resource_id}", response_model=ResourceResponse)
async def update_resource(
    resource_id: int,
    resource_data: ResourceCreate,
    db: Session = Depends(get_db),
    admin_id: int = Depends(_require_admin),
):
    """Update resource (Admin only)"""
    db_resource = db.query(Resource).filter(Resource.id == resource_id).first()
    
    if not db_resource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    for key, value in resource_data.dict().items():
        setattr(db_resource, key, value)
    
    db.commit()
    db.refresh(db_resource)
    return db_resource

@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    admin_id: int = Depends(_require_admin),
):
    """Delete resource (Admin only)"""
    db_resource = db.query(Resource).filter(Resource.id == resource_id).first()
    
    if not db_resource:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    db.delete(db_resource)
    db.commit()
    return None
