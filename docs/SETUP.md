# SAHIFALAB Configuration and Setup Guide

## Quick Setup

### 1. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
```

Update `frontend/.env`:
```
VITE_API_URL=http://localhost:8000
VITE_APP_NAME=SAHIFALAB
```

### 2. Backend Setup
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env
```

Update `backend/.env`:
```
DATABASE_URL=postgresql://sahifalab_user:password@localhost:5432/sahifalab_db
TELEGRAM_BOT_TOKEN=your_bot_token_here
SECRET_KEY=change-this-in-production
```

### 3. Database Setup

#### PostgreSQL Installation (if not already installed)

**Windows:**
1. Download from https://www.postgresql.org/download/windows/
2. Run installer
3. Remember the password you set for `postgres` user

**macOS:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo service postgresql start
```

#### Create Database
```bash
# Connect to PostgreSQL
psql -U postgres

# Create database and user
CREATE DATABASE sahifalab_db;
CREATE USER sahifalab_user WITH PASSWORD 'your_password';
ALTER ROLE sahifalab_user SET client_encoding TO 'utf8';
ALTER ROLE sahifalab_user SET default_transaction_isolation TO 'read committed';
GRANT ALL PRIVILEGES ON DATABASE sahifalab_db TO sahifalab_user;
\q
```

### 4. Bot Setup
```bash
cd bot

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env
```

Update `bot/.env`:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
BACKEND_API_URL=http://localhost:8000
```

### 5. Get Telegram Bot Token

1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Follow prompts to create your bot
4. Copy the token and paste it in all `.env` files

## Running Locally

### Terminal 1 - Backend API
```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
# API running on http://localhost:8000
```

### Terminal 2 - Frontend
```bash
cd frontend
npm run dev
# Frontend running on http://localhost:3000
```

### Terminal 3 - Telegram Bot
```bash
cd bot
source venv/bin/activate
python main.py
# Bot is polling for updates
```

## Using Docker Compose

### Prerequisites
- Docker installed and running
- Docker Compose installed

### Start All Services
```bash
# In the root directory
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Service URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs
- Database: localhost:5432

## Initial Data Setup

### Add Sample Products
```bash
curl -X POST http://localhost:8000/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product 1",
    "slug": "product-1",
    "description": "Product description",
    "price": 29.99,
    "category": "electronics",
    "stock": 10,
    "image_url": "https://..."
  }'
```

### Create Test User
```bash
curl -X POST http://localhost:8000/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "telegram_id": 123456789,
    "first_name": "John",
    "last_name": "Doe",
    "username": "johndoe"
  }'
```

## Troubleshooting

### Port Already in Use
```bash
# Find process using port
lsof -i :8000  # macOS/Linux
netstat -ano | findstr :8000  # Windows

# Kill process
kill -9 <PID>  # macOS/Linux
taskkill /PID <PID> /F  # Windows
```

### Database Connection Error
```bash
# Check PostgreSQL is running
sudo service postgresql status

# Try connecting directly
psql -U sahifalab_user -d sahifalab_db
```

### Module Not Found
```bash
# Reinstall dependencies
pip install -r requirements.txt

# Verify installation
pip list
```

### Bot Not Responding
1. Verify TELEGRAM_BOT_TOKEN is correct in `.env`
2. Ensure bot is running: `python main.py`
3. Check logs for errors
4. Test bot: `/start` command in Telegram

## Database Backups

### Backup Database
```bash
pg_dump -U sahifalab_user -d sahifalab_db > backup.sql
```

### Restore Database
```bash
psql -U sahifalab_user -d sahifalab_db < backup.sql
```

## Security Notes

1. **Change SECRET_KEY** in `backend/.env` for production
2. **Use strong database password** - never use default
3. **Set DEBUG=False** in production
4. **Configure HTTPS** for production deployment
5. **Rotate TELEGRAM_BOT_TOKEN** if exposed
6. **Set secure CORS origins** for production

## Next Steps

1. ✅ Review [README.md](../README.md) for architecture overview
2. ✅ Read [docs/FRONTEND.md](./FRONTEND.md) for frontend development
3. ✅ Read [docs/BACKEND.md](./BACKEND.md) for backend development
4. ✅ Read [docs/BOT.md](./BOT.md) for bot setup
5. Start developing features!

## Support

For issues or questions:
- Check individual module documentation in `/docs`
- Review error logs
- Check database connection
- Verify environment variables
- Consult component-specific guides
