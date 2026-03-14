from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from app.models.models import Order, OrderItem, Product, User
from app.schemas.schemas import OrderCreate

class OrderService:
    """Service layer for order operations"""
    
    async def get_order(self, db: Session, order_id: int):
        """Get order by ID"""
        return db.query(Order).filter(Order.id == order_id).first()
    
    async def get_orders(self, db: Session, skip: int = 0, limit: int = 10):
        """Get all orders"""
        return db.query(Order).offset(skip).limit(limit).all()
    
    async def create_order(self, db: Session, order_data: OrderCreate, user_id: int):
        """Create a new order"""
        # Generate order number
        last_order = db.query(Order).order_by(Order.id.desc()).first()
        order_number = f"ORD-{(last_order.id if last_order else 0) + 1:06d}"
        
        # Calculate total
        total_amount = 0
        order_items = []
        
        for item_data in order_data.items:
            product = db.query(Product).filter(
                Product.id == item_data.product_id
            ).first()
            
            if not product:
                raise ValueError(f"Product {item_data.product_id} not found")
            
            if product.stock < item_data.quantity:
                raise ValueError(f"Insufficient stock for product {product.name}")
            
            item_total = product.price * item_data.quantity
            total_amount += item_total
            
            order_item = OrderItem(
                product_id=item_data.product_id,
                quantity=item_data.quantity,
                price=product.price
            )
            order_items.append(order_item)
            
            # Update product stock
            product.stock -= item_data.quantity
        
        # Create order
        db_order = Order(
            user_id=user_id,
            order_number=order_number,
            total_amount=total_amount,
            status="pending",
            notes=order_data.notes
        )
        
        db_order.items = order_items
        
        db.add(db_order)
        db.commit()
        db.refresh(db_order)
        return db_order
    
    async def update_order_status(self, db: Session, order_id: int, status: str):
        """Update order status"""
        db_order = db.query(Order).filter(Order.id == order_id).first()
        if not db_order:
            return None
        
        db_order.status = status
        if status == "delivered":
            db_order.delivered_at = datetime.utcnow()
        
        db.add(db_order)
        db.commit()
        db.refresh(db_order)
        return db_order
    
    async def cancel_order(self, db: Session, order_id: int):
        """Cancel order and restore stock"""
        db_order = db.query(Order).filter(Order.id == order_id).first()
        if not db_order:
            return False
        
        if db_order.status in ["shipped", "delivered"]:
            return False
        
        # Restore product stock
        for item in db_order.items:
            product = db.query(Product).filter(
                Product.id == item.product_id
            ).first()
            if product:
                product.stock += item.quantity
        
        db_order.status = "cancelled"
        db.add(db_order)
        db.commit()
        return True
