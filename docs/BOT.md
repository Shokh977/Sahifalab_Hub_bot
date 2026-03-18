# SAHIFALAB Telegram Bot Guide

## Overview
Python Telegram Bot for sending notifications and handling user interactions.

## Getting Started

### Installation
```bash
cd bot

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
```

### Running the Bot
```bash
python main.py
```

## Configuration

### Environment Variables (.env)
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
BACKEND_API_URL=http://localhost:8000
DEBUG=True
```

### Getting Bot Token
1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Follow instructions to create bot
4. Copy the token and add to `.env`

## Bot Features

### Commands
- `/start` - Welcome message
- `/help` - Show available commands
- `/app` - Open mini app button
- `/subscribe` - Subscribe to updates
- `/unsubscribe` - Stop updates
- `/latest` - Show latest news posts
- `/news <text>` - Broadcast news to subscribers (admin)
- `/schedule_news <date time> <text>` - Schedule a news post (admin)
- `/scheduled` - List scheduled news posts (admin)
- `/cancel_news <id>` - Cancel a scheduled post (admin)
- `/orders` - View user orders
- `/support` - Contact support

### Notifications
- Order status updates
- Promotional messages
- Delivery notifications
- Rich news posts with photo + caption (reply to a photo with `/news` or `/schedule_news`)
- Scheduled broadcasts using `BOT_TIMEZONE` (default: `Asia/Tashkent`)

## Bot Structure

```
bot/
├── bot.py           # Main bot handler class
├── main.py          # Entry point
├── requirements.txt # Dependencies
└── Dockerfile       # Docker configuration
```

## TelegramBotHandler Class

### Methods

#### start(update, context)
Handles `/start` command with welcome message.

#### help_command(update, context)
Shows available commands.

#### app_command(update, context)
Opens mini app with inline button.

#### orders_command(update, context)
Displays user orders (connect to backend).

#### support_command(update, context)
Shows support information.

#### handle_message(update, context)
Handles regular text messages.

#### send_order_notification(chat_id, order_data)
Sends order update notification.

#### send_promo_notification(chat_id, promo_data)
Sends promotional notification.

## Integration Examples

### Send Order Notification
```python
from bot.bot import get_bot

bot = get_bot()
order_data = {
    'order_number': 'ORD-000001',
    'status': 'shipped',
    'total_amount': 99.99
}
await bot.send_order_notification(chat_id=123456789, order_data)
```

### Send Promo Notification
```python
promo_data = {
    'title': '50% Off Sale',
    'discount': '50% OFF'
}
await bot.send_promo_notification(chat_id=123456789, promo_data)
```

## Sending Notifications from Backend

### Create Notification Endpoint
```python
@router.post("/users/{user_id}/notify")
async def send_notification(user_id: int, notification: NotificationData):
    user = db.query(User).filter(User.id == user_id).first()
    
    # Send via Telegram Bot
    bot = get_bot()
    await bot.send_order_notification(
        user.telegram_id,
        notification.dict()
    )
    
    return {"status": "sent"}
```

## Message Types

### Order Update
```python
{
    'order_number': 'ORD-123456',
    'status': 'shipped',
    'total_amount': 99.99,
    'tracking_url': 'https://...'
}
```

### Promotion
```python
{
    'title': 'Summer Sale',
    'discount': '30% OFF',
    'expiry': '2024-03-31'
}
```

### Delivery
```python
{
    'order_number': 'ORD-123456',
    'status': 'delivered',
    'timestamp': '2024-03-15T10:30:00'
}
```

## Inline Buttons

### Mini App Button
```python
InlineKeyboardButton(
    "🛍️ Open Mini App",
    web_app={"url": "https://yourdomain.com/app"}
)
```

### URL Button
```python
InlineKeyboardButton(
    "📦 Track Order",
    url="https://yourdomain.com/orders/123"
)
```

### Callback Button
```python
InlineKeyboardButton(
    "Confirm",
    callback_data="confirm_order_123"
)
```

## Error Handling

```python
try:
    await bot.send_message(chat_id=chat_id, text=message)
except Exception as e:
    logger.error(f"Failed to send message: {e}")
```

## Logging

Configure logging:
```python
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
```

## Testing Bot

### Test with BotFather
1. Create test bot: `/newbot`
2. Add token to `.env`
3. Run bot: `python main.py`
4. Message bot in Telegram
5. Test commands

### Test Notifications
```bash
# Send test notification
curl -X POST http://localhost:8000/api/notifications \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "title": "Test",
    "message": "Test notification"
  }'
```

## Production Deployment

### Using Webhook (Instead of Polling)
```python
from telegram.ext import Application

async def setup_webhook():
    app = Application.builder().token(TOKEN).build()
    
    await app.bot.set_webhook(
        url="https://yourdomain.com/webhook",
        certificate=open("path/to/cert.pem", "rb")
    )
```

### Docker Deployment
```bash
docker build -t sahifalab-bot .
docker run -d \
  -e TELEGRAM_BOT_TOKEN=your_token \
  -e BACKEND_API_URL=http://backend:8000 \
  sahifalab-bot
```

## Common Issues

### Bot Not Responding
- Check token is valid
- Ensure bot is running
- Check logs for errors
- Verify network connectivity

### Notifications Not Sending
- Confirm chat_id exists
- Check backend is accessible
- Verify API endpoints
- Check error logs

### Webhook Issues
- Ensure HTTPS with valid certificate
- Configure DNS records
- Check firewall rules
- Verify certificate is trusted

## Advanced Features

### Conversation Handler
```python
from telegram.ext import ConversationHandler

handler = ConversationHandler(
    entry_points=[CommandHandler('order', order_start)],
    states={
        PRODUCT: [MessageHandler(filters.TEXT, choose_product)],
        QUANTITY: [MessageHandler(filters.TEXT, choose_quantity)],
    },
    fallbacks=[CommandHandler('cancel', cancel)]
)
```

### Inline Query Handler
```python
@router.add_handler(InlineQueryHandler(inline_query))
async def inline_query(update, context):
    # Return inline search results
    pass
```

## Monitoring

### Check Bot Status
```bash
curl https://api.telegram.org/bot{TOKEN}/getMe
```

### View Bot Stats
```bash
# In bot logs
# Monitor: messages received, notifications sent, errors
```

## Resources

- [python-telegram-bot Documentation](https://python-telegram-bot.readthedocs.io/)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Telegram Web Apps](https://core.telegram.org/bots/webapps)
- [AsyncIO Documentation](https://docs.python.org/3/library/asyncio.html)

## Support

For issues:
1. Check logs: `journalctl -u sahifalab-bot -f`
2. Verify configuration
3. Check network connectivity
4. Review Telegram Bot API documentation
