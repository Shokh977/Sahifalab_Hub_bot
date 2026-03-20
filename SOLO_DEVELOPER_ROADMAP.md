# Solo Developer Roadmap - SAHIFALAB Native App

**Timeline:** 5-6 months working part-time (10-15 hrs/week)  
**Or:** 2-3 months full-time development

---

## PHASE 1: Backend Setup (1-2 weeks) ⭐ START HERE

### Week 1: Add Telegram Authentication to Backend

**Tasks:**
- [ ] Add `/auth/telegram` endpoint to FastAPI
- [ ] Add JWT token generation
- [ ] Add user sync to Supabase
- [ ] Test with Postman/Insomnia
- [ ] Deploy to Railway

**Effort:** 2-3 days
**Files to modify:** `backend/app/main.py`, `backend/core/config.py`

---

## PHASE 2: React Native Setup (2-3 weeks)

### Week 2-3: Create React Native App

**Tasks:**
- [ ] Initialize Expo project
- [ ] Setup navigation
- [ ] Create login screen with Telegram
- [ ] Setup API client
- [ ] Test authentication flow

**Effort:** 5-7 days
**New folder:** `mobile/`

---

## PHASE 3: Core Features (8-10 weeks)

### Week 4: Home Dashboard
- [ ] Dashboard screen
- [ ] Book listing
- [ ] Progress tracker

### Week 5-6: Browsing & Cart
- [ ] Books/courses detail
- [ ] Search & filter
- [ ] Shopping cart

### Week 7-8: Learning Features
- [ ] Quiz system
- [ ] Progress tracking
- [ ] Certificates

### Week 9: Payments & Profile
- [ ] Payment integration
- [ ] User profile
- [ ] Settings

### Week 10: Polish & Testing
- [ ] Bug fixes
- [ ] Performance optimization
- [ ] UI polish

---

## PHASE 4: App Store Submission (3 weeks)

### Week 11-12: Prepare for Release
- [ ] TestFlight build (iOS)
- [ ] Android signed APK
- [ ] Screenshots & descriptions
- [ ] Privacy policy

### Week 13: Submit & Monitor
- [ ] Submit to App Store
- [ ] Submit to Google Play
- [ ] Monitor reviews
- [ ] Fix issues

---

## REALISTIC SOLO TIMELINE

```
Part-time (10 hrs/week):     6 months
Part-time (15 hrs/week):     4 months
Full-time:                   2 months

Recommended: 12-15 hrs/week = 4 months
```

---

## SOLO DEVELOPER TIPS

### 1. Focus on MVP First
- ✅ Login with Telegram
- ✅ Browse courses
- ✅ Track progress
- ✅ Buy course
- ❌ Live chat (add later)
- ❌ Video streaming (add later)
- ❌ Advanced analytics (add later)

### 2. Reuse Your Existing Code
- Your web frontend is ~60% done
- Copy components to React Native (with tweaks)
- Reuse API calls
- Same database = less work

### 3. Automate Everything
- Use EAS Build (Expo) - auto builds for iOS/Android
- Use GitHub Actions for CI/CD
- No need to manage certificates yourself

