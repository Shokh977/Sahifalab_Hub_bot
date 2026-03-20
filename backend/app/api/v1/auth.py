from fastapi import APIRouter, HTTPException, Header
from typing import Optional
import os
from datetime import datetime, UTC
from supabase import create_client

from app.services.auth_service import (
    TelegramAuthData,
    verify_telegram_auth,
    create_access_token,
    decode_token,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

@router.post("/telegram")
async def telegram_login(data: TelegramAuthData):
    """
    Authenticate user with Telegram.
    
    The mobile app sends the Telegram login data.
    We verify it's authentic, create/update user in database,
    and return a JWT token.
    """
    
    # 1. Verify the data came from Telegram
    if not verify_telegram_auth(data, BOT_TOKEN):
        raise HTTPException(
            status_code=401,
            detail="Invalid Telegram authentication"
        )
    
    # 2. Check if user exists in Supabase
    try:
        response = supabase.table("profiles").select("*").eq(
            "telegram_id", data.id
        ).execute()
        
        user_exists = len(response.data) > 0
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    
    # 3. Create or update user
    try:
        if not user_exists:
            # Create new user
            supabase.table("profiles").insert({
                "telegram_id": data.id,
                "first_name": data.first_name,
                "username": data.username,
                "photo_url": data.photo_url,
                "app_created_at": datetime.now(UTC).isoformat(),
                "app_last_login": datetime.now(UTC).isoformat(),
            }).execute()
        else:
            # Update last login
            supabase.table("profiles").update({
                "app_last_login": datetime.now(UTC).isoformat(),
            }).eq("telegram_id", data.id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")
    
    # 4. Generate JWT token
    token_data = create_access_token(data.id)
    
    return {
        "success": True,
        "telegram_id": data.id,
        "first_name": data.first_name,
        **token_data,
    }

@router.get("/me")
async def get_current_user(authorization: str = Header(None)):
    """
    Get current user info from JWT token.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    # Extract token from "Bearer <token>"
    parts = authorization.split()
    if len(parts) != 2 or parts[0] != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    
    token = parts[1]
    telegram_id = decode_token(token)
    
    if not telegram_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    # Get user from database
    try:
        response = supabase.table("profiles").select("*").eq(
            "telegram_id", telegram_id
        ).execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        user = response.data[0]
        
        # Return user data (exclude sensitive fields)
        return {
            "telegram_id": user.get("telegram_id"),
            "first_name": user.get("first_name"),
            "username": user.get("username"),
            "photo_url": user.get("photo_url"),
            "level": user.get("level", 1),
            "xp": user.get("xp", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch user: {str(e)}")

@router.post("/logout")
async def logout(authorization: str = Header(None)):
    """
    Logout user (client should discard token).
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    return {"success": True, "message": "Logged out"}
