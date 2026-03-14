# Quick Start Guide - SAHIFALAB Telegram Mini App

## 📋 Prerequisites
- Python 3.9+
- Node.js 16+
- PostgreSQL 12+
- Git

## 🚀 Quick Setup (Development)

### 1. Clone & Navigate
```bash
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
```

### 2. Backend Setup

#### 2a. Create Virtual Environment
```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

#### 2b. Install Dependencies
```bash
pip install -r requirements.txt
```

#### 2c. Configure Database
```bash
# Update database URL in backend/.env or app/db/session.py
# Default: postgresql://user:password@localhost:5432/sahifalab
```

#### 2d. Run Migrations
```bash
alembic upgrade head
```

#### 2e. Seed Database with Sample Data
```bash
python -m app.db.seed
```

Output:
```
✅ Database seeded successfully!
  - 4 quotes added
  - 2 quizzes added
  - 4 books added
  - 6 resources added
```

#### 2f. Start Backend Server
```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**API Documentation** (Auto-generated):
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 3. Frontend Setup

#### 3a. Install Dependencies
```bash
cd frontend
npm install
```

#### 3b. Create Environment File
Create `frontend/.env.local`:
```
VITE_API_URL=http://localhost:8000
VITE_BOT_TOKEN=your_bot_token_here
```

#### 3c. Start Development Server
```bash
npm run dev
```

Frontend will be available at: `http://localhost:5173`

### 4. Testing the Features

#### Test 1: Hero Section
```bash
# Make API request
curl http://localhost:8000/api/hero
```

Expected response:
```json
{
  "id": 1,
  "text": "The only way to do great work is to love what you do.",
  "author": "Steve Jobs",
  "quote_type": "quote"
}
```

#### Test 2: Quizzes
```bash
# Get all quizzes
curl http://localhost:8000/api/quizzes

# Get specific quiz with questions
curl http://localhost:8000/api/quizzes/1

# Submit quiz answers
curl -X POST http://localhost:8000/api/quizzes/1/submit \
  -H "Content-Type: application/json" \
  -d '{"answers": [0, 1, 0]}'
```

#### Test 3: Books
```bash
# Get all books
curl http://localhost:8000/api/books

# Get free books
curl "http://localhost:8000/api/books?is_paid=false"

# Get paid books
curl "http://localhost:8000/api/books?is_paid=true"
```

#### Test 4: Resources
```bash
# Get all resources
curl http://localhost:8000/api/resources

# Get resources by category
curl "http://localhost:8000/api/resources?category=programming"

# Get YouTube resources
curl "http://localhost:8000/api/resources?resource_type=youtube"
```

## 📁 Project Structure

```
Telegram App/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── HeroSection.tsx
│   │   │   ├── MenuGrid.tsx
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── StudyPage.tsx
│   │   │   ├── QuizPage.tsx
│   │   │   ├── KitoblarPage.tsx
│   │   │   ├── ResourcesPage.tsx
│   │   │   ├── AboutPage.tsx
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── apiService.ts
│   │   │   └── ...
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/
│   │   │       └── endpoints/
│   │   │           ├── hero.py
│   │   │           ├── quizzes.py
│   │   │           ├── books.py
│   │   │           ├── resources.py
│   │   │           └── ...
│   │   ├── services/
│   │   │   ├── hero_service.py
│   │   │   ├── quiz_service.py
│   │   │   ├── book_service.py
│   │   │   ├── resource_service.py
│   │   │   └── ...
│   │   ├── models/
│   │   │   └── models.py (includes Quote, Quiz, Book, Resource)
│   │   ├── schemas/
│   │   │   └── schemas.py
│   │   ├── db/
│   │   │   ├── session.py
│   │   │   └── seed.py
│   │   └── main.py
│   ├── alembic/
│   ├── requirements.txt
│   └── .env
│
├── IMPLEMENTATION_SUMMARY.md
└── QUICKSTART.md (this file)
```

## 🔌 API Endpoints Overview

### Hero Section
```
GET  /api/hero/             - Get random quote for hero
GET  /api/hero/all          - Get all quotes with pagination
POST /api/hero/             - Create new quote (Admin)
```

