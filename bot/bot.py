import logging
import asyncio
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from app.core.config import settings

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

class TelegramBotHandler:
    """Telegram Bot Handler for SAHIFALAB"""
    
    def __init__(self):
        self.app = None
    
    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /start command"""
        user = update.effective_user
        message = f"Welcome to SAHIFALAB, {user.first_name}! 🎉\n\n"
        message += "Open the mini app to start shopping: /app"
        await update.message.reply_text(message)
    
    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /help command"""
        help_text = """
Available commands:
/start - Start the bot
/help - Show this help message
/app - Open the mini app
/orders - View your orders
/support - Contact support
        """
        await update.message.reply_text(help_text)
    
    async def app_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /app command - open mini app"""
        user = update.effective_user
        message = f"Click the button below to open SAHIFALAB Mini App:"
        
        from telegram import InlineKeyboardButton, InlineKeyboardMarkup
        
        keyboard = [
            [InlineKeyboardButton("🛍️ Open Mini App", 
                                web_app={"url": "https://yourdomain.com/app"})]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        
        await update.message.reply_text(message, reply_markup=reply_markup)
    
    async def orders_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /orders command"""
        user = update.effective_user
        message = f"Your recent orders:\n\n"
        message += "(Connect to backend to fetch real orders)\n"
        message += "Order #1: Pending\n"
        message += "Order #2: Delivered"
        await update.message.reply_text(message)
    
    async def support_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle /support command"""
        message = "📞 Support Team:\n\n"
        message += "Email: support@sahifalab.com\n"
        message += "Phone: +1-XXX-XXX-XXXX\n"
        message += "Live Chat: Available 9AM-9PM"
        await update.message.reply_text(message)
    
    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        """Handle regular messages"""
        message_text = update.message.text
        reply = f"I received your message: '{message_text}'\n\n"
        reply += "Use /help to see available commands."
        await update.message.reply_text(reply)
    
    async def send_order_notification(self, chat_id: int, order_data: dict):
        """Send order notification to user"""
        if not self.app:
            return False
        
        message = f"📦 Order Update!\n\n"
        message += f"Order #: {order_data.get('order_number', 'N/A')}\n"
        message += f"Status: {order_data.get('status', 'Unknown')}\n"
        message += f"Amount: ${order_data.get('total_amount', 0):.2f}"
        
        try:
            await self.app.bot.send_message(chat_id=chat_id, text=message)
            return True
        except Exception as e:
            logger.error(f"Failed to send notification: {e}")
            return False
    
    async def send_promo_notification(self, chat_id: int, promo_data: dict):
        """Send promotion notification"""
        if not self.app:
            return False
        
        message = f"🎉 Special Offer!\n\n"
        message += f"{promo_data.get('title', 'Check out our latest deals')}\n"
        message += f"Discount: {promo_data.get('discount', 'N/A')}\n"
        message += "Visit the app to redeem!"
        
        try:
            await self.app.bot.send_message(chat_id=chat_id, text=message)
            return True
        except Exception as e:
            logger.error(f"Failed to send promo notification: {e}")
            return False
    
    def setup(self):
        """Setup bot handlers"""
        self.app = Application.builder().token(settings.TELEGRAM_BOT_TOKEN).build()
        
        # Add command handlers
        self.app.add_handler(CommandHandler("start", self.start))
        self.app.add_handler(CommandHandler("help", self.help_command))
        self.app.add_handler(CommandHandler("app", self.app_command))
        self.app.add_handler(CommandHandler("orders", self.orders_command))
        self.app.add_handler(CommandHandler("support", self.support_command))
        
        # Add message handler for regular messages
        self.app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_message))
        
        return self.app
    
    async def start_polling(self):
        """Start polling updates"""
        await self.app.run_polling()

# Global bot instance
bot_handler = TelegramBotHandler()

def get_bot():
    """Get bot instance"""
    return bot_handler
