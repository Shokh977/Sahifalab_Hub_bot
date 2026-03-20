# Backend Integration Guide - Error Handling & Rate Limiting

## Quick Start: Integrating Enhancements

### Step 1: Add Rate Limiter Middleware to main.py

```python
# In backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.rate_limiter import rate_limit_middleware
from app.api.v1 import router as api_v1_router

app = FastAPI(title="SAHIFALAB API")

# Add rate limiting middleware BEFORE other middleware
app.middleware("http")(rate_limit_middleware)

# Add CORS and other middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(api_v1_router, prefix="/api/v1")
```

### Step 2: Update Endpoints with Error Handling

**Example 1: Simple Endpoint Update**

```python
# BEFORE
from fastapi import APIRouter, HTTPException, status
from sqlalchemy.orm import Session

@router.get("/{user_id}")
async def get_user(user_id: int, db: Session = Depends(get_db)):
    db_user = await user_service.get_user(db, user_id)
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return db_user

# AFTER
from fastapi import APIRouter
from sqlalchemy.orm import Session
from app.utils.error_handler import NotFoundError, success_response

@router.get("/{user_id}")
async def get_user(user_id: int, db: Session = Depends(get_db)):
    db_user = await user_service.get_user(db, user_id)
    if not db_user:
        raise NotFoundError(f"User with ID {user_id} not found")
    return success_response(db_user)
```

**Example 2: Endpoint with Validation**

```python
# BEFORE
@router.post("/")
async def create_user(user_data: UserCreate, db: Session = Depends(get_db)):
    if not user_data.name or len(user_data.name) < 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Name must be at least 2 characters"
        )
    return await user_service.create_user(db, user_data)

# AFTER
from app.utils.validators import InputValidator, DataSanitizer

@router.post("/")
async def create_user(user_data: UserCreate, db: Session = Depends(get_db)):
    validator = InputValidator()
    validator.validate_string(user_data.name, "name", min_length=2, max_length=100)
    validator.validate_email(user_data.email)
    
    sanitizer = DataSanitizer()
    clean_data = sanitizer.sanitize_dict({
        "name": user_data.name,
        "email": user_data.email
    })
    
    return success_response(await user_service.create_user(db, clean_data))
```

### Step 3: Add Logging to Key Endpoints

```python
from app.utils.logger import request_logger
import time
import uuid

@router.get("/books")
async def get_books(db: Session = Depends(get_db)):
    request_id = str(uuid.uuid4())
    start_time = time.time()
    
    try:
        request_logger.log_request("GET", "/api/v1/books", request_id=request_id)
        
        # Your endpoint logic
        books = await book_service.get_books(db)
        
        duration_ms = (time.time() - start_time) * 1000
        request_logger.log_response(
            "GET", "/api/v1/books", 200, duration_ms, 
            request_id=request_id
        )
        
        return success_response(books)
    except Exception as e:
        duration_ms = (time.time() - start_time) * 1000
        request_logger.log_error(e, "/api/v1/books", request_id=request_id)
        raise
```

---

## Error Handler Usage Reference

### Available Error Classes

```python
from app.utils.error_handler import (
    ValidationError,
    NotFoundError, 
    UnauthorizedError,
    ForbiddenError,
    ConflictError,
    RateLimitError,
    ServerError,
    success_response
)

# ValidationError - 400 Bad Request
raise ValidationError("Invalid input", details={"field": "error message"})

# NotFoundError - 404 Not Found
raise NotFoundError("Resource not found")

# UnauthorizedError - 401 Unauthorized
raise UnauthorizedError("Invalid credentials")

# ForbiddenError - 403 Forbidden
raise ForbiddenError("You don't have permission")

# ConflictError - 409 Conflict
raise ConflictError("Resource already exists")

# RateLimitError - 429 Too Many Requests
raise RateLimitError("Too many requests")

# ServerError - 500 Internal Server Error
raise ServerError("Something went wrong")

# success_response - Wrap successful data
return success_response(data={"user_id": 123})
```

