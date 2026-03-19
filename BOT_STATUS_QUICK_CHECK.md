# Quick Check: Is Bot Sending Auto-Motivate Messages?

## 🚀 Fastest Check (30 seconds)

### Option 1: Run Status Script
```powershell
cd "d:\My Data\Coding\SAHIFALAB\Telegram App"
python check_bot_status.py
```

### Option 2: Check Log File
```powershell
cat bot/motivation_logs.json
# or
Get-Content "bot/motivation_logs.json" -Raw | ConvertFrom-Json | Format-Table
```

### Option 3: Manual Test in Telegram
1. Open your Telegram bot
2. Send: `/motivate_inactive 0`
3. Bot responds with: `Sent: X, Failed: Y, Candidates: Z`

---

## 📊 What Each Number Means

When you run `/motivate_inactive 72`:

```
Sent: 5        = ✅ Successfully sent to 5 users
Failed: 2      = ❌ Could not send to 2 users (blocked bot, etc)
Candidates: 7  = Total users matching the criteria
```

**Good sign**: If Sent > 0, bot is working!

---

## 🔍 Understanding the Files

### `bot/motivation_logs.json`
Tracks when each user got a message (for cooldown)

**Example**:
```json
{
  "123456789": "2026-03-19T10:30:45.123456+00:00",
  "987654321": "2026-03-18T15:22:10.654321+00:00"
}
```

**What it means**: User 123456789 got a message today at 10:30 UTC

### `bot/subscribers.json`
List of all users who started the bot

**If users are inactive but not in motivation_logs.json AND not in subscribers.json**: They didn't start the bot yet

---

## ⚙️ Configuration to Check

In your `.env` file:

```
AUTO_MOTIVATE_ENABLED=true               # Must be true
SUPABASE_URL=your_supabase_url           # Must be set
SUPABASE_SERVICE_ROLE_KEY=your_key       # Must be set
AUTO_MOTIVATE_INACTIVE_HOURS=72          # Default: 72 hours
AUTO_MOTIVATE_CHECK_MINUTES=60           # Default: every 60 minutes
AUTO_MOTIVATE_USER_COOLDOWN_HOURS=24     # Default: 24 hours per user
```

---

## 🧪 Test Checklist

- [ ] Run `python check_bot_status.py` - see any users messaged?
- [ ] Send `/motivate_inactive 0` - does it return Sent > 0?
- [ ] Check `bot/motivation_logs.json` - are there new entries?
- [ ] Check `bot/subscribers.json` - are inactive users in there?
- [ ] Verify bot logs - any errors?

---

## 🛠️ If Not Working

### "Sent: 0, Candidates: 0"
→ No inactive users exist yet
→ Check: `SELECT * FROM profiles WHERE app_online_at < NOW() - INTERVAL '72 hours'` in Supabase

### "Sent: 0, Candidates: 5"
→ Users inactive but not subscribers
→ Check: `bot/subscribers.json` - are they in there?

### "Failed: X"
→ Users blocked bot or not reachable
→ Normal, these get auto-removed

### Logs show "Could not fetch inactive profiles"
→ Supabase credentials wrong
→ Check: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in .env

---

## 📱 Telegram Commands (Admin Only)

```
/motivate_inactive 72           Send to inactive 72+ hours
/motivate_inactive 0            Send to ALL users (testing!)
/motivate_inactive 24           Send to inactive 24+ hours
```

Bot responds with count of sent/failed/candidates

---

## 📖 Full Guide

For detailed debugging → see: **BOT_AUTO_MOTIVATE_DEBUG_GUIDE.md**

