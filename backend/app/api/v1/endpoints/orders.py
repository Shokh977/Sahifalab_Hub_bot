from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.schemas import OrderCreate, OrderResponse
from app.services.order_service import OrderService

router = APIRouter()
order_service = OrderService()

@router.post("/", response_model=OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(order_data: OrderCreate, db: Session = Depends(get_db)):
    """Create a new order"""
    # This should be protected and get user from JWT token
    # For now, we'll need user_id passed in the request
    return await order_service.create_order(db, order_data)

@router.get("/{order_id}", response_model=OrderResponse)
async def get_order(order_id: int, db: Session = Depends(get_db)):
    """Get order by ID"""
    order = await order_service.get_order(db, order_id)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    return order

@router.get("/", response_model=list[OrderResponse])
async def get_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """Get all orders with pagination"""
    return await order_service.get_orders(db, skip, limit)

@router.put("/{order_id}", response_model=OrderResponse)
async def update_order_status(
    order_id: int,
    status: str = Query(..., description="New status"),
    db: Session = Depends(get_db)
):
    """Update order status"""
    order = await order_service.update_order_status(db, order_id, status)
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    return order

@router.delete("/{order_id}", status_code=status.HTTP_204_NO_CONTENT)
async def cancel_order(order_id: int, db: Session = Depends(get_db)):
    """Cancel order"""
    success = await order_service.cancel_order(db, order_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    return None
