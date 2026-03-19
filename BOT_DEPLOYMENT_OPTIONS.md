# Where to Run the Bot: Local vs Cloud Deployment

## 🎯 TL;DR

**For Development**: Use `python bot/main.py` + PM2 locally

**For Production**: Deploy to **Railway** (you already have it configured!)

---

## ❌ Why NOT Vercel?

Vercel is for **serverless functions** (quick requests → response).

Telegram bots need **continuous polling** (listen 24/7 for messages).

```
Vercel ❌
├─ Functions time out after 10 seconds
├─ No persistent connections
└─ Not suitable for bots

Railway ✅
├─ Long-running processes
├─ 24/7 uptime
└─ Perfect for bots
```

---

## ✅ Option 1: Local with PM2 (Development & Testing)

### Start
```powershell
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
pm2 start bot/main.py --name sahifalab-bot --interpreter python
```

### View Logs
```powershell
pm2 logs sahifalab-bot
```

### Stop
```powershell
pm2 stop sahifalab-bot
```

### Status
```powershell
pm2 status
```

**Pros**:
- ✅ Easy to test locally
- ✅ Easy to debug
- ✅ Free (uses your computer)

**Cons**:
- ❌ Only runs when your computer is on
- ❌ Not reliable for production
- ❌ Bot stops if computer restarts

---

## ✅ Option 2: Railway (Production)

You already have **Railway** set up for your backend!

Deploying the bot there is **easy and free tier available**.

### A. Connect Bot Repository to Railway

```bash
# Make sure bot code is in git
git add bot/
git commit -m "Add bot to deployment"
git push

# Go to Railway.app and connect your GitHub repo
```

### B. Create New Service in Railway

1. Go to [railway.app](https://railway.app)
2. Open your project
3. Click "New" → "GitHub Repo"
4. Select your repo
5. Set root directory to `bot/` (optional, or leave empty)
6. Set environment variables:
   ```
   TELEGRAM_BOT_TOKEN=your_token
   SUPABASE_URL=your_url
   SUPABASE_SERVICE_ROLE_KEY=your_key
   API_BASE_URL=your_api_url
   MINI_APP_URL=your_mini_app_url
   BOT_ADMIN_IDS=your_admin_id
   AUTO_MOTIVATE_ENABLED=true
   ```

### C. Deploy

Railway automatically deploys when you push to GitHub!

```powershell
git push
# Railway auto-deploys bot
```

### D. View Logs

In Railway dashboard → Click service → View logs

**Pros**:
- ✅ Runs 24/7 in cloud
- ✅ Free tier available
- ✅ Auto-deploys on git push
- ✅ Easy to monitor
- ✅ One command to deploy

**Cons**:
- ⚠️ Needs Railway account
- ⚠️ Slight delay between git push and deployment

---

## 📊 Comparison Table

| Feature | Local + PM2 | Railway | Vercel |
|---------|-----------|---------|--------|
| **24/7 Uptime** | ❌ | ✅ | ❌ |
| **Bot Polling** | ✅ | ✅ | ❌ |
| **Persistent Connection** | ✅ | ✅ | ❌ |
| **Easy Deploy** | ⚠️ | ✅ | ❌ |
| **Cost** | Free | Free tier | Free |
| **Best For** | Dev/Testing | Production | Static sites |

---

## 🚀 Recommended Setup

### Development (Right Now)
```powershell
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
pm2 start bot/main.py --name sahifalab-bot --interpreter python
```

Test everything locally with PM2.

### Production (When Ready)
Deploy to Railway following the steps above.

---

## 🛠️ How Bot Deployment Works

### Local (PM2)
```
Your Computer
    ↓
PM2 Process
    ↓
python bot/main.py
    ↓
Telegram API (polling)
    ↓
@sahifalab_hub_bot responds to messages
```

### Cloud (Railway)
```
Railway Server
    ↓
Python Process
    ↓
python bot/main.py
    ↓
Telegram API (polling)
    ↓
@sahifalab_hub_bot responds 24/7
```

---

## 📋 Your Bot Architecture

You have:
- ✅ **Frontend**: Vercel (React mini app) ← Correct!
- ✅ **Backend API**: Railway (FastAPI) ← Correct!
- ✅ **Bot**: Should be Railway or local with PM2 ← Not Vercel!
- ✅ **Database**: Supabase ← Correct!

```
┌─────────────────────────────────────┐
│     SAHIFALAB Architecture          │
├─────────────────────────────────────┤
│                                     │
│  Frontend (React)  ────→ Vercel ✅  │
│                                     │
│  Backend (FastAPI) ────→ Railway ✅ │
│                                     │
│  Bot (Python)      ────→ Railway ✅ │
│                                     │
│  Database (Supabase) ────→ Supabase ✅
│                                     │
└─────────────────────────────────────┘
```

---

## ⚡ Quick Steps

### NOW (Development)
1. Start bot locally:
   ```powershell
   pm2 start bot/main.py --name sahifalab-bot --interpreter python
   ```

2. Test `/motivate_inactive 0` in Telegram

3. Stop when done:
   ```powershell
   pm2 stop sahifalab-bot
   ```

### LATER (Production)
1. Push bot code to GitHub
2. Connect to Railway
3. Set env vars
4. Bot deploys automatically
5. Runs 24/7 in cloud

---

## 🔑 Why Not Just `python bot/main.py`?

Running without PM2:
```powershell
python bot/main.py
```

**Problem**: If you close the terminal, bot stops! ❌

**Solution**: Use PM2 to keep it running even after you close terminal.

```powershell
pm2 start bot/main.py --name sahifalab-bot --interpreter python
# Now it runs in background even if you close terminal ✅
```

---

## 📞 Environment Variables

Both local (PM2) and cloud (Railway) need:

```bash
# Required
TELEGRAM_BOT_TOKEN=123456:ABC...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
API_BASE_URL=https://your-backend.vercel.app

# Optional but recommended
MINI_APP_URL=https://your-mini-app-url
BOT_ADMIN_IDS=807466591
AUTO_MOTIVATE_ENABLED=true
AUTO_MOTIVATE_INACTIVE_HOURS=72
AUTO_MOTIVATE_CHECK_MINUTES=60
AUTO_MOTIVATE_USER_COOLDOWN_HOURS=24
```

### Local (PM2)
Add to `.env` file in project root

### Cloud (Railway)
Add in Railway dashboard → Variables tab

---

## 🎯 Recommendation

### For NOW (Testing):
```powershell
pm2 start bot/main.py --name sahifalab-bot --interpreter python
```

### For LATER (Production):
Use Railway (you already have it set up!)

---

## ❓ FAQ

### Q: Can I use Docker?
**A**: Yes! Bot has Dockerfile. Railway uses it automatically.

### Q: Will bot work with just `python bot/main.py`?
**A**: Yes, but only while terminal is open. Use PM2 to keep it running.

### Q: Can I use Heroku?
**A**: They removed free tier. Railway is better now.

### Q: Can I use my own VPS?
**A**: Yes! Use PM2 + your own server (AWS EC2, DigitalOcean, Linode, etc)

### Q: What about webhooks instead of polling?
**A**: Current code uses polling. Webhooks are alternative but polling is simpler for dev.

---

## ✨ Next Steps

1. **Test locally**: `pm2 start bot/main.py --name sahifalab-bot --interpreter python`
2. **Verify works**: Send `/motivate_inactive 0` in Telegram
3. **Later deploy to Railway**: When ready for production

---

**TL;DR**: Use PM2 for local development. Deploy to Railway for production. Never use Vercel for bots! 🚀

