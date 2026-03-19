#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Quick status checker for SAHIFALAB bot auto-motivate feature
.DESCRIPTION
  Shows if bot is sending messages to inactive users
#>

function Check-BotStatus {
    Write-Host "`n" -ForegroundColor Black
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "🤖  SAHIFALAB BOT STATUS CHECK" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Check motivation logs
    Write-Host "📊 MOTIVATION LOGS (Messages Sent)" -ForegroundColor Yellow
    Write-Host "-----------------------------------------" -ForegroundColor Gray
    
    $motLogPath = "bot/motivation_logs.json"
    if (Test-Path $motLogPath) {
        try {
            $logs = Get-Content $motLogPath -Raw | ConvertFrom-Json
            $count = ($logs | Get-Member -MemberType NoteProperty).Count
            Write-Host "✅ Found $count users who received messages" -ForegroundColor Green
            
            $logs | Get-Member -MemberType NoteProperty | Select-Object -First 5 | ForEach-Object {
                $userId = $_.Name
                $timestamp = $logs.$userId
                Write-Host "   • User $userId → Last sent: $timestamp"
            }
            
            if ($count -gt 5) {
                Write-Host "   ... and $($count - 5) more" -ForegroundColor Gray
            }
        } catch {
            Write-Host "⚠️  Could not parse logs: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "⏳ No motivation logs yet (feature just started)" -ForegroundColor Yellow
        Write-Host "   → Try sending /motivate_inactive 0 to bot" -ForegroundColor Gray
    }
    
    # Check subscribers
    Write-Host "`n📱 BOT SUBSCRIBERS" -ForegroundColor Yellow
    Write-Host "-----------------------------------------" -ForegroundColor Gray
    
    $subPath = "bot/subscribers.json"
    if (Test-Path $subPath) {
        try {
            $subs = Get-Content $subPath -Raw | ConvertFrom-Json
            if ($subs -is [array]) {
                Write-Host "✅ Active subscribers: $($subs.Count)" -ForegroundColor Green
            } else {
                Write-Host "✅ Subscribers file exists" -ForegroundColor Green
            }
        } catch {
            Write-Host "⚠️  Could not read subscribers" -ForegroundColor Yellow
        }
    } else {
        Write-Host "ℹ️  No subscribers file yet" -ForegroundColor Cyan
    }
    
    # Check configuration
    Write-Host "`n⚙️  CONFIGURATION" -ForegroundColor Yellow
    Write-Host "-----------------------------------------" -ForegroundColor Gray
    
    $envPath = ".env"
    if (Test-Path $envPath) {
        Write-Host "Environment variables loaded from .env:" -ForegroundColor Cyan
        
        $env:AUTO_MOTIVATE_ENABLED = if ($env:AUTO_MOTIVATE_ENABLED) { $env:AUTO_MOTIVATE_ENABLED } else { "true (default)" }
        $env:AUTO_MOTIVATE_INACTIVE_HOURS = if ($env:AUTO_MOTIVATE_INACTIVE_HOURS) { $env:AUTO_MOTIVATE_INACTIVE_HOURS } else { "72 (default)" }
        $env:AUTO_MOTIVATE_CHECK_MINUTES = if ($env:AUTO_MOTIVATE_CHECK_MINUTES) { $env:AUTO_MOTIVATE_CHECK_MINUTES } else { "60 (default)" }
        $env:AUTO_MOTIVATE_USER_COOLDOWN_HOURS = if ($env:AUTO_MOTIVATE_USER_COOLDOWN_HOURS) { $env:AUTO_MOTIVATE_USER_COOLDOWN_HOURS } else { "24 (default)" }
        
        $enabled = ($env:AUTO_MOTIVATE_ENABLED -eq "true") -or ($env:AUTO_MOTIVATE_ENABLED -eq "1")
        $icon = if ($enabled) { "✅" } else { "❌" }
        
        Write-Host "  $icon AUTO_MOTIVATE_ENABLED:      $env:AUTO_MOTIVATE_ENABLED" -ForegroundColor $(if ($enabled) { "Green" } else { "Red" })
        Write-Host "  ⏱️  Inactive threshold:           $env:AUTO_MOTIVATE_INACTIVE_HOURS hours" -ForegroundColor Cyan
        Write-Host "  🔄 Check interval:               $env:AUTO_MOTIVATE_CHECK_MINUTES minutes" -ForegroundColor Cyan
        Write-Host "  🔃 Per-user cooldown:            $env:AUTO_MOTIVATE_USER_COOLDOWN_HOURS hours" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  .env file not found (using defaults)" -ForegroundColor Yellow
    }
    
    # Summary
    Write-Host "`n" -ForegroundColor Black
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "📋 QUICK TEST" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1️⃣  To manually test sending messages:" -ForegroundColor Cyan
    Write-Host "    Send this in your Telegram bot:" -ForegroundColor Gray
    Write-Host "    /motivate_inactive 0" -ForegroundColor White
    Write-Host ""
    Write-Host "2️⃣  Bot will respond with:" -ForegroundColor Cyan
    Write-Host "    ✅ Inactive motivation dispatch completed!" -ForegroundColor Gray
    Write-Host "    Sent: X" -ForegroundColor Gray
    Write-Host "    Failed: Y" -ForegroundColor Gray
    Write-Host "    Candidates: Z" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3️⃣  Check results here:" -ForegroundColor Cyan
    Write-Host "    • bot/motivation_logs.json (who got messaged)" -ForegroundColor Gray
    Write-Host "    • Telegram (users should receive DM)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host "📖 For detailed help: BOT_AUTO_MOTIVATE_DEBUG_GUIDE.md" -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host ""
}

# Run the check
Check-BotStatus
