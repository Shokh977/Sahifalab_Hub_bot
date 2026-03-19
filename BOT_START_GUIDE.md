# How to Start the Bot and Send /motivate_inactive Command

## 🤖 Current Status

Your bot `@sahifalab_hub_bot` **has all the code**, but the bot **process is not running**.

That's why it doesn't reply to `/start` or any other commands.

---

## ✅ Step 1: Start the Bot

### Option A: Run Directly (Simple, for testing)

```powershell
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
python bot/main.py
```

**You should see**:
```
Starting SAHIFALAB Telegram Bot...
Bot is running! Press Ctrl+C to stop.
```

The bot will now respond to commands in Telegram!

### Option B: Run with PM2 (Production, keeps running)

```powershell
# Install PM2 if not already installed
npm install -g pm2

# Start the bot with PM2
pm2 start bot/main.py --name sahifalab-bot --interpreter python

# View logs
pm2 logs sahifalab-bot

# Stop the bot
pm2 stop sahifalab-bot
```

---

## ✅ Step 2: Test Bot is Working

Once the bot is running:

1. **Open Telegram**
2. **Find your bot**: `@sahifalab_hub_bot`
3. **Send**: `/start`

Bot should reply with:
```
Assalomu alaykum! 👋 Meni @botfather orqali yaratdim. 

Buyruqlar:
/app — SAHIFALAB mini ilovasini ochish
/help — Barcha buyruqlarni ko'rish
/subscribe — Yangiliklardan obuna bo'lish
/latest — So'nggi yangiliklar
...
```

---

## ✅ Step 3: Send /motivate_inactive Command

**Once bot is running and /start works**:

1. **In same Telegram bot chat**: Send `/motivate_inactive 0`

Bot will respond:
```
✅ Inactive motivation dispatch completed!
Sent: 5
Failed: 2
Candidates: 7
```

---

## 📋 Bot Commands Available

Once bot is running, you can use:

```
/start              → Welcome message
/help               → List all commands
/app                → Button to open mini app
/subscribe          → Get news updates
/unsubscribe        → Stop news updates
/latest             → Last 5 news posts
/news [text]        → Broadcast news (admin only)
/schedule_news      → Schedule news (admin only)
/scheduled          → View scheduled news (admin only)
/cancel_news [id]   → Cancel scheduled news (admin only)
/motivate_inactive [hours]  → Send motivation to inactive users (admin only)
```

---

## 🔧 Environment Variables Needed

Before starting bot, make sure `.env` has:

```bash
TELEGRAM_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
API_BASE_URL=your_backend_url
MINI_APP_URL=https://your-mini-app-url
BOT_ADMIN_IDS=YOUR_TELEGRAM_ID_HERE
AUTO_MOTIVATE_ENABLED=true
AUTO_MOTIVATE_INACTIVE_HOURS=72
```

---

## ⚡ Quick Start Commands

```powershell
# Go to project directory
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"

# Start bot (simple)
python bot/main.py

# Or start with PM2 (recommended for production)
pm2 start bot/main.py --name sahifalab-bot --interpreter python

# View logs
pm2 logs sahifalab-bot

# Stop bot
pm2 stop sahifalab-bot
```

---

## 🧪 Testing Sequence

1. **Start bot**: `python bot/main.py`
2. **Open Telegram** → `@sahifalab_hub_bot`
3. **Send**: `/start`
4. **You should see**: Welcome message
5. **Send**: `/help`
6. **You should see**: All commands listed
7. **Send**: `/motivate_inactive 0` (if you're admin)
8. **You should see**: Response with sent/failed counts

If bot doesn't reply to any of these → Bot process isn't running!

---

## 🚨 Troubleshooting

### Bot doesn't reply to /start

**Cause**: Bot process not running

**Fix**:
```powershell
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
python bot/main.py
```

### Bot replies but /motivate_inactive doesn't work

**Cause**: You're not an admin OR bot has no inactive users

**Fixes**:
1. Check `BOT_ADMIN_IDS=YOUR_ID` in .env
2. Check if there are inactive users in Supabase
3. Try `/motivate_inactive 0` (message everyone, for testing)

### "TELEGRAM_BOT_TOKEN" error

**Cause**: .env file doesn't have valid token

**Fix**:
1. Get token from @BotFather in Telegram
2. Add to .env: `TELEGRAM_BOT_TOKEN=123456:ABC...`

---

## 📁 File Structure

```
bot/
  ├── main.py                 ← Start here: python bot/main.py
  ├── bot.py                  ← All bot logic (handlers, commands)
  ├── subscribers.json        ← List of subscribed users
  ├── motivation_logs.json    ← Record of sent messages
  └── news_posts.json         ← Saved news items

.env                          ← Configuration (BOT_TOKEN, ADMIN_IDS, etc)
```

---

## ✨ Next Steps

1. **Start bot**: `python bot/main.py`
2. **Test /start**: Should get welcome message
3. **Test /motivate_inactive 0**: Should send messages to users
4. **Check logs**: `bot/motivation_logs.json` for sent records

Once running, the bot will:
- ✅ Respond to all commands
- ✅ Send news to subscribers
- ✅ Automatically message inactive users every 60 minutes
- ✅ Track all sent messages in motivation_logs.json

---

## 🎯 Summary

**Your bot code is perfect!** It just needs to be **started**.

**To start**:
```powershell
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
python bot/main.py
```

**Then in Telegram send**: `/motivate_inactive 0`

That's it! 🚀

