from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import Resource
from app.schemas.schemas import ResourceResponse, ResourceCreate

router = APIRouter()

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
async def create_resource(resource_data: ResourceCreate, db: Session = Depends(get_db)):
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
    db: Session = Depends(get_db)
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
async def delete_resource(resource_id: int, db: Session = Depends(get_db)):
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
