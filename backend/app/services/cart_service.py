from sqlalchemy.orm import Session
from app.models.models import Cart, User, Product
from app.schemas.schemas import CartItemCreate

class CartService:
    """Service layer for cart operations"""
    
    async def get_or_create_cart(self, db: Session, user_id: int):
        """Get or create user's cart"""
        cart = db.query(Cart).filter(Cart.user_id == user_id).first()
        
        if not cart:
            user = db.query(User).filter(User.id == user_id).first()
            if not user:
                return None
            
            cart = Cart(user_id=user_id)
            db.add(cart)
            db.commit()
            db.refresh(cart)
        
        return cart
    
    async def add_to_cart(self, db: Session, user_id: int, item: CartItemCreate):
        """Add item to cart"""
        cart = await self.get_or_create_cart(db, user_id)
        if not cart:
            return None
        
        product = db.query(Product).filter(
            Product.id == item.product_id
        ).first()
        
        if not product or not product.is_available:
            return None
        
        # Check if product already in cart
        existing_item = db.query(Cart).filter(
            Cart.id == cart.id
        ).first()
        
        # Add product to cart
        if product not in cart.items:
            cart.items.append(product)
        
        db.add(cart)
        db.commit()
        db.refresh(cart)
        return cart
    
    async def remove_from_cart(self, db: Session, user_id: int, product_id: int):
        """Remove item from cart"""
        cart = db.query(Cart).filter(Cart.user_id == user_id).first()
        if not cart:
            return False
        
        product = db.query(Product).filter(Product.id == product_id).first()
        if not product:
            return False
        
        if product in cart.items:
            cart.items.remove(product)
            db.add(cart)
            db.commit()
            return True
        
        return False
    
    async def clear_cart(self, db: Session, user_id: int):
        """Clear user's cart"""
        cart = db.query(Cart).filter(Cart.user_id == user_id).first()
        if not cart:
            return False
        
        cart.items.clear()
        db.add(cart)
        db.commit()
        return True
