# 📐 Architecture - Enhancement Components

## Component Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              React App (App.tsx)                          │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  ✅ ErrorBoundary (catches React errors)                 │   │
│  │     └─ Fallback UI with retry options                    │   │
│  │                                                            │   │
│  │  ✅ ToastContainer (global notifications)                │   │
│  │     ├─ Success (🟢 green)                                │   │
│  │     ├─ Error (🔴 red)                                    │   │
│  │     ├─ Info (🔵 blue)                                    │   │
│  │     └─ Warning (🟡 yellow)                               │   │
│  │                                                            │   │
│  │  🔄 Pages (Quiz, Books, etc.)                            │   │
│  │     └─ API Service → fetch data                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           │ HTTP Requests                        │
│                           ↓                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │         apiService.ts (Axios Instance)                   │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  Request Interceptor:                                    │   │
│  │  ├─ Add auth token to headers                            │   │
│  │  └─ Log request                                          │   │
│  │                                                            │   │
│  │  Response Interceptor:                                   │   │
│  │  ├─ ✅ Success → return data, maybe show toast          │   │
│  │  └─ ❌ Error → showToast() for user feedback             │   │
│  │                                                            │   │
│  │  showToast() function:                                   │   │
│  │  └─ Broadcasts to all ToastContainer listeners           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                           │                                      │
│                           │ HTTP/HTTPS                          │
│                           ↓                                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    main.py                                │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │  FastAPI App Setup                                        │   │
│  │  ├─ ✅ Rate Limiter Middleware (first!)                  │   │
│  │  │  └─ Tracks requests by IP                             │   │
│  │  │     └─ 100/min, 1000/hour, 10000/day                 │   │
│  │  │                                                         │   │
│  │  ├─ CORS Middleware                                       │   │
│  │  ├─ Other middleware...                                   │   │
│  │  └─ Routes (api_v1_router)                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │           │         │              │                   │
│         ↓           ↓         ↓              ↓                   │
│  ┌──────────┬──────────┬───────────┬──────────────────────┐    │
│  │ Users    │ Books    │ Quizzes   │ Other Endpoints      │    │
│  │ Endpoint │ Endpoint │ Endpoint  │                      │    │
│  └──────────┴──────────┴───────────┴──────────────────────┘    │
│         │           │         │              │                   │
│         └───────────┴─────────┴──────────────┘                  │
│                     │                                             │
│                     ↓                                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │   Endpoint Handler (e.g., users.py, books.py)           │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                            │   │
│  │  1. Receive request                                       │   │
│  │                                                            │   │
│  │  2. ✅ Validate Input                                    │   │
│  │     ├─ InputValidator.validate_string()                  │   │
│  │     ├─ InputValidator.validate_email()                   │   │
│  │     ├─ Check for SQL injection patterns                  │   │
│  │     ├─ Check for XSS patterns                            │   │
│  │     └─ Raise ValidationError if invalid                  │   │
│  │                                                            │   │
│  │  3. ✅ Sanitize Input                                    │   │
│  │     └─ DataSanitizer.sanitize_dict()                     │   │
│  │                                                            │   │
│  │  4. Process (call service, database, etc.)               │   │
│  │                                                            │   │
│  │  5. ✅ Return Response                                   │   │
│  │     └─ success_response(data)                            │   │
│  │                                                            │   │
│  │  6. ✅ Log Request/Response                              │   │
│  │     ├─ request_logger.log_request()                      │   │
│  │     └─ request_logger.log_response()                     │   │
│  │                                                            │   │
│  │  Error Handling:                                          │   │
│  │  ├─ ValidationError → 400                                │   │
│  │  ├─ NotFoundError → 404                                  │   │
│  │  ├─ UnauthorizedError → 401                              │   │
│  │  ├─ ForbiddenError → 403                                 │   │
│  │  ├─ ConflictError → 409                                  │   │
│  │  ├─ RateLimitError → 429                                 │   │
│  │  └─ ServerError → 500                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │              │                                         │
│         │ All errors   │ All responses → Standardized JSON      │
│         │ logged       │                                         │
│         ↓              ↓                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │   Logging System (logger.py)                             │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                            │   │
│  │  ✅ RequestLogger                                        │   │
│  │  ├─ log_request(method, endpoint, user_id)              │   │
│  │  ├─ log_response(status, duration_ms)                    │   │
│  │  └─ log_error(exception)                                 │   │
│  │                                                            │   │
│  │  JSON Format:                                             │   │
│  │  {                                                         │   │
│  │    "timestamp": "2024-03-21T10:30:45Z",                  │   │
│  │    "level": "INFO",                                       │   │
│  │    "message": "Response: 200 GET /api/v1/books",         │   │
│  │    "status_code": 200,                                   │   │
│  │    "duration_ms": 45.23,                                 │   │
│  │    "user_id": 12345,                                     │   │
│  │    "request_id": "req_abc123"                            │   │
│  │  }                                                         │   │
│  │                                                            │   │
│  │  Output:                                                  │   │
│  │  ├─ Console (stdout)                                      │   │
│  │  └─ File (logs/app.log)                                  │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                        │
│         ↓                                                        │
│  Database (Supabase PostgreSQL)                                 │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary: What's New?

**Frontend:**
- ✅ ErrorBoundary catches React errors
- ✅ ToastContainer shows notifications
- ✅ apiService auto-shows error toasts
- ✅ Smooth animations

**Backend:**
- ✅ Rate limiter prevents abuse (100/min)
- ✅ InputValidator catches SQL injection & XSS
- ✅ StandardErrorHandler for consistent responses
- ✅ StructuredLogger for JSON logs

**Result:** More robust, secure, user-friendly app! 🚀
