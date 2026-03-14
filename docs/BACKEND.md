# SAHIFALAB Backend Guide

## Overview
FastAPI backend with PostgreSQL database and SQLAlchemy ORM.

## Getting Started

### Installation
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
```

### Running the Server
```bash
# Development with auto-reload
uvicorn app.main:app --reload

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### API Documentation
Access interactive API docs at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Project Structure

```
app/
├── main.py                 # FastAPI app initialization
├── api/
│   └── v1/
│       ├── __init__.py     # Router setup
│       └── endpoints/
│           ├── users.py    # User endpoints
│           ├── products.py # Product endpoints
│           ├── orders.py   # Order endpoints
│           └── cart.py     # Cart endpoints
├── core/
│   └── config.py          # Settings and configuration
├── db/
│   └── session.py         # Database session and init
├── models/
│   └── models.py          # SQLAlchemy models
├── schemas/
│   └── schemas.py         # Pydantic schemas
├── services/
│   ├── user_service.py    # User business logic
│   ├── product_service.py # Product business logic
│   ├── order_service.py   # Order business logic
│   └── cart_service.py    # Cart business logic
└── utils/
    └── (utility functions)
```

## Database Setup

### PostgreSQL Installation

#### Windows
1. Download from https://www.postgresql.org/download/windows/
2. Run installer with default settings
3. Note username (default: postgres) and password
4. pgAdmin should be installed

#### macOS
```bash
brew install postgresql@15
brew services start postgresql@15
```

#### Linux
```bash
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start
```

### Create Database
```bash
# Connect as postgres
psql -U postgres

# Create database
CREATE DATABASE sahifalab_db;
CREATE USER sahifalab_user WITH PASSWORD 'your_password';
ALTER ROLE sahifalab_user SET client_encoding TO 'utf8';
GRANT ALL PRIVILEGES ON DATABASE sahifalab_db TO sahifalab_user;
\q
```

### Update .env
```
DATABASE_URL=postgresql://sahifalab_user:your_password@localhost:5432/sahifalab_db
```

### Initialize Database
```python
from app.db.session import init_db
init_db()
```

## Configuration

### Settings (app/core/config.py)
- `DATABASE_URL` - PostgreSQL connection string
- `TELEGRAM_BOT_TOKEN` - Bot token from @BotFather
- `SECRET_KEY` - JWT secret (change in production!)
- `CORS_ORIGINS` - Allowed frontend URLs
- `DEBUG` - Debug mode

## Models

### User
- Telegram ID (unique)
- Username, name fields
- Email, phone
- Timestamps
- Relations: orders, addresses, notifications

### Product
- Name, description, slug
- Price, discount price
- Category, stock
- Image URL
- Relations: order items

### Order
- Order number (unique)
- User reference
- Status tracking
- Amounts (total, tax, shipping)
- Relations: order items, user

### OrderItem
- Order reference
- Product reference
- Quantity, price snapshot

### Cart
- User reference
- Product relations
- Timestamps

### Address
- User reference
- Address fields (street, city, etc)
- Default address flag

### Notification
- User reference
- Title, message
- Type (order_update, promotion, etc)
- Read status

## API Patterns

### Create Resource
```python
@router.post("/", response_model=ResponseSchema, status_code=201)
async def create_resource(data: CreateSchema, db: Session = Depends(get_db)):
    return await service.create(db, data)
```

### Read Resource
```python
@router.get("/{resource_id}", response_model=ResponseSchema)
async def get_resource(resource_id: int, db: Session = Depends(get_db)):
    resource = await service.get(db, resource_id)
    if not resource:
        raise HTTPException(status_code=404, detail="Not found")
    return resource
```

### List Resources
```python
@router.get("/", response_model=list[ResponseSchema])
async def list_resources(skip: int = 0, limit: int = 10, db: Session = Depends(get_db)):
    return await service.list(db, skip, limit)
```

### Update Resource
```python
@router.put("/{resource_id}", response_model=ResponseSchema)
async def update_resource(resource_id: int, data: UpdateSchema, db: Session = Depends(get_db)):
    resource = await service.update(db, resource_id, data)
    if not resource:
        raise HTTPException(status_code=404, detail="Not found")
    return resource
```

### Delete Resource
```python
@router.delete("/{resource_id}", status_code=204)
async def delete_resource(resource_id: int, db: Session = Depends(get_db)):
    if not await service.delete(db, resource_id):
        raise HTTPException(status_code=404, detail="Not found")
```

## Authentication (To Implement)

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthCredentials = Depends(security)):
    # Verify JWT token
    # Return user from database
    pass
```

## Testing

### Run Tests
```bash
pytest
```

### Test Coverage
```bash
pytest --cov=app
```

### Example Test
```python
def test_create_user(db: Session):
    user_data = UserCreate(telegram_id=123, first_name="Test")
    user = user_service.create_user(db, user_data)
    assert user.id is not None
    assert user.telegram_id == 123
```

## Migrations (Alembic)

### Initialize Alembic
```bash
alembic init migrations
```

### Create Migration
```bash
alembic revision --autogenerate -m "Add new table"
```

### Apply Migration
```bash
alembic upgrade head
```

## Error Handling

```python
from fastapi import HTTPException

raise HTTPException(
    status_code=400,
    detail="Invalid data"
)
```

## Production Checklist

- [ ] Change SECRET_KEY
- [ ] Set DEBUG=False
- [ ] Configure proper CORS_ORIGINS
- [ ] Use strong database password
- [ ] Set up HTTPS
- [ ] Add authentication/authorization
- [ ] Implement rate limiting
- [ ] Set up logging
- [ ] Configure ALLOWED_HOSTS
- [ ] Set up database backups

## Performance Tips

1. Use database indexes on frequently queried fields
2. Implement pagination for large datasets
3. Use connection pooling
4. Cache frequently accessed data
5. Optimize N+1 queries with eager loading
6. Use async/await throughout

## Debugging

### Enable Query Logging
```python
DATABASE_ECHO=True
```

### View SQL Queries
Check terminal output when DATABASE_ECHO=True

### Debug Mode
```python
DEBUG=True
```

## Troubleshooting

### Database Connection Error
- Ensure PostgreSQL is running
- Check DATABASE_URL is correct
- Verify credentials

### CORS Error
- Check CORS_ORIGINS in settings
- Add frontend URL to list

### Import Errors
- Ensure all packages installed: `pip install -r requirements.txt`
- Check Python path

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [Pydantic Documentation](https://docs.pydantic.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
