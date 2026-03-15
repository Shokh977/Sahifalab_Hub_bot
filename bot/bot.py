import logging
import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo, MenuButtonWebApp
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

MINI_APP_URL = os.getenv("MINI_APP_URL", "https://sahifalab-hub-bot.vercel.app")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


class TelegramBotHandler:
    """SAHIFALAB Telegram Bot — Sam (16 yosh mentor)"""

    def __init__(self):
        self.app = None

    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        user = update.effective_user
        keyboard = [[
            InlineKeyboardButton(
                "📚 SAHIFALAB ni ochish",
                web_app=WebAppInfo(url=MINI_APP_URL)
            )
        ]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            f"Assalomu alaykum, {user.first_name}! 👋\n\n"
            "Men *Sam* — SAHIFALAB mentori.\n"
            "Kitoblar, testlar va foydali resurslar shu yerda! 📖\n\n"
            "👇 Tugmani bosing va ilovani oching:",
            parse_mode="Markdown",
            reply_markup=reply_markup
        )

    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await update.message.reply_text(
            "📋 *Buyruqlar ro'yxati:*\n\n"
            "/start — Boshlash\n"
            "/app — Ilovani ochish\n"
            "/help — Yordam\n\n"
            "Savollar bo'lsa, menga yozing! 😊",
            parse_mode="Markdown"
        )

    async def app_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        keyboard = [[
            InlineKeyboardButton(
                "🚀 Ilovani ochish",
                web_app=WebAppInfo(url=MINI_APP_URL)
            )
        ]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            "📚 SAHIFALAB — o'qish platformasi\n"
            "Kitoblar, testlar va resurslar sizni kutmoqda!",
            reply_markup=reply_markup
        )

    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        keyboard = [[
            InlineKeyboardButton(
                "📚 Ilovani ochish",
                web_app=WebAppInfo(url=MINI_APP_URL)
            )
        ]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            "Ilovani ochib ko'ring! 👇",
            reply_markup=reply_markup
        )

    def setup(self):
        self.app = Application.builder().token(BOT_TOKEN).build()
        self.app.add_handler(CommandHandler("start", self.start))
        self.app.add_handler(CommandHandler("help", self.help_command))
        self.app.add_handler(CommandHandler("app", self.app_command))
        self.app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_message))
        return self.app

    async def start_polling(self):
        await self.app.run_polling(drop_pending_updates=True)


bot_handler = TelegramBotHandler()
