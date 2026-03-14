from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.models.models import Product
from app.schemas.schemas import ProductCreate, ProductUpdate

class ProductService:
    """Service layer for product operations"""
    
    async def get_product(self, db: Session, product_id: int):
        """Get product by ID"""
        return db.query(Product).filter(Product.id == product_id).first()
    
    async def get_products(self, db: Session, skip: int = 0, limit: int = 10):
        """Get all available products"""
        return db.query(Product).filter(
            Product.is_available == True
        ).offset(skip).limit(limit).all()
    
    async def get_products_by_category(
        self,
        db: Session,
        category: str,
        skip: int = 0,
        limit: int = 10
    ):
        """Get products by category"""
        return db.query(Product).filter(
            Product.category == category,
            Product.is_available == True
        ).offset(skip).limit(limit).all()
    
    async def search_products(self, db: Session, query: str):
        """Search products by name or description"""
        search_query = f"%{query}%"
        return db.query(Product).filter(
            or_(
                Product.name.ilike(search_query),
                Product.description.ilike(search_query),
                Product.category.ilike(search_query)
            ),
            Product.is_available == True
        ).all()
    
    async def create_product(self, db: Session, product_data: ProductCreate):
        """Create a new product"""
        db_product = Product(**product_data.dict())
        db.add(db_product)
        db.commit()
        db.refresh(db_product)
        return db_product
    
    async def update_product(self, db: Session, product_id: int, product_data: ProductUpdate):
        """Update product"""
        db_product = db.query(Product).filter(Product.id == product_id).first()
        if not db_product:
            return None
        
        update_data = product_data.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_product, key, value)
        
        db.add(db_product)
        db.commit()
        db.refresh(db_product)
        return db_product
    
    async def delete_product(self, db: Session, product_id: int):
        """Delete product"""
        db_product = db.query(Product).filter(Product.id == product_id).first()
        if not db_product:
            return False
        
        db.delete(db_product)
        db.commit()
        return True
