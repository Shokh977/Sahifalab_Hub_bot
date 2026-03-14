# Database Migration & Setup Guide

## 📋 Overview
This guide covers setting up the SAHIFALAB PostgreSQL database with all required tables, migrations, and seed data.

## 🗄️ Database Schema

### New Tables Added

#### 1. Quote Table
```sql
CREATE TABLE quote (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    author VARCHAR(255) NOT NULL,
    quote_type VARCHAR(50) NOT NULL DEFAULT 'quote',  -- 'quote' or 'announcement'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quote_is_active ON quote(is_active);
CREATE INDEX idx_quote_quote_type ON quote(quote_type);
```

#### 2. Quiz Table
```sql
CREATE TABLE quiz (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    book_title VARCHAR(255) NOT NULL,
    description TEXT,
    difficulty VARCHAR(20) DEFAULT 'medium',  -- 'easy', 'medium', 'hard'
    category VARCHAR(100) NOT NULL,
    total_questions INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_quiz_category ON quiz(category);
CREATE INDEX idx_quiz_difficulty ON quiz(difficulty);
```

#### 3. QuizQuestion Table
```sql
CREATE TABLE quiz_question (
    id SERIAL PRIMARY KEY,
    quiz_id INTEGER NOT NULL REFERENCES quiz(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    options TEXT NOT NULL,  -- JSON array stored as text
    correct_answer INTEGER NOT NULL,
    explanation TEXT,
    "order" INTEGER DEFAULT 0,
    FOREIGN KEY (quiz_id) REFERENCES quiz(id) ON DELETE CASCADE
);

CREATE INDEX idx_quiz_question_quiz_id ON quiz_question(quiz_id);
CREATE INDEX idx_quiz_question_order ON quiz_question("order");
```

#### 4. Book Table
```sql
CREATE TABLE book (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    price FLOAT DEFAULT 0,
    is_paid BOOLEAN DEFAULT FALSE,
    file_url VARCHAR(500) NOT NULL,
    thumbnail_url VARCHAR(500),
    category VARCHAR(100) NOT NULL,
    downloads INTEGER DEFAULT 0,
    rating FLOAT DEFAULT 0,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_book_title ON book(title);
CREATE INDEX idx_book_category ON book(category);
CREATE INDEX idx_book_is_paid ON book(is_paid);
CREATE INDEX idx_book_is_available ON book(is_available);
```

#### 5. Resource Table
```sql
CREATE TABLE resource (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    url VARCHAR(500) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,  -- 'youtube', 'link', 'course'
    category VARCHAR(100) NOT NULL,
    thumbnail_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_resource_title ON resource(title);
CREATE INDEX idx_resource_category ON resource(category);
CREATE INDEX idx_resource_type ON resource(resource_type);
```

## 🚀 Setup Instructions

### Step 1: Create PostgreSQL Database
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE sahifalab;

# Create user (optional)
CREATE USER sahifa_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE sahifalab TO sahifa_user;

# Exit
\q
```

### Step 2: Update Connection String
**File**: `backend/.env` or `backend/app/db/session.py`

```
DATABASE_URL=postgresql://sahifa_user:secure_password@localhost:5432/sahifalab
```

Or directly in code:
```python
# app/db/session.py
SQLALCHEMY_DATABASE_URL = "postgresql://sahifa_user:secure_password@localhost:5432/sahifalab"
```

### Step 3: Run Alembic Migrations
```bash
cd backend

# Create initial migration (if not exists)
alembic revision --autogenerate -m "Add new tables"

# Apply migrations
alembic upgrade head

# Verify migrations
alembic current
```

### Step 4: Seed Database
```bash
python -m app.db.seed
```

**Expected Output**:
```
✅ Database seeded successfully!
  - 4 quotes added
  - 2 quizzes added
  - 4 books added
  - 6 resources added
