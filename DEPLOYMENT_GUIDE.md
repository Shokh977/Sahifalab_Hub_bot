# DEPLOYMENT GUIDE — XP Farming Fix

## Pre-Deployment Checklist

- [x] Backend code updated (`models.py`, `schemas.py`, `quizzes.py`)
- [x] Frontend code updated (`QuizPage.tsx`)
- [x] Database migration created (`003_user_quiz_completion.py`)
- [x] No TypeScript/Python errors
- [x] Documentation complete

---

## Step 1: Database Migration

Run the Alembic migration to create the `user_quiz_completion` table:

```bash
cd backend
alembic upgrade head
```

**Or manually (PostgreSQL):**
```sql
CREATE TABLE user_quiz_completion (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES "user"(id),
  quiz_id INTEGER REFERENCES quiz(id) NOT NULL,
  telegram_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  total INTEGER NOT NULL,
  percentage FLOAT NOT NULL,
  completed_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_user_quiz_completion UNIQUE(telegram_id, quiz_id)
);

CREATE INDEX ix_user_quiz_completion_user_id ON user_quiz_completion(user_id);
CREATE INDEX ix_user_quiz_completion_quiz_id ON user_quiz_completion(quiz_id);
CREATE INDEX ix_user_quiz_completion_telegram_id ON user_quiz_completion(telegram_id);
```

**Verify:**
```sql
SELECT * FROM user_quiz_completion LIMIT 1;  -- Should return empty table, no errors
```

---

## Step 2: Deploy Backend

Deploy the updated backend code with these changes:

### Files Modified:
1. `backend/app/models/models.py`
   - Added `UniqueConstraint` to imports
   - Added `UserQuizCompletion` model class

2. `backend/app/schemas/schemas.py`
   - Added `is_first_attempt: bool` field to `QuizVerifyResponse`

3. `backend/app/api/v1/endpoints/quizzes.py`
   - Added `UserQuizCompletion` import
   - Added `IntegrityError` import
   - Modified `verify_quiz()` function to:
     - Query existing completion record
     - Create new record on first attempt
     - Return `is_first_attempt` flag

### Deployment:
```bash
# If using Docker
docker-compose up --build

# If using traditional deployment
pip install -r backend/requirements.txt
python -m uvicorn app.main:app --reload
```

---

## Step 3: Deploy Frontend

Deploy the updated frontend code with these changes:

### Files Modified:
1. `frontend/src/pages/QuizPage.tsx`
   - Updated `VerifyResult` interface to include `is_first_attempt: boolean`
   - Modified `handleFinish()` callback to check flag before calling `addQuizXP()`
   - Added info banner in `QuizResults` component for retake scenarios

### Deployment:
```bash
cd frontend
npm install
npm run build
# Serve dist/ folder or deploy to CDN
```

---

## Step 4: Testing

### Manual Tests (Do These!)

#### Test 1: First Quiz Completion
1. Open app as new user
2. Start Quiz A
3. Complete with 80%+ score
4. **Expected**: 
   - ✅ See "Congratulations" message (no retake message)
   - ✅ XP awarded (check profile)
   - ✅ Can see certificate

#### Test 2: Retake Same Quiz
1. After completing Quiz A, click "Retry"
2. Complete again with different score (90%)
3. **Expected**:
   - ✅ See "ℹ️ Qayta urinish: Bu viktorinani allaqachon tugatgansiz. XP berdirilmadi."
   - ✅ NO XP awarded (profile XP unchanged)
   - ✅ Can still see results (score, percentage)

#### Test 3: Different Quiz
1. After Quiz A + retake, go back to quiz list
2. Start different Quiz B
3. Complete with 75%
4. **Expected**:
   - ✅ See normal "Congratulations" (no retake message)
   - ✅ XP awarded for new quiz
   - ✅ Profile shows increased XP

