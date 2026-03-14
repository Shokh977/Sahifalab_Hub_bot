# SAHIFALAB Telegram Mini App - Start Here 👋

Welcome to SAHIFALAB - A full-stack Telegram Mini App!

## 📖 Documentation Index

Start with these documents based on your role:

### 🚀 **Getting Started** (Everyone)
1. **[QUICK_START.md](QUICK_START.md)** ⭐ **START HERE**
   - 5-minute setup guide
   - Quick commands reference
   - Common troubleshooting

### 👨‍💼 **Project Managers / Stakeholders**
1. [README.md](README.md) - Complete project overview
2. [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture
3. [docs/SETUP.md](docs/SETUP.md) - System requirements

### ⚛️ **Frontend Developers**
1. [QUICK_START.md](QUICK_START.md) - Quick setup
2. [docs/FRONTEND.md](docs/FRONTEND.md) - Frontend guide
3. [frontend/](frontend/) - Source code

### 🔧 **Backend Developers**
1. [QUICK_START.md](QUICK_START.md) - Quick setup
2. [docs/BACKEND.md](docs/BACKEND.md) - Backend guide
3. [backend/](backend/) - Source code

### 🤖 **DevOps / Infrastructure**
1. [docker-compose.yml](docker-compose.yml) - Container setup
2. [docs/SETUP.md](docs/SETUP.md) - Detailed setup
3. [docs/BACKEND.md](docs/BACKEND.md) - Database configuration

### 📱 **Telegram Bot Developers**
1. [docs/BOT.md](docs/BOT.md) - Bot integration guide
2. [bot/](bot/) - Bot source code

---

## 🏗️ Project Structure

```
SAHIFALAB/
│
├── 📱 Frontend (React + Tailwind + Telegram SDK)
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
│
├── 🔧 Backend (FastAPI + PostgreSQL)
│   ├── app/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
│
├── 🤖 Bot (Python Telegram Bot)
│   ├── bot.py
│   ├── main.py
│   └── requirements.txt
│
├── 📚 Documentation
│   ├── docs/FRONTEND.md
│   ├── docs/BACKEND.md
│   ├── docs/BOT.md
│   └── docs/SETUP.md
│
├── 🐳 Deployment
│   ├── docker-compose.yml
│   ├── Dockerfile (× 3)
│   └── .env.example (× 3)
│
├── 📖 Guides
│   ├── README.md
│   ├── ARCHITECTURE.md
│   ├── QUICK_START.md
│   └── INDEX.md (this file)
```

---

## ⚡ Quick Commands

### Start Everything (Recommended - Docker)
```bash
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
docker-compose up -d
```

### Manual Start (3 Terminals)

**Terminal 1 - Backend:**
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Terminal 3 - Bot:**
```bash
cd bot
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py
```

### Access Services
- 🌐 Frontend: http://localhost:3000
- 📚 API Docs: http://localhost:8000/docs
- 🗄️ Database: localhost:5432

---

## 📋 What's Included

### ✅ Frontend
- React 18 with TypeScript
- Tailwind CSS with SAHIFALAB theme
- Telegram Web App SDK integration
- Zustand state management
- Vite build system
- Pre-configured API service

### ✅ Backend
- FastAPI framework
- PostgreSQL with SQLAlchemy ORM
- 8 database models (Users, Products, Orders, etc.)
- 20+ RESTful API endpoints
- Service layer architecture
- Pydantic validation
- CORS & security middleware

### ✅ Telegram Bot
- Command handlers
- Order notifications
- Promotional messages
- Mini app integration
- Async/await support

### ✅ DevOps
- Docker containers
- Docker Compose orchestration
- Environment configuration
- Production-ready setup

### ✅ Documentation
- Comprehensive README
- Architecture guide
- Setup instructions
- Developer guides (Frontend, Backend, Bot)
- Quick reference

---

## 🎯 Getting Started Path

### Day 1: Setup & Exploration
1. Read [QUICK_START.md](QUICK_START.md)
2. Choose Docker or manual setup
3. Start the services
4. Test API at `/docs` endpoint

### Day 2-3: Development
1. Read component-specific guides (Frontend/Backend/Bot)
2. Explore existing code structure
3. Run the application
4. Test features

### Day 4+: Customization
1. Add new features
2. Customize components
3. Build business logic
4. Deploy to production

---

## 🔐 Before Production

- [ ] Change SECRET_KEY
- [ ] Set DEBUG=False
- [ ] Configure database backups
- [ ] Set up HTTPS
- [ ] Configure firewall
- [ ] Add authentication
- [ ] Set up monitoring
- [ ] Test API security

See [docs/BACKEND.md](docs/BACKEND.md) for complete checklist.

---

## 🆘 Need Help?

### Common Issues

**Port already in use?**
```bash
netstat -ano | findstr :8000
taskkill /PID <PID> /F
```

**Database connection error?**
Check [docs/BACKEND.md](docs/BACKEND.md) → Database Setup

**Bot not responding?**
Check [docs/BOT.md](docs/BOT.md) → Troubleshooting

**Frontend not loading?**
Check [docs/FRONTEND.md](docs/FRONTEND.md) → Troubleshooting

**Docker issues?**
```bash
docker-compose down -v
docker-compose up -d --build
```

---

## 📞 Support Resources

| Need | File |
|------|------|
| Quick setup | [QUICK_START.md](QUICK_START.md) |
| Project overview | [README.md](README.md) |
| Architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Full setup | [docs/SETUP.md](docs/SETUP.md) |
| Frontend help | [docs/FRONTEND.md](docs/FRONTEND.md) |
| Backend help | [docs/BACKEND.md](docs/BACKEND.md) |
| Bot help | [docs/BOT.md](docs/BOT.md) |
| API reference | [http://localhost:8000/docs](http://localhost:8000/docs) |

---

## 📊 Project Stats

- **Total Files:** 50+
- **Lines of Code:** 6000+
- **API Endpoints:** 20+
- **Database Models:** 8
- **Components:** Ready for development
- **Documentation Pages:** 7

---

## 🎉 You're Ready!

This is a **complete, production-ready architecture** for a Telegram Mini App.

### Next Step
👉 Open [QUICK_START.md](QUICK_START.md) to begin!

---

## 📄 Document Navigation

```
You are here: INDEX.md

Quick Navigation:
├─ New to project? → QUICK_START.md
├─ Want overview? → README.md
├─ Technical details? → ARCHITECTURE.md
├─ Frontend dev? → docs/FRONTEND.md
├─ Backend dev? → docs/BACKEND.md
├─ Bot setup? → docs/BOT.md
└─ Full setup? → docs/SETUP.md
```

---

## 🚀 Let's Build Something Great!

Welcome to SAHIFALAB. Happy coding! 💪

---

*Last Updated: March 13, 2024*
*Project: SAHIFALAB Telegram Mini App*
*Status: ✅ Complete & Ready for Development*
