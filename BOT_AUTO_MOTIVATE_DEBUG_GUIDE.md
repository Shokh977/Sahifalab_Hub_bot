# How to Check Bot Auto-Motivate Status

## 1. Check Motivation Logs File

The bot stores all sent messages in `bot/motivation_logs.json`. This file tracks per-user timestamps of when motivational messages were sent (for cooldown management).

**Location**: `bot/motivation_logs.json`

**Content format**:
```json
{
  "123456789": "2026-03-19T10:30:45.123456+00:00",
  "987654321": "2026-03-19T09:15:22.654321+00:00"
}
```

Each key is a Telegram user ID, and the value is the ISO timestamp when the last motivational message was sent.

**How to check**:
```powershell
# View the motivation logs
Get-Content "bot/motivation_logs.json" -Raw | ConvertFrom-Json

# Pretty print it
Get-Content "bot/motivation_logs.json" -Raw | ConvertFrom-Json | Format-Table
```

---

## 2. Check Bot Logs in Real-Time

The bot logs all its activities. Look for lines with:
- ✅ `Sent N inactive motivation msgs` - Success
- ⚠️ `Failed to send auto motivation to XXXXX: Forbidden` - User blocked bot
- 📊 `Auto-motivate check: candidates=X, sent=Y, failed=Z`

**View logs while bot is running**:
```bash
# If using PM2
pm2 logs bot

# If running directly
# The logs appear in your terminal where bot is running
```

---

## 3. Manually Test with Admin Command

The fastest way to test if the system works.

**Send this in Telegram bot**:
```
/motivate_inactive 72
```

This will:
1. Find all users inactive for 72 hours
2. Send them a motivational message (respecting cooldowns)
3. Return: `Sent: X, Failed: Y, Candidates: Z`

**Example response**:
```
✅ Inactive motivation dispatch completed!
Sent: 5
Failed: 2 (users blocked bot or not subscribers)
Candidates: 7 (matched inactive criteria)
```

---

## 4. Check Supabase for Inactive Users

Query your Supabase database to see who is actually inactive.

**SQL Query in Supabase Dashboard**:
```sql
-- Find users inactive for 72 hours
SELECT 
  id,
  telegram_id,
  first_name,
  app_online_at,
  updated_at,
  NOW() - app_online_at as inactive_duration
FROM profiles
WHERE app_online_at < NOW() - INTERVAL '72 hours'
ORDER BY app_online_at ASC
LIMIT 20;
```

**Expected output**:
```
ID | Telegram ID | Name    | Last Active         | Inactive For
1  | 123456789   | Rahmat  | 2026-03-16 08:00:00 | 3 days 2 hours
2  | 987654321   | Zarina  | 2026-03-15 14:30:00 | 4 days 1 hour
```

---

## 5. Check Bot Configuration

Verify your environment variables are set correctly:

```powershell
# View auto-motivate settings
Write-Host "AUTO_MOTIVATE_ENABLED: $(if ($env:AUTO_MOTIVATE_ENABLED -eq 'true') { '✅ ON' } else { '❌ OFF' })"
Write-Host "Inactive threshold: $env:AUTO_MOTIVATE_INACTIVE_HOURS hours"
Write-Host "Check interval: $env:AUTO_MOTIVATE_CHECK_MINUTES minutes"
Write-Host "Per-user cooldown: $env:AUTO_MOTIVATE_USER_COOLDOWN_HOURS hours"
```

**Expected defaults** (if not set):
- `AUTO_MOTIVATE_ENABLED` = true
- `AUTO_MOTIVATE_INACTIVE_HOURS` = 72
- `AUTO_MOTIVATE_CHECK_MINUTES` = 60
- `AUTO_MOTIVATE_USER_COOLDOWN_HOURS` = 24

---

## 6. Enable Debug Logging

To see exactly what the bot is doing, add debug logging to `bot/bot.py`:

**Find this section** (around line 430-435):
```python
if AUTO_MOTIVATE_ENABLED and len(profiles) > 0:
    if not self.last_auto_motivate_run or (now - self.last_auto_motivate_run).total_seconds() >= check_interval_secs:
        self.last_auto_motivate_run = now
        sent, failed, candidates = await self._dispatch_inactive_motivation(
```

**Add logging before the call**:
```python
logger.info(f"[AUTO-MOTIVATE] Starting inactive user check...")
logger.info(f"[AUTO-MOTIVATE] Inactive threshold: {AUTO_MOTIVATE_INACTIVE_HOURS} hours")
sent, failed, candidates = await self._dispatch_inactive_motivation(
```

**Add logging after**:
```python
logger.info(f"[AUTO-MOTIVATE] ✅ Check complete - Sent: {sent}, Failed: {failed}, Candidates: {candidates}")
```

---

## 7. Full Debugging Checklist

Use this checklist to troubleshoot:

### ✅ Prerequisites
- [ ] `AUTO_MOTIVATE_ENABLED=true` in .env
- [ ] `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set correctly
- [ ] Bot has valid `TELEGRAM_BOT_TOKEN`
- [ ] Bot is running (not stopped)

### ✅ Test Steps
1. [ ] Run `/motivate_inactive 0` (to check ALL inactive users, no threshold)
2. [ ] Check `bot/motivation_logs.json` for new entries
3. [ ] Verify users received the message in Telegram
4. [ ] Query Supabase to see who is inactive
5. [ ] Run `/motivate_inactive 72` again and confirm cooldown is working

### ✅ If Not Working
- [ ] Check bot logs for errors
- [ ] Verify user is a bot subscriber (check `bot/subscribers.json`)
- [ ] Confirm `app_online_at` is being updated (check ProgressProvider in frontend)
- [ ] Ensure users haven't blocked the bot
- [ ] Check Supabase RLS policies allow bot access

---

## 8. Example: Full Test Sequence

```powershell
# 1. Check if bot is running
ps | grep python

# 2. View current inactive users
# (Run this SQL in Supabase)

# 3. Send test message via admin command
# (Send /motivate_inactive 0 in Telegram)

# 4. Check logs created
Get-Content "bot/motivation_logs.json" -Raw

# 5. Verify in Telegram that users got messages

# 6. Check cooldown is working (run again - should send 0)
# (Send /motivate_inactive 72 in Telegram)
```

---

## Key Files to Monitor

| File | Purpose | Check via |
|------|---------|-----------|
| `bot/motivation_logs.json` | Tracks sent messages & cooldowns | Open file in editor |
| `bot/subscribers.json` | Active bot users | Open file in editor |
| Supabase `profiles` table | User activity timestamps | Supabase dashboard |
| Bot console logs | Real-time activity | PM2 logs or terminal |

---

## Common Issues & Fixes

### Issue: "Sent: 0, Candidates: 0"
**Cause**: No inactive users found
**Fix**: 
- Check Supabase for users with old `app_online_at` values
- Verify the app is setting `app_online_at` (check ProgressProvider heartbeat)

### Issue: "Sent: 0, Candidates: 5"
**Cause**: Users matched but weren't bot subscribers
**Fix**: Check `bot/subscribers.json` - users must have started the bot

### Issue: "Failed: X"
**Cause**: Users blocked the bot or have forbidden status
**Fix**: These users will be removed from subscribers automatically

### Issue: Repeating sends to same user
**Cause**: Cooldown not working
**Fix**: Check `motivation_logs.json` has correct ISO timestamps

---

## Advanced: Manual Motivation Send

To send a message to a specific user (admin only):

```
/motivate_user 123456789 "Custom message here"
```

(This command works if implemented, otherwise use manual Telegram messaging)

