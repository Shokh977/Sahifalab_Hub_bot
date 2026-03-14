from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.schemas import CartItemCreate, CartResponse
from app.services.cart_service import CartService

router = APIRouter()
cart_service = CartService()

@router.get("/{user_id}", response_model=CartResponse)
async def get_cart(user_id: int, db: Session = Depends(get_db)):
    """Get user's cart"""
    cart = await cart_service.get_or_create_cart(db, user_id)
    if not cart:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Cart not found"
        )
    return cart

@router.post("/{user_id}", response_model=CartResponse)
async def add_to_cart(
    user_id: int,
    item: CartItemCreate,
    db: Session = Depends(get_db)
):
    """Add item to cart"""
    cart = await cart_service.add_to_cart(db, user_id, item)
    if not cart:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to add item to cart"
        )
    return cart

@router.delete("/{user_id}/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_from_cart(
    user_id: int,
    product_id: int,
    db: Session = Depends(get_db)
):
    """Remove item from cart"""
    success = await cart_service.remove_from_cart(db, user_id, product_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to remove item from cart"
        )
    return None

@router.delete("/{user_id}")
async def clear_cart(user_id: int, db: Session = Depends(get_db)):
    """Clear user's cart"""
    success = await cart_service.clear_cart(db, user_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to clear cart"
        )
    return {"message": "Cart cleared successfully"}
