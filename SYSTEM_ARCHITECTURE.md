# SAHIFALAB Architecture & System Design

## 🏗️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      TELEGRAM MINI APP                               │
│                      (Frontend - React 18)                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌───────────────────────┐  ┌─────────────────────────────────┐    │
│  │   Main App (App.tsx)  │  │   React Router Configuration    │    │
│  │                       │  │   - 7 Main Routes              │    │
│  │  ┌─────────────────┐  │  │   - Navigation Stack           │    │
│  │  │ HeroSection     │  │  │   - Page Transitions           │    │
│  │  ├─────────────────┤  │  └─────────────────────────────────┘    │
│  │  │ MenuGrid        │  │                                         │
│  │  │ 5 Modules       │  │                                         │
│  │  └─────────────────┘  │                                         │
│  └───────────────────────┘                                         │
│                                                                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│  │  Study Page     │ │  Quiz Page      │ │  Books Page     │       │
│  │  - Timer        │ │  - Questions    │ │  - Grid View    │       │
│  │  - Sounds       │ │  - Scoring      │ │  - Filtering    │       │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘       │
│                                                                       │
│  ┌─────────────────┐ ┌─────────────────┐                           │
│  │ Resources Page  │ │  About Page     │                           │
│  │ - Carousel      │ │  - Brand Story  │                           │
│  │ - Categories    │ │  - Mission      │                           │
│  └─────────────────┘ └─────────────────┘                           │
│                                                                       │
│  ┌─────────────────────────────────────┐                           │
│  │    API Service Layer (Axios)        │                           │
│  │    - Request Interceptors           │                           │
│  │    - Response Handling              │                           │
│  │    - Error Management               │                           │
│  └─────────────────────────────────────┘                           │
│                                                                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                    HTTP/HTTPS (REST)
                             │
┌────────────────────────────┴────────────────────────────────────────┐
│                      BACKEND API (FastAPI)                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              API Route Handlers (v1)                         │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  Hero Endpoints:       Quiz Endpoints:     Book Endpoints:   │   │
│  │  ├─ GET  /hero/        ├─ GET  /quizzes/  ├─ GET /books/   │   │
│  │  ├─ GET  /hero/all     ├─ GET  /:id       ├─ GET /:id      │   │
│  │  └─ POST /hero/        ├─ GET  /:id/q     ├─ GET /:id/dl   │   │
│  │                        ├─ POST /:id/sub   └─ POST /books/   │   │
│  │  Resource Endpoints:   └─ POST /quizzes/  │   └─ PUT /:id   │   │
│  │  ├─ GET /resources/    │                  │                 │   │
│  │  ├─ GET /:id           │                  │                 │   │
│  │  ├─ POST /resources/   │                  │                 │   │
│  │  └─ DELETE /:id        │                  │                 │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────┴──────────────────────────────────┐   │
│  │           Service Layer (Business Logic)                   │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  HeroService      QuizService      BookService              │   │
│  │  ├─ get_random    ├─ get_all       ├─ get_all               │   │
│  │  ├─ get_daily     ├─ get_by_id     ├─ get_by_id             │   │
│  │  ├─ get_by_type   ├─ get_questions ├─ by_category           │   │
│  │  └─ create        ├─ submit        ├─ free/paid             │   │
│  │                   └─ create        └─ search                │   │
│  │                                                               │   │
│  │  ResourceService                                            │   │
│  │  ├─ get_all       ├─ by_category   ├─ by_type               │   │
│  │  ├─ by_id         ├─ search        └─ update/delete         │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────┴──────────────────────────────────┐   │
│  │        Pydantic Schema Validation Layer                      │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  Request Validation:    Response Serialization:             │   │
│  │  ├─ QuizCreate          ├─ QuoteResponse                     │   │
│  │  ├─ BookCreate          ├─ QuizResponse                      │   │
│  │  ├─ ResourceCreate      ├─ BookResponse                      │   │
│  │  └─ UserCreate          └─ ResourceResponse                  │   │
│  │                                                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                             │                                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                      SQL (psycopg2)
                             │
┌────────────────────────────┴────────────────────────────────────────┐
│                    DATABASE LAYER (PostgreSQL)                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Quote Table  │  │ Quiz Table   │  │ Book Table   │              │
│  ├──────────────┤  ├──────────────┤  ├──────────────┤              │
│  │ id (PK)      │  │ id (PK)      │  │ id (PK)      │              │
│  │ text         │  │ title        │  │ title        │              │
│  │ author       │  │ book_title   │  │ author       │              │
│  │ quote_type   │  │ difficulty   │  │ price        │              │
│  │ is_active    │  │ category     │  │ is_paid      │              │
│  │ created_at   │  │ total_q      │  │ file_url     │              │
│  │              │  │ created_at   │  │ rating       │              │
│  │              │  │              │  │ downloads    │              │
│  │ Indexes:     │  │ Indexes:     │  │ Indexes:     │              │
│  │ - is_active  │  │ - category   │  │ - title      │              │
│  │ - type       │  │ - difficulty │  │ - category   │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                       │
│  ┌──────────────────────┐  ┌──────────────────────┐                │
│  │ QuizQuestion Table   │  │ Resource Table       │                │
│  ├──────────────────────┤  ├──────────────────────┤                │
│  │ id (PK)              │  │ id (PK)              │                │
│  │ quiz_id (FK)────┐    │  │ title                │                │
│  │ question        │    │  │ description          │                │
│  │ options (JSON)  │    │  │ url                  │                │
│  │ correct_answer  │    │  │ resource_type        │                │
│  │ explanation     │    │  │ category             │                │
│  │ order           │    │  │ thumbnail_url        │                │
│  │                 │    │  │ created_at           │                │
│  │ Indexes:        │    │  │                      │                │
│  │ - quiz_id       │    │  │ Indexes:             │                │
│  │ - order         │    │  │ - title              │                │
│  └─────────────────┘    │  │ - category           │                │
│        │                │  └──────────────────────┘                │
│        └────────────────┘                                           │
│                                                                       │
│  Additional Tables: user, product, order, order_item, cart, address │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📚 Additional Documentation Files

See the following comprehensive guides:
- **IMPLEMENTATION_SUMMARY.md** - Detailed feature documentation
- **QUICKSTART.md** - Setup and running instructions  
- **DATABASE_SETUP.md** - Database configuration guide
- **VALIDATION_REPORT.md** - Implementation checklist & status

---

**Complete architecture documentation for SAHIFALAB! 🎓**
