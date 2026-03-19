#!/usr/bin/env python3
"""
Bot Auto-Motivate Status Checker
Quick script to check if bot is sending messages to inactive users
"""

import json
from pathlib import Path
from datetime import datetime, UTC
import os

def load_json(filepath):
    """Load JSON file safely"""
    try:
        if not Path(filepath).exists():
            return None
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error reading {filepath}: {e}")
        return None

def format_timestamp(iso_string):
    """Convert ISO timestamp to readable format"""
    try:
        dt = datetime.fromisoformat(iso_string)
        now = datetime.now(UTC)
        diff = now - dt
        
        days = diff.days
        hours = diff.seconds // 3600
        mins = (diff.seconds % 3600) // 60
        
        if days > 0:
            return f"{iso_string.split('T')[0]} ({days}d {hours}h ago)"
        elif hours > 0:
            return f"{hours}h {mins}m ago"
        else:
            return f"{mins}m ago"
    except:
        return iso_string

def check_bot_status():
    """Check bot auto-motivate status"""
    
    print("\n" + "="*60)
    print("🤖 SAHIFALAB BOT - AUTO-MOTIVATE STATUS CHECK")
    print("="*60 + "\n")
    
    bot_dir = Path(__file__).resolve().parent / "bot"
    
    # 1. Check motivation logs
    print("📊 MOTIVATION LOGS (Messages Sent)")
    print("-" * 60)
    motivation_logs = load_json(bot_dir / "motivation_logs.json")
    
    if motivation_logs:
        print(f"Total users who received messages: {len(motivation_logs)}\n")
        for user_id, timestamp in sorted(motivation_logs.items(), 
                                         key=lambda x: x[1], 
                                         reverse=True)[:10]:
            readable_time = format_timestamp(timestamp)
            print(f"  User {user_id:12} → {readable_time}")
        if len(motivation_logs) > 10:
            print(f"  ... and {len(motivation_logs) - 10} more")
    else:
        print("  ⚠️  No motivation logs yet (feature just started)")
    
    # 2. Check subscribers
    print("\n📱 BOT SUBSCRIBERS")
    print("-" * 60)
    subscribers = load_json(bot_dir / "subscribers.json")
    
    if subscribers and isinstance(subscribers, list):
        print(f"Active subscribers: {len(subscribers)}")
        print(f"Sample: {subscribers[:5]}")
    else:
        print("  ⚠️  Could not read subscribers")
    
    # 3. Check environment config
    print("\n⚙️  CONFIGURATION")
    print("-" * 60)
    auto_motivate_enabled = os.getenv("AUTO_MOTIVATE_ENABLED", "true").lower() in {"true", "1", "yes", "on"}
    inactive_hours = int(os.getenv("AUTO_MOTIVATE_INACTIVE_HOURS", "72"))
    check_minutes = int(os.getenv("AUTO_MOTIVATE_CHECK_MINUTES", "60"))
    cooldown_hours = int(os.getenv("AUTO_MOTIVATE_USER_COOLDOWN_HOURS", "24"))
    
    status_icon = "✅" if auto_motivate_enabled else "❌"
    print(f"{status_icon} AUTO_MOTIVATE_ENABLED:           {auto_motivate_enabled}")
    print(f"⏱️  Inactive threshold:            {inactive_hours} hours")
    print(f"🔄 Check interval:                {check_minutes} minutes")
    print(f"🔃 Per-user cooldown:             {cooldown_hours} hours")
    
    # 4. Summary
    print("\n" + "="*60)
    print("📋 SUMMARY")
    print("="*60)
    
    if auto_motivate_enabled:
        if motivation_logs:
            print(f"✅ Bot is WORKING - {len(motivation_logs)} users have been messaged")
            latest = max(motivation_logs.values())
            print(f"   Last message sent: {format_timestamp(latest)}")
        else:
            print("⏳ Bot is ENABLED but no messages sent yet")
            print("   Possible reasons:")
            print("   • No inactive users in the database yet")
            print("   • App's app_online_at field not being updated")
            print("   • Bot just started (check logs)")
    else:
        print("❌ Auto-motivate is DISABLED")
        print("   Enable with: AUTO_MOTIVATE_ENABLED=true")
    
    print("\n💡 HOW TO TEST MANUALLY:")
    print("   1. Send /motivate_inactive 0 to bot in Telegram")
    print("   2. Check bot/motivation_logs.json for new entries")
    print("   3. Verify users received messages")
    
    print("\n📖 See BOT_AUTO_MOTIVATE_DEBUG_GUIDE.md for detailed debugging")
    print("="*60 + "\n")

if __name__ == "__main__":
    check_bot_status()