### 4. Use Existing Tools
- Expo Snack (test code online)
- Expo Go app (test on device)
- Firebase (free push notifications)
- Supabase (you're already using)

### 5. Work in Sprints
- Week sprints: 1 feature per week
- Daily commits to GitHub
- Test on real device daily
- Deploy to TestFlight weekly

---

## MUST-HAVE TOOLS (FREE/CHEAP)

```
Development:
✅ VS Code (free)
✅ Expo CLI (free)
✅ Android Emulator (free)
✅ Xcode (free on macOS)

Testing:
✅ Expo Go (free)
✅ TestFlight (free)
✅ Android device (if you have one)

Deployment:
✅ EAS Build (free for public projects)
✅ Railway (you already use)
✅ Supabase (you already use)

Accounts (one-time):
💲 Apple Developer: $99/year
💲 Google Play: $25 (one-time)

Total: ~$130-150 year 1
```

---

## STARTING NOW: PHASE 1 - BACKEND AUTH

Let's build the Telegram authentication endpoint right now.

### Step 1: Update Backend Dependencies

Add to `backend/requirements.txt`:
```
PyJWT>=2.8.0
python-telegram-bot>=21.0
```

### Step 2: Create Auth Module

File: `backend/app/services/auth_service.py`

```python
import hashlib
import hmac
import os
from datetime import datetime, UTC, timedelta
from typing import Optional
import jwt
from pydantic import BaseModel

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

class TelegramAuthData(BaseModel):
    """Data from Telegram login widget"""
    id: int
    first_name: str
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str

def verify_telegram_auth(data: TelegramAuthData, bot_token: str) -> bool:
    """
    Verify that the login data really came from Telegram.
    
    Telegram signs the data with your bot token.
    """
    # Create the data check string in alphabetical order
    data_dict = data.dict(exclude={"hash"})
    check_string = "\n".join(
        f"{key}={value}" 
        for key, value in sorted(data_dict.items())
    )
    
    # Create the secret key hash
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    
    # Compute HMAC-SHA256
    computed_hash = hmac.new(
        secret_key,
        check_string.encode(),
        hashlib.sha256
    ).hexdigest()
    
    # Verify the hash matches
    if computed_hash != data.hash:
        return False
    
    # Check auth date (not older than 24 hours)
    current_time = datetime.now(UTC).timestamp()
    if current_time - data.auth_date > 86400:
        return False
    
    return True

def create_access_token(telegram_id: int) -> dict:
    """
    Create JWT token for user.
    """
    expire = datetime.now(UTC) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    
    payload = {
        "sub": str(telegram_id),
        "exp": expire,
        "iat": datetime.now(UTC),
    }
    
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_DAYS * 86400,
    }

def decode_token(token: str) -> Optional[int]:
    """
    Decode JWT token and return telegram_id.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        telegram_id = int(payload.get("sub"))
        return telegram_id
    except:
        return None
```

### Step 3: Create Auth Endpoints

File: `backend/app/api/v1/auth.py`

```python
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
import os
from datetime import datetime, UTC
import httpx
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
```

### Step 4: Add Routes to Main App

Update `backend/app/main.py`:

```python
# Add this to your existing imports
from app.api.v1 import auth

# Then in your app setup, add this route inclusion:
app.include_router(auth.router)
```

### Step 5: Update Environment Variables

Add to `.env`:
```
SECRET_KEY=your-super-secret-key-change-this-to-something-random
```

Generate a secure key:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Step 6: Test the Endpoints

Create `test_auth.py`:

```python
import httpx
import asyncio
from datetime import datetime, UTC
import hashlib
import hmac
import os

# Load your bot token
BOT_TOKEN = "your-bot-token-here"

async def test_telegram_auth():
    """Test the /auth/telegram endpoint"""
    
    # Simulate Telegram login data
    auth_data = {
        "id": 123456789,
        "first_name": "Test",
        "username": "testuser",
        "auth_date": int(datetime.now(UTC).timestamp()),
    }
    
    # Create hash (same way Telegram does)
    check_string = "\n".join(
        f"{key}={value}" 
        for key, value in sorted(auth_data.items())
    )
    secret_key = hashlib.sha256(BOT_TOKEN.encode()).digest()
    auth_data["hash"] = hmac.new(
        secret_key,
        check_string.encode(),
        hashlib.sha256
    ).hexdigest()
    
    # Send to backend
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "http://localhost:8000/api/v1/auth/telegram",
            json=auth_data,
        )
        print("Status:", response.status_code)
        print("Response:", response.json())

# Run test
asyncio.run(test_telegram_auth())
```

---

## NEXT STEPS

1. **Right now:** Add auth files to your backend
2. **Test locally:** Run the test script above
3. **Deploy:** Push to Railway
4. **Verify:** Test the endpoints with Postman

Once backend is done, we move to Phase 2: React Native mobile app.

**Ready to start?**
