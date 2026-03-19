# Simple Bot Status Check
# Usage: .\check-bot.ps1

Write-Host "======================================"
Write-Host "SAHIFALAB BOT STATUS CHECK"
Write-Host "======================================"
Write-Host ""

# Check if motivation logs exist
Write-Host "1. Motivation Logs File"
Write-Host "   Path: bot/motivation_logs.json"

if (Test-Path "bot/motivation_logs.json") {
    $logs = Get-Content "bot/motivation_logs.json" -Raw | ConvertFrom-Json
    $count = ($logs | Get-Member -MemberType NoteProperty).Count
    Write-Host "   Status: File exists with $count users messaged" -ForegroundColor Green
} else {
    Write-Host "   Status: File does not exist (feature just started)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "2. Subscribers File"
Write-Host "   Path: bot/subscribers.json"

if (Test-Path "bot/subscribers.json") {
    Write-Host "   Status: File exists" -ForegroundColor Green
} else {
    Write-Host "   Status: File does not exist yet" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "======================================"
Write-Host "HOW TO TEST"
Write-Host "======================================"
Write-Host ""
Write-Host "1. Open Telegram bot"
Write-Host "2. Send: /motivate_inactive 0"
Write-Host "3. Bot responds with: Sent: X, Failed: Y, Candidates: Z"
Write-Host "4. Check bot/motivation_logs.json for new entries"
Write-Host ""
Write-Host "If Sent > 0 = Bot is working!"
Write-Host ""
