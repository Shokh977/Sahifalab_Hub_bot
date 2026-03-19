# How to Check Bot Auto-Motivate Status - Complete Guide

## 🎯 TL;DR - Quickest Way

```powershell
# 1. Run this PowerShell script
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
powershell -File check-bot.ps1

# 2. Or check the file directly
Get-Content "bot/motivation_logs.json" -Raw

# 3. Or test manually in Telegram
Send bot this command: /motivate_inactive 0
```

---

## 📊 Methods to Check Bot Status

### Method 1: PowerShell Status Script (Easiest)

```powershell
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
powershell -File check-bot.ps1
```

**Output**:
```
SAHIFALAB BOT STATUS CHECK
======================================

1. Motivation Logs File
   Path: bot/motivation_logs.json
   Status: File does not exist (feature just started)

2. Subscribers File
   Path: bot/subscribers.json
   Status: File does not exist yet
```

**What this tells you**:
- If `Status: File exists with X users messaged` → ✅ Bot is working!
- If `File does not exist` → ⏳ Feature just started or hasn't sent any yet

---

### Method 2: View Motivation Logs Directly

The bot saves a record of every message sent in `bot/motivation_logs.json`

```powershell
# View the file
Get-Content "bot/motivation_logs.json" -Raw

# Pretty print it
Get-Content "bot/motivation_logs.json" -Raw | ConvertFrom-Json | Format-Table
```

**File format**:
```json
{
  "123456789": "2026-03-19T10:30:45.123456+00:00",
  "987654321": "2026-03-19T09:15:22.654321+00:00",
  "555666777": "2026-03-18T14:00:00.000000+00:00"
}
```

**What it means**:
- Each key = User's Telegram ID
- Value = ISO timestamp when message was sent
- **If any entries exist** → ✅ Bot successfully sent messages!

---

### Method 3: Manual Test in Telegram (Most Reliable)

**Best for testing if the system actually works**

1. Open your Telegram bot
2. Send command: `/motivate_inactive 0`
3. Bot immediately responds with:

```
✅ Inactive motivation dispatch completed!
Sent: 5
Failed: 2
Candidates: 7
```

**Understanding the response**:
- **Sent: 5** = Successfully sent messages to 5 users ✅
- **Failed: 2** = Couldn't send to 2 users (they blocked bot, not subscribers, etc)
- **Candidates: 7** = Total users matching the criteria

**If Sent > 0 → System is working! 🎉**

---

### Method 4: Check Supabase for Inactive Users

See who is actually inactive in the database:

