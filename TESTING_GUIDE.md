# Testing Guide - SAHIFALAB Enhancements

## Frontend Testing

### Test 1: Error Boundary
**Purpose:** Verify error boundary catches and displays errors gracefully

1. Open app in browser
2. Open browser console (F12)
3. Throw an error manually:
   ```javascript
   throw new Error("Test error");
   ```
4. **Expected:** Error boundary displays fallback UI with error message
5. Click "Refresh Page" or "Go Back"
6. **Expected:** App recovers and works normally

### Test 2: Toast Notifications

#### Test 2A: Success Toast
1. Go to any page and trigger a success action
2. **Expected:** Green toast appears bottom-right for 3 seconds
3. **Expected:** Toast has ✅ icon and message
4. **Expected:** Toast auto-disappears

#### Test 2B: Error Toast
1. Try to load data that doesn't exist
2. **Expected:** Red toast appears with error message
3. **Expected:** Toast has ❌ icon
4. **Expected:** User-friendly error message shown

#### Test 2C: Manual Toast Test
```javascript
import { showToast } from '../components/ErrorBoundary'

// In browser console:
showToast('Test success message', 'success')
showToast('Test error message', 'error', 4000)
showToast('Test info message', 'info')
showToast('Test warning message', 'warning')
```

### Test 3: Animations
1. Open DevTools (F12)
2. Trigger a toast notification
3. **Expected:** Toast slides in from right (smooth 0.3s animation)
4. **Expected:** Close button visible
5. **Expected:** Toast disappears smoothly (fade out)

### Test 4: API Error Handling
1. Stop backend server
2. Try to load data from any page
3. **Expected:** Toast shows "Failed to fetch" or similar error
4. **Expected:** No console errors
5. **Expected:** App remains responsive

---

## Backend Testing

### Setup
```bash
# Navigate to backend folder
cd backend

# Install dependencies (if needed)
pip install -r requirements.txt

# Start backend
python app/main.py
```

### Test 5: Input Validation

**Test 5A: String Validation**
```bash
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": 123,
    "name": "a",
    "username": "user"
  }'
```
**Expected:** 400 error with message "Name must be at least 2 characters"

**Test 5B: Email Validation**
```bash
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": 123,
    "name": "John Doe",
    "email": "invalid-email"
  }'
```
**Expected:** 400 error with message about invalid email

**Test 5C: SQL Injection Detection**
```bash
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": 123,
    "name": "admin'; DROP TABLE users; --",
    "username": "user"
  }'
```
**Expected:** 400 error with message about suspicious input

**Test 5D: XSS Detection**
```bash
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": 123,
    "name": "John <script>alert(1)</script>",
    "username": "user"
  }'
```
**Expected:** 400 error with message about suspicious input

### Test 6: Rate Limiting

**Test 6A: Verify Rate Limit Headers**
```bash
# Make a single request
curl -v http://localhost:8000/api/v1/books 2>&1 | grep X-RateLimit
```
**Expected Output:**
```
X-RateLimit-Remaining-Minute: 99
X-RateLimit-Remaining-Hour: 999
X-RateLimit-Remaining-Day: 9999
```

**Test 6B: Hit Rate Limit**
```bash
# Make 101 requests rapidly
for i in {1..101}; do
  echo "Request $i"
  curl -s http://localhost:8000/api/v1/books > /dev/null
done
```
**Expected:** On the 101st request, get 429 error:
```json
{
  "detail": {
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

**Test 6C: Rate Limit Reset**
```bash
# Wait 60 seconds for minute limit to reset
sleep 60

# Should be able to make requests again
curl http://localhost:8000/api/v1/books
```
**Expected:** Success response with X-RateLimit headers

### Test 7: Structured Logging

**Test 7A: Check Log File Exists**
```bash
# From project root
ls -la logs/app.log
```
**Expected:** Log file exists and has recent timestamps

**Test 7B: View Recent Logs**
```bash
# View last 10 lines
tail -n 10 logs/app.log

# View as JSON (pretty printed)
tail -n 1 logs/app.log | jq .
```
**Expected:** Logs are JSON formatted with timestamp, level, message

**Test 7C: Search Logs for Errors**
```bash
# Find all errors
grep "ERROR" logs/app.log | jq .

# Find specific status code
grep "status_code.*404" logs/app.log | jq .

# Find specific endpoint
grep "/api/v1/books" logs/app.log | jq .
```

### Test 8: Error Response Format

**Test 8A: 404 Error Format**
```bash
curl http://localhost:8000/api/v1/users/999999
```
**Expected Response:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "User not found",
    "details": null
  },
  "timestamp": "2024-03-21T10:30:45.123Z",
  "path": "/api/v1/users/999999"
}
```