### Quizzes
```
GET  /api/quizzes/          - List all quizzes with filters
GET  /api/quizzes/{id}      - Get quiz with all questions
GET  /api/quizzes/{id}/questions - Get only questions
POST /api/quizzes/{id}/submit - Submit answers and get score
POST /api/quizzes/          - Create new quiz (Admin)
```

### Books
```
GET  /api/books/            - List books (with filters)
GET  /api/books/{id}        - Get book details
GET  /api/books/{id}/download - Download book file
POST /api/books/            - Create book (Admin)
PUT  /api/books/{id}        - Update book (Admin)
```

### Resources
```
GET  /api/resources/        - List all resources
GET  /api/resources/{id}    - Get resource details
POST /api/resources/        - Create resource (Admin)
PUT  /api/resources/{id}    - Update resource (Admin)
DEL  /api/resources/{id}    - Delete resource (Admin)
```

## 🧪 Common Testing Scenarios

### Scenario 1: Browse Books
1. Open frontend at `http://localhost:5173`
2. Click "📚 Kitoblar" in menu
3. Should see 4 sample books
4. Filter by "Free" or "Paid"
5. Click on book to view details

### Scenario 2: Take a Quiz
1. Click "📝 Quiz" in menu
2. Should see 2 quizzes (Python 101, Islamic Studies)
3. Click "Start Quiz"
4. Answer 3 questions
5. View results with score and explanations

### Scenario 3: Use Study Timer
1. Click "🎯 Study With Me" in menu
2. Select ambient sound (e.g., Rain)
3. Click Play to start 25-min timer
4. After 25 min, timer should switch to 5-min break
5. Session count should increment

### Scenario 4: Explore Resources
1. Click "🔗 Foydali Linklar" in menu
2. Browse resources by category
3. Click resource to open in new tab
4. Should show videos, courses, and links

## 🛠️ Troubleshooting

### Database Connection Error
```
Error: could not connect to server: No such file or directory
```
**Solution**: Ensure PostgreSQL is running and connection string is correct

### Port Already in Use
```
# Backend (Change to different port)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

# Frontend (Vite auto-changes port)
npm run dev
```

### Missing Dependencies
```bash
# Backend
pip install -r requirements.txt --upgrade

# Frontend
npm install
```

### CORS Errors
- Ensure backend has CORS configured for frontend URL
- Check `app/main.py` for CORSMiddleware setup

### API Not Responding
1. Check backend is running: `curl http://localhost:8000/docs`
2. Verify database is populated: `python -m app.db.seed`
3. Check logs for errors

## 📊 Database Schema

### Tables Created
```sql
-- 5 New Tables
CREATE TABLE quote (...)
CREATE TABLE quiz (...)
CREATE TABLE quiz_question (...)
CREATE TABLE book (...)
CREATE TABLE resource (...)

-- Existing Tables
CREATE TABLE "user" (...)
CREATE TABLE product (...)
CREATE TABLE "order" (...)
CREATE TABLE order_item (...)
CREATE TABLE cart (...)
CREATE TABLE address (...)
CREATE TABLE notification (...)
```

## 🎯 Next Steps

1. **Authentication**
   - Integrate Telegram Web App SDK
   - Validate user via `initData`
   - Set JWT tokens

2. **Payment Integration**
   - Set up Stripe or PayPal
   - Create purchase endpoints
   - Track user purchases

3. **Analytics**
   - Track quiz attempts
   - Monitor book downloads
   - User engagement metrics

4. **Admin Dashboard**
   - Create content management interface
   - Add quiz/book/resource creation UI
   - View analytics

5. **Deployment**
   - Set up CI/CD pipeline
   - Configure production database
   - Deploy to cloud (AWS, GCP, Heroku)

## 📚 Documentation Files

- `IMPLEMENTATION_SUMMARY.md` - Complete feature documentation
- `QUICKSTART.md` - This file
- Auto-generated API docs: http://localhost:8000/docs

## 🤝 Support

For issues or questions:
1. Check existing documentation
2. Review API Swagger docs
3. Check backend logs for errors
4. Verify all dependencies are installed

---

**Happy Learning! 🎓**
**SAHIFALAB Team**