1. Go to [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Go to SQL Editor
4. Run this query:

```sql
SELECT 
  id,
  telegram_id,
  first_name,
  app_online_at,
  (NOW() - app_online_at)::interval as inactive_duration
FROM profiles
WHERE app_online_at < NOW() - INTERVAL '72 hours'
ORDER BY app_online_at ASC
LIMIT 20;
```

**What this shows**:
- All users inactive for 72+ hours
- When they were last active
- How long they've been inactive

**If this returns rows → there ARE inactive users to message**

---

### Method 5: Check Bot Logs

While the bot is running, it logs all activities:

```
[AUTO-MOTIVATE] Starting inactive user check...
[AUTO-MOTIVATE] Check complete - Sent: 5, Failed: 2, Candidates: 7
```

**Where to see logs**:
- If using PM2: `pm2 logs bot`
- If running directly: Check your terminal where bot is running
- Bot logs to terminal with timestamps

---

## 🔧 Configuration to Verify

Make sure these are set in your `.env`:

```bash
# Must be true to enable auto-motivate
AUTO_MOTIVATE_ENABLED=true

# Supabase credentials (required!)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Telegram bot token
TELEGRAM_BOT_TOKEN=123456:ABC...

# Optional - these have defaults
AUTO_MOTIVATE_INACTIVE_HOURS=72           # Default: 72 hours
AUTO_MOTIVATE_CHECK_MINUTES=60            # Default: every 60 minutes
AUTO_MOTIVATE_USER_COOLDOWN_HOURS=24      # Default: 24 hours between messages
```

**To check what's set**:
```powershell
# View .env file
Get-Content ".env" | Select-String "AUTO_MOTIVATE|SUPABASE"
```

---

## 🧪 Full Test Sequence

### Step 1: Verify Configuration
```powershell
# Check environment variables
Get-Content ".env" | Select-String "AUTO_MOTIVATE"
```

Expected output:
```
AUTO_MOTIVATE_ENABLED=true
AUTO_MOTIVATE_INACTIVE_HOURS=72
AUTO_MOTIVATE_CHECK_MINUTES=60
AUTO_MOTIVATE_USER_COOLDOWN_HOURS=24
```

### Step 2: Find Inactive Users
```sql
-- Run in Supabase SQL Editor
SELECT COUNT(*) as inactive_users
FROM profiles
WHERE app_online_at < NOW() - INTERVAL '72 hours';
```

If 0 rows → No inactive users yet (everyone is active!)

### Step 3: Manual Test
```
Send in Telegram bot: /motivate_inactive 0
Response: Sent: X, Failed: Y, Candidates: Z
```

If Sent > 0 → ✅ System working!

### Step 4: Verify Messages Sent
```powershell
# Check logs file
Get-Content "bot/motivation_logs.json" -Raw | ConvertFrom-Json | Measure-Object -Property *
```

Should show new entries if test succeeded.

### Step 5: Confirm Users Got Messages
- Users should receive Telegram DM from bot
- Message includes "SAHIFALAB" button to open app

---

## ⚠️ Troubleshooting

### Problem: "Sent: 0, Candidates: 0"
**Cause**: No inactive users exist
**Fix**: 
- Check if app is updating `app_online_at` (run ProgressProvider on frontend)
- Wait for some users to become inactive (72+ hours without opening app)

### Problem: "Sent: 0, Candidates: 5"
**Cause**: Users are inactive but not bot subscribers
**Fix**:
- These users haven't started the bot yet
- They'll only get messages if they start the bot first

### Problem: "Failed: 3"
**Cause**: Users blocked bot or unreachable
**Fix**:
- This is normal - Telegram API rejects blocked users
- They're auto-removed from subscriber list

### Problem: Bot doesn't respond to /motivate_inactive
**Cause**: You're not an admin OR bot isn't running
**Fix**:
- Verify your Telegram ID is in `BOT_ADMIN_IDS` env var
- Check if bot process is running: `ps | grep python` or `pm2 list`

### Problem: Messages say "Could not fetch inactive profiles"
**Cause**: Supabase credentials wrong or database inaccessible
**Fix**:
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in .env
- Check Supabase project is not rate limited
- Verify RLS policies allow bot access

---

## 📁 Files to Monitor

| File | Purpose | How to View |
|------|---------|-----------|
| `bot/motivation_logs.json` | Record of all sent messages | `Get-Content bot/motivation_logs.json -Raw` |
| `bot/subscribers.json` | List of bot users | `Get-Content bot/subscribers.json -Raw` |
| `.env` | Configuration | `Get-Content .env` |
| Bot logs | Real-time activity | Terminal where bot runs |

---

## 🚀 How Auto-Motivate Works

1. **Every 60 minutes** (configurable): Bot wakes up and checks
2. **Query Supabase**: Find users inactive 72+ hours
3. **Check cooldown**: Haven't messaged them in 24 hours?
4. **Send message**: "بخش بخش آپ سے فاتح؟ اپنی سيخي کو شروع کریں!"
5. **Log timestamp**: Record when message was sent
6. **Respect blocking**: If user blocked bot, remove from subscribers

**Example timeline**:
```
10:00 - Bot checks, finds 3 inactive users, sends 3 messages
11:00 - Bot checks again, all 3 within cooldown, sends 0
14:30 - User 1 becomes active, opens app - gets marked active
22:00 - Bot checks again, finds User 2 & 3 still inactive, cooldown passed, sends 2 more
```

---

## 💡 Tips for Success

✅ **Make sure**:
- `AUTO_MOTIVATE_ENABLED=true` in .env
- Supabase credentials are correct
- Bot is actually running
- Users have started the bot at least once

✅ **Test with**:
- `/motivate_inactive 0` - Send to ALL users (testing only!)
- `/motivate_inactive 24` - Users inactive 24+ hours
- `/motivate_inactive 72` - Default: 72+ hours

✅ **Monitor with**:
- `powershell -File check-bot.ps1` - Quick status
- `Get-Content bot/motivation_logs.json` - See who got messaged
- Telegram DMs - Users should receive messages

---

## 📖 Related Documentation

- **Full debugging guide**: [BOT_AUTO_MOTIVATE_DEBUG_GUIDE.md](BOT_AUTO_MOTIVATE_DEBUG_GUIDE.md)
- **Quick reference**: [BOT_STATUS_QUICK_CHECK.md](BOT_STATUS_QUICK_CHECK.md)
- **Python status script**: `check_bot_status.py`
- **PowerShell status script**: `check-bot.ps1`

---

## Questions?

If bot isn't working:
1. Run `check-bot.ps1` - tells you what's set up
2. Try `/motivate_inactive 0` in Telegram - test manually
3. Check `bot/motivation_logs.json` - see if messages were logged
4. Check Supabase for inactive users - query directly
5. Review Telegram bot token and admin IDs in `.env`

Happy testing! 🎉