**Test 8B: Success Response Format**
```bash
curl http://localhost:8000/api/v1/books
```
**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "title": "Book Title",
      ...
    }
  ],
  "timestamp": "2024-03-21T10:30:45.123Z",
  "path": "/api/v1/books"
}
```

---

## Integration Testing

### Test 9: Frontend + Backend Error Handling

1. Start both frontend and backend
2. Go to Quiz or Books page
3. Wait for data to load
4. **Expected:** Data loads successfully, toast shows success
5. Stop backend
6. Refresh page
7. **Expected:** Error toast appears with message
8. **Expected:** Error boundary doesn't trigger (graceful handling)

### Test 10: End-to-End User Flow

1. Open app in browser
2. Go to Books page
3. **Expected:** Books load with skeleton loaders first
4. **Expected:** Toasts show success when loaded
5. Click on a book
6. **Expected:** Book details page loads
7. Go back to previous page
8. **Expected:** Books load instantly from cache
9. Make a request that fails (if possible)
10. **Expected:** Error toast with clear message

---

## Performance Testing

### Test 11: Load Time Impact

**Before Enhancements:**
- Quiz page: 5-7 seconds
- Books page: 5-7 seconds

**After Enhancements:**
- Quiz page: 1-2 seconds (first visit), 0.3 seconds (cached)
- Books page: 1-2 seconds (first visit), 0.3 seconds (cached)

**Test with:**
```bash
# In browser console:
performance.mark('start')
// Load page or trigger API call
performance.mark('end')
performance.measure('myMeasure', 'start', 'end')
console.log(performance.getEntriesByName('myMeasure')[0].duration)
```

### Test 12: Rate Limiter Performance

**Expected:** <5ms overhead per request

**Test with:**
```bash
# Measure request time with rate limiter
time curl http://localhost:8000/api/v1/books
```

---

## Browser DevTools Testing

### Test 13: Network Tab
1. Open DevTools (F12) → Network tab
2. Load a page
3. **Expected:** All requests show "200" or appropriate status
4. **Expected:** No requests show "404" or "500"
5. **Expected:** Response headers include X-RateLimit-*

### Test 14: Console Tab
1. Open DevTools (F12) → Console tab
2. Load a page
3. **Expected:** No red errors
4. **Expected:** API debug logs visible (blue colored logs)
5. Try an action that fails
6. **Expected:** Error logged with full details

### Test 15: Application Tab
1. Open DevTools → Application → Storage → Session Storage
2. Load Quiz or Books page
3. **Expected:** Cache entries visible
4. **Expected:** `quiz_cache` and `kitoblar_cache` present
5. Refresh page
6. **Expected:** Cache is used (instant load)
7. Wait 5 minutes
8. **Expected:** Cache expires and fresh data is loaded

---

## Regression Testing

### Test 16: Existing Features Still Work
- [ ] Quiz functionality works
- [ ] Book purchase works
- [ ] User profile works
- [ ] Admin features work
- [ ] Bot still sends messages
- [ ] XP system still works
- [ ] Certificates still generate
- [ ] Leaderboard still updates
- [ ] Resources page loads
- [ ] AI companion works

### Test 17: No Breaking Changes
- [ ] All routes still respond
- [ ] All endpoints return correct data
- [ ] Database still connected
- [ ] Authentication still works
- [ ] Telegram bot still running
- [ ] Performance still good

---

## Automated Testing (Optional)

### Jest Test Example (Frontend)
```typescript
import { showToast } from '../components/ErrorBoundary'

describe('Toast Notifications', () => {
  it('should show success toast', () => {
    showToast('Test success', 'success')
    // Assert toast appears in DOM
  })
  
  it('should auto-dismiss after 3 seconds', async () => {
    showToast('Test', 'info')
    await new Promise(r => setTimeout(r, 3100))
    // Assert toast is removed
  })
})
```

### PyTest Example (Backend)
```python
def test_validation_error():
    validator = InputValidator()
    with pytest.raises(ValidationError):
        validator.validate_string("a", "name", min_length=2)

def test_rate_limiter():
    limiter = RateLimiter(requests_per_minute=2)
    # Make 2 requests - should succeed
    # Make 3rd request - should fail
```

---

## Troubleshooting

### Issue: Logs directory not found
```bash
# Create logs directory
mkdir -p logs/
```

### Issue: Rate limiter not working
- Check that middleware is added in main.py
- Verify order: middleware before routes
- Check that rate limiter is imported correctly

### Issue: Validation not triggering
- Verify InputValidator is imported
- Check that validate methods are called
- Look at logs for validation errors

### Issue: Toast not showing
- Check that ToastContainer is in App.tsx
- Verify ErrorBoundary is wrapping router
- Check browser console for errors
- Verify apiService is properly configured

---

## Test Checklist

### Frontend
- [ ] Error Boundary catches errors
- [ ] Toast notifications appear
- [ ] Success toasts are green
- [ ] Error toasts are red
- [ ] Toasts auto-dismiss
- [ ] Animations are smooth
- [ ] No console errors
- [ ] Cache working (instant reload)

### Backend
- [ ] Rate limiter headers present
- [ ] Rate limit enforced at 100/min
- [ ] Error responses standardized
- [ ] Validation prevents bad input
- [ ] SQL injection detected
- [ ] XSS detected
- [ ] Logs created in logs/app.log
- [ ] Logs are JSON formatted

### Integration
- [ ] Frontend handles API errors gracefully
- [ ] Users see helpful error messages
- [ ] No data loss on errors
- [ ] Performance acceptable
- [ ] Existing features unbroken

---

## Success Criteria

All tests pass ✅ when:
- ✅ All error boundaries trigger correctly
- ✅ All toasts display and dismiss properly
- ✅ Rate limiter enforces limits
- ✅ Input validation prevents attacks
- ✅ Logs are created and properly formatted
- ✅ Response formats are standardized
- ✅ Performance impact is <10ms
- ✅ No regressions in existing features

---

**Testing Status:** Ready to begin
**Estimated Time:** 2-3 hours
**Difficulty:** Medium
**Documentation:** Complete
