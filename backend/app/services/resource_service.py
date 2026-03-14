from sqlalchemy.orm import Session
from app.models.models import Resource
from app.schemas.schemas import ResourceCreate

class ResourceService:
    @staticmethod
    def get_all_resources(db: Session, skip: int = 0, limit: int = 10) -> list:
        """Get all resources"""
        return db.query(Resource).offset(skip).limit(limit).all()
    
    @staticmethod
    def get_resource_by_id(db: Session, resource_id: int) -> Resource:
        """Get resource by ID"""
        return db.query(Resource).filter(Resource.id == resource_id).first()
    
    @staticmethod
    def get_resources_by_category(db: Session, category: str) -> list:
        """Get resources by category"""
        return db.query(Resource).filter(
            Resource.category == category
        ).all()
    
    @staticmethod
    def get_resources_by_type(db: Session, resource_type: str) -> list:
        """Get resources by type (youtube, link, course)"""
        return db.query(Resource).filter(
            Resource.resource_type == resource_type
        ).all()
    
    @staticmethod
    def get_categories(db: Session) -> list:
        """Get all available categories"""
        categories = db.query(Resource.category).distinct().all()
        return [cat[0] for cat in categories if cat[0]]
    
    @staticmethod
    def create_resource(db: Session, resource_data: ResourceCreate) -> Resource:
        """Create new resource"""
        db_resource = Resource(**resource_data.dict())
        db.add(db_resource)
        db.commit()
        db.refresh(db_resource)
        return db_resource
    
    @staticmethod
    def update_resource(db: Session, resource_id: int, resource_data: ResourceCreate) -> Resource:
        """Update resource"""
        db_resource = db.query(Resource).filter(Resource.id == resource_id).first()
        if db_resource:
            for key, value in resource_data.dict().items():
                setattr(db_resource, key, value)
            db.commit()
            db.refresh(db_resource)
        return db_resource
    
    @staticmethod
    def delete_resource(db: Session, resource_id: int) -> bool:
        """Delete resource"""
        db_resource = db.query(Resource).filter(Resource.id == resource_id).first()
        if db_resource:
            db.delete(db_resource)
            db.commit()
            return True
        return False
    
    @staticmethod
    def search_resources(db: Session, query_str: str) -> list:
        """Search resources by title or description"""
        return db.query(Resource).filter(
            (Resource.title.ilike(f"%{query_str}%")) |
            (Resource.description.ilike(f"%{query_str}%"))
        ).all()
