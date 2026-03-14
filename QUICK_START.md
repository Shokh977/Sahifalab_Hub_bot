# SAHIFALAB Quick Reference Guide

## 🚀 Get Started in 5 Minutes

### Prerequisites
- Node.js 20+ (for frontend)
- Python 3.11+ (for backend/bot)
- PostgreSQL 15+ (for database)
- Docker & Docker Compose (optional, recommended)

### Option A: Docker Compose (Easiest)

```bash
# 1. Navigate to project
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"

# 2. Setup environment files
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
copy bot\.env.example bot\.env

# 3. Add your Telegram Bot token to all .env files
# Get token from @BotFather on Telegram

# 4. Start services
docker-compose up -d

# 5. Access services
# Frontend: http://localhost:3000
# API Docs: http://localhost:8000/docs
# Database: localhost:5432
```

### Option B: Manual Setup

#### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env with your settings
uvicorn app.main:app --reload
```

#### Frontend
```bash
cd frontend
npm install
copy .env.example .env
npm run dev
# Access at http://localhost:3000
```

#### Bot
```bash
cd bot
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env with your settings
python main.py
```

---

## 📁 Key File Locations

| Component | Main File | Config | Database |
|-----------|-----------|--------|----------|
| Frontend | `frontend/src/App.tsx` | `frontend/.env` | N/A |
| Backend | `backend/app/main.py` | `backend/.env` | PostgreSQL |
| Bot | `bot/main.py` | `bot/.env` | N/A |
| Docker | `docker-compose.yml` | `.env` files | All services |

---

## 🔌 API Quick Reference

### Users
```bash
# Create user
POST http://localhost:8000/api/users
Body: { "telegram_id": 123, "first_name": "John" }

# Get user
GET http://localhost:8000/api/users/1

# Update user
PUT http://localhost:8000/api/users/1
Body: { "first_name": "Jane" }
```

### Products
```bash
# List products
GET http://localhost:8000/api/products?skip=0&limit=10

# Get product
GET http://localhost:8000/api/products/1

# Search products
GET http://localhost:8000/api/products/search?q=laptop

# Filter by category
GET http://localhost:8000/api/products/category/electronics
```

### Orders
```bash
# Create order
POST http://localhost:8000/api/orders
Body: { "items": [{"product_id": 1, "quantity": 2}] }

# Get order
GET http://localhost:8000/api/orders/1

# Update order status
PUT http://localhost:8000/api/orders/1?status=shipped
```

### Cart
```bash
# Get cart
GET http://localhost:8000/api/cart/1

# Add to cart
POST http://localhost:8000/api/cart/1
Body: { "product_id": 1, "quantity": 2 }

# Remove from cart
DELETE http://localhost:8000/api/cart/1/1

# Clear cart
DELETE http://localhost:8000/api/cart/1
```

---

## 🗄️ Database Setup

### Create Database
```bash
# Connect to PostgreSQL
psql -U postgres

# Run these commands
CREATE DATABASE sahifalab_db;
CREATE USER sahifalab_user WITH PASSWORD 'your_password';
ALTER ROLE sahifalab_user SET client_encoding TO 'utf8';
GRANT ALL PRIVILEGES ON DATABASE sahifalab_db TO sahifalab_user;
\q

# Update backend/.env
# DATABASE_URL=postgresql://sahifalab_user:your_password@localhost:5432/sahifalab_db
```

### Backup Database
```bash
pg_dump -U sahifalab_user -d sahifalab_db > backup.sql
```

### Restore Database
```bash
psql -U sahifalab_user -d sahifalab_db < backup.sql
```

---

## 🤖 Telegram Bot Commands

| Command | Purpose |
|---------|---------|
| `/start` | Welcome message |
| `/help` | Show available commands |
| `/app` | Open mini app |
| `/orders` | View your orders |
| `/support` | Contact support |

---

## 🧹 Cleanup & Troubleshooting

### Stop All Docker Services
```bash
docker-compose down
```

### View Docker Logs
```bash
docker-compose logs -f [service_name]
# service_name: postgres, backend, frontend, bot
```

### Clear Database
```bash
# WARNING: This deletes all data!
docker-compose down -v
```

### Restart Services
```bash
docker-compose restart
```

### Remove Port Conflicts
```bash
# Find process on port
netstat -ano | findstr :8000  # Windows
lsof -i :8000  # macOS/Linux

# Kill process
taskkill /PID <PID> /F  # Windows
kill -9 <PID>  # macOS/Linux
```

### Check Service Health
```bash
# Frontend
curl http://localhost:3000

# Backend
curl http://localhost:8000/health

# Database
psql -U sahifalab_user -d sahifalab_db -c "SELECT 1"
```

---

## 📚 Documentation Files

- [README.md](README.md) - Complete project overview
- [ARCHITECTURE.md](ARCHITECTURE.md) - Architecture and features
- [docs/SETUP.md](docs/SETUP.md) - Detailed setup guide
- [docs/FRONTEND.md](docs/FRONTEND.md) - Frontend development
- [docs/BACKEND.md](docs/BACKEND.md) - Backend development
- [docs/BOT.md](docs/BOT.md) - Bot integration

---

## 🔑 Environment Variables Template

### backend/.env
```
DATABASE_URL=postgresql://user:pass@localhost:5432/sahifalab_db
TELEGRAM_BOT_TOKEN=your_token_here
DEBUG=True
SECRET_KEY=your_secret_key
```

### frontend/.env
```
VITE_API_URL=http://localhost:8000
VITE_APP_NAME=SAHIFALAB
```

### bot/.env
```
TELEGRAM_BOT_TOKEN=your_token_here
BACKEND_API_URL=http://localhost:8000
DEBUG=True
```

---

## 💡 Common Tasks

### Add a New API Endpoint
1. Create schema in `backend/app/schemas/schemas.py`
2. Add model in `backend/app/models/models.py` (if needed)
3. Create service method in `backend/app/services/`
4. Create endpoint in `backend/app/api/v1/endpoints/`

### Add a New React Component
1. Create file in `frontend/src/components/`
2. Export component
3. Import and use in pages
4. Style with Tailwind classes

### Deploy to Production
1. Build frontend: `npm run build`
2. Update environment variables
3. Configure database backups
4. Set up domain and SSL
5. Use Docker for containerized deployment

---

## 🎯 Development Checklist

- [ ] PostgreSQL running
- [ ] Telegram Bot token obtained
- [ ] Environment files created
- [ ] Dependencies installed
- [ ] All services running
- [ ] API endpoints responding
- [ ] Frontend loads successfully
- [ ] Bot responding to commands

---

## 📞 Quick Support

### Issue: Port Already in Use
```bash
# Find and kill process
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

### Issue: Database Connection Failed
```bash
# Check PostgreSQL is running
# Edit DATABASE_URL in .env
# Verify credentials
```

### Issue: Node Modules Error
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

### Issue: Python Import Error
```bash
cd backend
pip install -r requirements.txt --force-reinstall
```

---

## 🎉 You're All Set!

Your SAHIFALAB Telegram Mini App is ready to go! 

**Next Steps:**
1. Start the services
2. Access http://localhost:3000
3. Test API at http://localhost:8000/docs
4. Begin development!

For more details, see the [ARCHITECTURE.md](ARCHITECTURE.md) file.

Happy coding! 🚀