#### Test 4: Admin Panel
1. Go to Admin → Gamification Stats
2. Find user who completed multiple quizzes
3. **Expected**:
   - ✅ `quizzes_completed` counter increased for each unique quiz (not for retakes)
   - ✅ Total XP matches: (Quiz A score) + (Quiz B score)
   - ✅ Level calculation correct

### Automated Tests (If Available)
```bash
# Backend tests
cd backend
pytest -v

# Frontend tests (if set up)
cd frontend
npm test
```

---

## Step 5: Verify Database

Check that completion records are being created:

```sql
-- Count completions by user
SELECT telegram_id, COUNT(*) as quizzes_completed 
FROM user_quiz_completion 
GROUP BY telegram_id;

-- Check specific user
SELECT * FROM user_quiz_completion 
WHERE telegram_id = 123456 
ORDER BY completed_at DESC;

-- Verify unique constraint (should be no duplicates)
SELECT telegram_id, quiz_id, COUNT(*) 
FROM user_quiz_completion 
GROUP BY telegram_id, quiz_id 
HAVING COUNT(*) > 1;  -- Should return nothing
```

---

## Rollback Plan

If something goes wrong:

### Option 1: Revert Code Only
```bash
# Backend
git checkout HEAD -- backend/app/models/models.py
git checkout HEAD -- backend/app/schemas/schemas.py
git checkout HEAD -- backend/app/api/v1/endpoints/quizzes.py

# Frontend
git checkout HEAD -- frontend/src/pages/QuizPage.tsx

# Redeploy
```

### Option 2: Revert Database
```bash
# In PostgreSQL
DROP TABLE user_quiz_completion CASCADE;

# Or via Alembic
cd backend
alembic downgrade 002_book_purchase
```

---

## Monitoring

After deployment, watch for:

1. **Error Logs**: Any SQL errors from migration
   ```
   ERROR: duplicate key value violates unique constraint
   → Indicates race condition handling (expected, should still work)
   ```

2. **User XP Progression**: Should slow down significantly
   - Monitor `profiles` table: `total_xp` growth should decelerate
   - Users completing quizzes get XP only once per quiz (not multiple times)

3. **API Response Times**: Should be +1-2ms slower (negligible)
   ```
   Monitor: /api/quizzes/{quiz_id}/verify response times
   ```

4. **Database Growth**: `user_quiz_completion` table grows slowly
   ```sql
   -- Check table size
   SELECT pg_size_pretty(pg_total_relation_size('user_quiz_completion'));
   ```

---

## Support & Documentation

### For Developers:
- See `XP_FARMING_FIX.md` for detailed technical documentation
- See `XP_FARMING_FIX_QUICK_REFERENCE.md` for quick overview

### For Users:
- Message appears in Uzbek: "ℹ️ Qayta urinish: Bu viktorinani allaqachon tugatgansiz. XP berdirilmadi."
- Translation: "ℹ️ Retake: You've already completed this quiz. No XP awarded."
- This is shown only on retake attempts, not on first completion

---

## Success Criteria

✅ **Deployment is successful if:**

1. Migration runs without errors
2. `user_quiz_completion` table exists with proper schema
3. First quiz completion: user gets XP, no message
4. Second attempt of same quiz: user gets 0 XP, sees retake message
5. Different quiz: user gets XP normally
6. Admin panel shows correct stats
7. No errors in logs

---

## Questions?

**Common Issues:**

**Q: "Migration failed with unique constraint error"**
A: Likely data inconsistency. Check if there are duplicate quiz attempts already in database. Safe to ignore if no previous system tracked this.

**Q: "Users can't complete any quiz after deployment"**
A: Check if `user_quiz_completion` table creation failed. Verify migration ran: `SELECT * FROM schema_migrations;`

**Q: "XP not being awarded anymore"**
A: Frontend might not have deployed. Check browser console for errors. Verify `is_first_attempt` is in API response.

**Q: "Retake message shows for first attempt"**
A: Database migration didn't run properly. Verify table exists: `SELECT * FROM user_quiz_completion LIMIT 1;`

---

**Status**: 🚀 **Ready for Deployment**