```

## 📊 Seed Data Details

### Quotes (4 total)
1. **Steve Jobs Quote 1** - "The only way to do great work is to love what you do."
2. **Steve Jobs Quote 2** - "Innovation distinguishes between a leader and a follower."
3. **John Lennon** - "Life is what happens when you're busy making other plans."
4. **SAHIFALAB Announcement** - "Welcome to SAHIFALAB! Start your learning journey today."

### Quizzes (2 total)
1. **Python 101** (Easy)
   - 3 questions about Python basics
   - Book: "Python 101"
   - Category: Programming

2. **الكتاب المقدس - أساسيات الإيمان** (Medium)
   - 2 questions about faith basics
   - Book: "الكتاب المقدس"
   - Category: Religion

### Books (4 total)
1. **Python for Beginners** (Free)
   - Author: John Smith
   - 150 downloads, 4.5★ rating
   
2. **Advanced JavaScript** (Paid - $29.99)
   - Author: Jane Doe
   - 75 downloads, 4.8★ rating

3. **تعلم اللغة العربية** (Free)
   - Author: أحمد محمد
   - 200 downloads, 4.7★ rating

4. **Data Science Mastery** (Paid - $49.99)
   - Author: Robert Johnson
   - 120 downloads, 4.6★ rating

### Resources (6 total)
1. **Python Official Documentation** - Link
2. **Web Development with React** - YouTube
3. **Khan Academy Mathematics** - Course
4. **Quran Recitation by Famous Qaris** - YouTube
5. **Coursera Online Courses** - Course
6. **Business Growth Strategies** - YouTube

## 🔄 Database Backup & Restore

### Backup Database
```bash
pg_dump -U sahifa_user -d sahifalab > sahifalab_backup.sql
```

### Restore Database
```bash
# Create new database
psql -U postgres -c "CREATE DATABASE sahifalab_restored;"

# Restore from backup
psql -U sahifa_user -d sahifalab_restored < sahifalab_backup.sql
```

## 🧹 Resetting Database

### Option 1: Clear Tables (Keep Schema)
```bash
python -c "
from app.db.session import Base, engine
from app.models.models import Quote, Quiz, QuizQuestion, Book, Resource

# Drop tables
Base.metadata.drop_all(bind=engine, tables=[
    Quote.__table__,
    QuizQuestion.__table__,
    Quiz.__table__,
    Book.__table__,
    Resource.__table__
])

# Recreate tables
Base.metadata.create_all(bind=engine, tables=[
    Quote.__table__,
    Quiz.__table__,
    QuizQuestion.__table__,
    Book.__table__,
    Resource.__table__
])
print('✅ Tables reset successfully')
"
```

### Option 2: Drop & Recreate Everything
```bash
# Drop database
psql -U postgres -c "DROP DATABASE sahifalab;"

# Recreate database
psql -U postgres -c "CREATE DATABASE sahifalab;"

# Run migrations
alembic upgrade head

# Seed data
python -m app.db.seed
```

## 🔍 Verification Queries

### Check Tables
```sql
-- List all tables
\dt

-- Show table structure
\d quote
\d quiz
\d quiz_question
\d book
\d resource
```

### Verify Data
```sql
-- Count records
SELECT COUNT(*) FROM quote;
SELECT COUNT(*) FROM quiz;
SELECT COUNT(*) FROM quiz_question;
SELECT COUNT(*) FROM book;
SELECT COUNT(*) FROM resource;

-- Show sample data
SELECT * FROM quote LIMIT 5;
SELECT * FROM book LIMIT 3;
SELECT * FROM resource LIMIT 3;
```

### Check Relationships
```sql
-- Quiz with questions
SELECT q.title, COUNT(qq.id) as question_count
FROM quiz q
LEFT JOIN quiz_question qq ON q.id = qq.quiz_id
GROUP BY q.id, q.title;

-- Books by category
SELECT category, COUNT(*) FROM book GROUP BY category;