---

## Input Validator Reference

### Validation Methods

```python
from app.utils.validators import InputValidator, DataSanitizer

validator = InputValidator()

# String validation
validator.validate_string(value, "field_name", min_length=1, max_length=100)

# Email validation
validator.validate_email("user@example.com")

# Integer validation
validator.validate_integer(value, min_val=0, max_val=100)

# List validation
validator.validate_list(value, item_type=str, min_length=1, max_length=10)

# HTML sanitization
clean_html = validator.sanitize_html("<p>Hello</p><script>alert('xss')</script>")

# Dictionary sanitization
sanitizer = DataSanitizer()
clean_dict = sanitizer.sanitize_dict({
    "name": "John Doe",
    "bio": "<img src=x onerror=alert('xss')>",
})
clean_dict = sanitizer.remove_null_values(clean_dict)
```

---

## Integration Priorities

### High Priority (Do First)
1. ✅ Rate limiter in main.py
2. Add error handlers to `api/v1/endpoints/users.py`
3. Add error handlers to `api/v1/endpoints/books.py`
4. Add error handlers to `api/v1/endpoints/quizzes.py`

### Medium Priority (This Week)
5. Add input validation to all POST/PUT endpoints
6. Add logging to critical endpoints
7. Test all error scenarios
8. Add admin commands to bot

### Low Priority (Next Week)
9. Add logging to all endpoints
10. Implement log rotation
11. Create admin dashboard for logs

---

## Testing the Integration

### Test Error Response Format
```bash
# Should return standardized error format
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name": "a"}'  # Too short, should fail validation
```

Expected response:
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Name must be at least 2 characters",
    "details": {"field": "name"}
  },
  "timestamp": "2024-03-21T10:30:45.123Z",
  "path": "/api/v1/users"
}
```

### Test Rate Limiting
```bash
# Make 101 requests in quick succession (should get 429 on 101st)
for i in {1..101}; do
  curl http://localhost:8000/api/v1/books
done
```

On 101st request:
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "remaining": {
      "remaining_per_minute": 0,
      "remaining_per_hour": 999,
      "remaining_per_day": 9999
    }
  }
}
```

### Check Logs
```bash
# View live logs
tail -f logs/app.log

# Search for errors
grep "ERROR" logs/app.log | jq .

# Search by status code
grep "status_code.*500" logs/app.log
```

---

## Troubleshooting

### "Module not found" error
```python
# Make sure imports are correct
from app.utils.error_handler import NotFoundError  # ✅ Correct
from utils.error_handler import NotFoundError      # ❌ Wrong
```

### Rate limiter not working
Check that middleware is added BEFORE route handlers:
```python
# In main.py, this must come BEFORE include_router
app.middleware("http")(rate_limit_middleware)
app.include_router(api_v1_router)
```

### Logs not being created
Make sure `logs/` directory exists:
```bash
mkdir -p logs/
```

---

## Files Modified/Created

### Created Files
- `backend/app/utils/error_handler.py` - Error classes and responses
- `backend/app/utils/validators.py` - Input validation utilities  
- `backend/app/utils/logger.py` - Structured logging
- `backend/app/middleware/rate_limiter.py` - Rate limiting middleware

### Modified Files
- `frontend/src/App.tsx` - Added ErrorBoundary and ToastContainer
- `frontend/src/services/apiService.ts` - Added toast error notifications
- `frontend/tailwind.config.js` - Added animations

### No changes needed yet
- `backend/app/main.py` - Add imports and middleware (next step)
- All endpoint files - Add error handlers (next step)

---

## Next Steps

1. ✅ All utility files created
2. ✅ Frontend error handling complete
3. ⏳ Integrate rate limiter in main.py
4. ⏳ Update endpoints with error handlers
5. ⏳ Add input validation to endpoints
6. ⏳ Add logging to critical endpoints
7. ⏳ Test all error scenarios

Ready to proceed with integration! 🚀
