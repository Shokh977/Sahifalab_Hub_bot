# Bot Auto-Motivate Status Checking - Quick Reference

## 🚀 Three Ways to Check

### 1️⃣ **Run PowerShell Script (Easiest - 5 seconds)**
```powershell
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
powershell -File check-bot.ps1
```

Shows:
- ✅ If `motivation_logs.json` exists (messages were sent)
- ✅ If `subscribers.json` exists (bot has users)
- ✅ Quick test instructions

---

### 2️⃣ **Test in Telegram (Most Reliable - 10 seconds)**
Send this command to your bot:
```
/motivate_inactive 0
```

Bot responds:
```
✅ Inactive motivation dispatch completed!
Sent: 5
Failed: 2
Candidates: 7
```

**Meaning**:
- **Sent: 5** = ✅ Successfully sent to 5 users (WORKING!)
- **Failed: 2** = Couldn't send (they blocked bot)
- **Candidates: 7** = Total inactive users found

**If Sent > 0 = System is working! 🎉**

---

### 3️⃣ **Check Log File Directly (5 seconds)**
```powershell
Get-Content "bot/motivation_logs.json" -Raw
```

If it shows something like this = ✅ Messages were sent:
```json
{
  "123456789": "2026-03-19T10:30:45.123456+00:00",
  "987654321": "2026-03-19T09:15:22.654321+00:00"
}
```

If file doesn't exist = ⏳ No messages sent yet (check why)

---

## 🔍 Understanding the Results

### ✅ Good Signs
- `motivation_logs.json` exists with entries
- `/motivate_inactive 0` returns Sent > 0
- Users receive Telegram DM from bot
- Log file grows over time

### ⚠️ Issues to Check
| Problem | Cause | Solution |
|---------|-------|----------|
| File doesn't exist | No messages sent yet | Check if there are inactive users |
| Sent: 0, Candidates: 0 | No inactive users | Wait for users to become inactive or check ProgressProvider |
| Sent: 0, Candidates: 5 | Users inactive but not subscribers | Users must /start bot first |
| Failed: X | Users blocked bot | Normal, auto-removes them |

---

## 📋 Configuration Checklist

Make sure these are set in `.env`:

```bash
✅ AUTO_MOTIVATE_ENABLED=true              # Must be true
✅ SUPABASE_URL=https://...                # Your Supabase URL
✅ SUPABASE_SERVICE_ROLE_KEY=eyJ...        # Your service role key
✅ TELEGRAM_BOT_TOKEN=123456:ABC...        # Your bot token
```

Optional (have defaults):
```bash
AUTO_MOTIVATE_INACTIVE_HOURS=72            # Default: 72 hours
AUTO_MOTIVATE_CHECK_MINUTES=60             # Default: every 60 min
AUTO_MOTIVATE_USER_COOLDOWN_HOURS=24       # Default: 24 hours
```

---

## 📊 What Happens Behind the Scenes

```
Every 60 minutes:
├─ Bot wakes up
├─ Query Supabase: Find users inactive 72+ hours
├─ Check cooldown: Did we message them in last 24h?
├─ Send message: "Come back to SAHIFALAB!"
├─ Log timestamp: Record in motivation_logs.json
└─ Respect blocks: Remove users who blocked bot

Result in motivation_logs.json:
{
  "user_id": "sent_timestamp",
  "user_id": "sent_timestamp"
}
```

---

## 🧪 Testing Sequence

```
Step 1: Check config
        powershell -File check-bot.ps1

Step 2: Find inactive users in Supabase
        Run SQL query to see who's inactive 72+ hours

Step 3: Manual test
        Send: /motivate_inactive 0

Step 4: Check results
        Get-Content bot/motivation_logs.json -Raw
        Should see new entries!

Step 5: Verify users got message
        Users should have DM from bot
```

---

## 📚 Full Documentation

| Document | Use For |
|----------|---------|
| **BOT_CHECKING_COMPLETE_GUIDE.md** | 📖 Comprehensive guide with all details |
| **BOT_AUTO_MOTIVATE_DEBUG_GUIDE.md** | 🔧 Deep debugging and troubleshooting |
| **BOT_STATUS_QUICK_CHECK.md** | ⚡ One-page quick reference |
| **check-bot.ps1** | 🚀 Run to see current status |
| **check_bot_status.py** | 🐍 Python version (if you prefer) |

---

## ⚡ TL;DR - Just Tell Me If It's Working

### Fastest Check (10 seconds):
```
1. Open Telegram bot
2. Send: /motivate_inactive 0
3. If responds "Sent: X" where X > 0
   → ✅ WORKING!
```

### Second Fastest (5 seconds):
```
1. Run: powershell -File check-bot.ps1
2. Check if "motivation_logs.json" has entries
   → ✅ WORKING!
```

### Fallback (30 seconds):
```
1. Check Supabase for inactive users (SQL query)
2. If users exist AND motivation_logs.json has entries
   → ✅ WORKING!
```

---

## 🎯 Next Steps

**If Working** ✅
- Monitor: Bot runs every 60 minutes automatically
- Users in inactive 72+ hours will get DM
- Each user gets messaged once per 24 hours max (cooldown)

**If Not Working** ❌
1. Check AUTO_MOTIVATE_ENABLED=true
2. Verify Supabase credentials
3. Look for inactive users in database
4. Run `/motivate_inactive 0` and watch bot logs
5. See **BOT_CHECKING_COMPLETE_GUIDE.md** for troubleshooting

---

**Questions?** See the full guides or check bot logs! 🚀