-- Resources by type
SELECT resource_type, COUNT(*) FROM resource GROUP BY resource_type;
```

## 🔧 Advanced: Custom Seed Data

### Add Custom Quote
```python
from app.db.session import SessionLocal
from app.models.models import Quote

db = SessionLocal()
new_quote = Quote(
    text="Your custom quote here",
    author="Author Name",
    quote_type="quote",
    is_active=True
)
db.add(new_quote)
db.commit()
db.refresh(new_quote)
print(f"Added quote with ID: {new_quote.id}")
db.close()
```

### Add Custom Quiz with Questions
```python
import json
from app.db.session import SessionLocal
from app.models.models import Quiz, QuizQuestion

db = SessionLocal()

# Create quiz
quiz = Quiz(
    title="My Quiz",
    book_title="My Book",
    difficulty="easy",
    category="test",
    total_questions=2
)
db.add(quiz)
db.flush()

# Add questions
q1 = QuizQuestion(
    quiz_id=quiz.id,
    question="Question 1?",
    options=json.dumps(["Option A", "Option B", "Option C"]),
    correct_answer=0,
    explanation="This is the answer",
    order=0
)
db.add(q1)
db.commit()
print(f"Added quiz with ID: {quiz.id}")
db.close()
```

## 📈 Database Performance

### Create Indexes for Optimization
```sql
-- Already created in table definitions, but can optimize further:

-- For frequently filtered columns
CREATE INDEX idx_quiz_category_difficulty ON quiz(category, difficulty);
CREATE INDEX idx_book_category_is_paid ON book(category, is_paid);

-- For sorting
CREATE INDEX idx_book_downloads ON book(downloads DESC);
CREATE INDEX idx_book_rating ON book(rating DESC);
```

### Query Optimization Example
```sql
-- Slow query: Without index
SELECT * FROM book WHERE category = 'programming' AND is_paid = FALSE;

-- Fast query: With index
SELECT * FROM book WHERE category = 'programming' AND is_paid = FALSE;
-- (Same query, but with idx_book_category_is_paid index)
```

## ⚠️ Common Issues & Solutions

### Issue: "relation does not exist"
```
Error: relation "quote" does not exist
```
**Solution**: Run migrations: `alembic upgrade head`

### Issue: "permission denied"
```
Error: permission denied for schema public
```
**Solution**: Grant permissions:
```sql
GRANT USAGE ON SCHEMA public TO sahifa_user;
GRANT CREATE ON SCHEMA public TO sahifa_user;
```

### Issue: "duplicate key value"
```
Error: duplicate key value violates unique constraint
```
**Solution**: Clear tables and reseed:
```bash
python -m app.db.seed  # Will clear before seeding
```

### Issue: JSON parsing error
**Solution**: Ensure options are properly JSON formatted:
```python
import json
options = json.dumps(["Option A", "Option B"])  # ✅ Correct
# NOT: options = "['Option A', 'Option B']"  # ❌ Wrong
```

## 📝 Migration Best Practices

1. **Always Version Control Migrations**
   ```bash
   git add alembic/versions/
   ```

2. **Write Descriptive Migration Messages**
   ```bash
   alembic revision --autogenerate -m "Add quiz and book tables for learning features"
   ```

3. **Test Migrations Locally First**
   ```bash
   alembic upgrade head  # Local DB
   # Verify
   alembic downgrade -1  # Rollback
   alembic upgrade head  # Re-apply
   ```

4. **Keep Migrations Clean**
   - One logical change per migration
   - Document complex changes
   - Don't mix schema and data changes

## 🚀 Production Checklist

- [ ] Database backed up
- [ ] Migrations tested locally
- [ ] Connection string updated for production
- [ ] Database user with restricted permissions created
- [ ] SSL connection enabled
- [ ] Monitoring/alerting configured
- [ ] Disaster recovery plan in place
- [ ] Read replicas configured (optional)

---

**Database Setup Complete! ✅**

For more information, see:
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Alembic Documentation](https://alembic.sqlalchemy.org/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
