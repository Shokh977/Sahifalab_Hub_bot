from sqlalchemy.orm import Session
from app.models.models import User
from app.schemas.schemas import UserCreate, UserUpdate

class UserService:
    """Service layer for user operations"""
    
    async def get_user(self, db: Session, user_id: int):
        """Get user by ID"""
        return db.query(User).filter(User.id == user_id).first()
    
    async def get_user_by_telegram_id(self, db: Session, telegram_id: int):
        """Get user by Telegram ID"""
        return db.query(User).filter(User.telegram_id == telegram_id).first()
    
    async def create_user(self, db: Session, user_data: UserCreate):
        """Create a new user"""
        db_user = User(**user_data.dict())
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    
    async def update_user(self, db: Session, user_id: int, user_data: UserUpdate):
        """Update user"""
        db_user = db.query(User).filter(User.id == user_id).first()
        if not db_user:
            return None
        
        update_data = user_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_user, key, value)
        
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        return db_user
    
    async def delete_user(self, db: Session, user_id: int):
        """Delete user"""
        db_user = db.query(User).filter(User.id == user_id).first()
        if not db_user:
            return False
        
        db.delete(db_user)
        db.commit()
        return True
