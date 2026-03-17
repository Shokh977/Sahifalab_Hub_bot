"""
SAHIFALAB Telegram Bot — Sam (16 yo mentor)
Features: /start, /app, /help, deep-link payments (Stars / Click / Payme via BotFather tokens)
"""
import logging
import os
import httpx
from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    WebAppInfo,
    LabeledPrice,
)
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    PreCheckoutQueryHandler,
    filters,
    ContextTypes,
)
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

MINI_APP_URL = os.getenv("MINI_APP_URL", "https://sahifalab-hub-bot.vercel.app")
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
API_BASE_URL = os.getenv("API_BASE_URL", "https://sahifalab-hub-bot-backend.up.railway.app")

# BotFather provider tokens (get from @BotFather → Payments → Connect provider)
CLICK_PROVIDER_TOKEN = os.getenv("CLICK_PROVIDER_TOKEN", "")
PAYME_PROVIDER_TOKEN = os.getenv("PAYME_PROVIDER_TOKEN", "")


class TelegramBotHandler:
    """SAHIFALAB Telegram Bot — Sam (16 yosh mentor)"""

    def __init__(self):
        self.app = None

    # ── /start — regular or deep-link pay_{order_id} ──────────────────────
    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        user = update.effective_user
        args = context.args  # e.g. ["pay_stars_3_807466591_abc12345"]

        # Deep link: /start pay_{order_id}
        if args and args[0].startswith("pay_"):
            order_id = args[0][4:]  # strip "pay_" prefix
            await self._send_invoice(update, context, order_id)
            return

        keyboard = [[
            InlineKeyboardButton(
                "📚 SAHIFALAB ni ochish",
                web_app=WebAppInfo(url=MINI_APP_URL),
            )
        ]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            f"Assalomu alaykum, {user.first_name}! 👋\n\n"
            "Men *Sam* — SAHIFALAB mentori.\n"
            "Kitoblar, testlar va foydali resurslar shu yerda! 📖\n\n"
            "👇 Tugmani bosing va ilovani oching:",
            parse_mode="Markdown",
            reply_markup=reply_markup,
        )

    # ── Send native Telegram invoice (Stars / Click / Payme) ─────────────
    async def _send_invoice(
        self,
        update: Update,
        context: ContextTypes.DEFAULT_TYPE,
        order_id: str,
    ) -> None:
        """
        Fetch order from backend API and send a native Telegram invoice.
        Works for all 3 providers — just different provider_token + currency.
        """
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.get(f"{API_BASE_URL}/api/payments/order/{order_id}")
                if res.status_code != 200:
                    await update.message.reply_text("❌ Buyurtma topilmadi. Qayta urinib ko'ring.")
                    return
                order = res.json()

            if order.get("status") == "completed":
                await update.message.reply_text("✅ Bu buyurtma allaqachon to'langan!")
                return

            provider = order.get("provider", "telegram_stars")
            amount = int(order.get("amount", 1))
            book_id = order.get("book_id", 0)

            # Resolve provider_token and currency
            if provider == "click":
                provider_token = CLICK_PROVIDER_TOKEN
                currency = "UZS"
                # Telegram expects amount in smallest unit (tiyins for UZS)
                invoice_amount = amount * 100
            elif provider == "payme":
                provider_token = PAYME_PROVIDER_TOKEN
                currency = "UZS"
                invoice_amount = amount * 100
            else:
                # Telegram Stars
                provider_token = ""
                currency = "XTR"
                invoice_amount = amount  # Stars are whole units

            # Fetch book title
            title = f"Kitob #{book_id}"
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    bres = await client.get(f"{API_BASE_URL}/api/books/{book_id}")
                    if bres.status_code == 200:
                        title = bres.json().get("title", title)
            except Exception:
                pass

            provider_labels = {
                "telegram_stars": "⭐ Stars",
                "click": "🟢 Click",
                "payme": "💙 Payme",
            }
            provider_label = provider_labels.get(provider, provider)

            await context.bot.send_invoice(
                chat_id=update.effective_chat.id,
                title=f"📕 {title}",
                description=f"SAHIFALAB kitob sotib olish ({provider_label})\nBuyurtma: {order_id}",
                payload=order_id,
                provider_token=provider_token,
                currency=currency,
                prices=[LabeledPrice(label=title, amount=invoice_amount)],
            )
            logger.info(
                f"[Payment] Invoice sent: order={order_id} provider={provider} "
                f"amount={invoice_amount} {currency}"
            )

        except Exception as e:
            logger.error(f"[Stars] Invoice error: {e}")
            await update.message.reply_text(
                "❌ Xato yuz berdi. Keyinroq urinib ko'ring."
            )

    # ── Pre-checkout query — must answer within 10 seconds ─────────────────
    async def pre_checkout(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        query = update.pre_checkout_query
        logger.info(f"[Payment] pre_checkout: payload={query.invoice_payload}")
        # Always approve — real validation already happened when creating the order
        await query.answer(ok=True)

    # ── Successful payment — mark order completed ──────────────────────────
    async def successful_payment(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        payment = update.message.successful_payment
        order_id = payment.invoice_payload
        charge_id = payment.telegram_payment_charge_id
        logger.info(f"[Payment] Payment OK: order={order_id} charge={charge_id}")

        # Tell backend to mark order as completed
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                res = await client.post(
                    f"{API_BASE_URL}/api/payments/complete-order",
                    params={
                        "order_id": order_id,
                        "telegram_payment_charge_id": charge_id,
                    },
                )
                logger.info(f"[Payment] Backend complete response: {res.status_code} {res.text}")
        except Exception as e:
            logger.error(f"[Payment] Backend complete error: {e}")

        await update.message.reply_text(
            "🎉 To'lov muvaffaqiyatli amalga oshirildi!\n\n"
            "📕 Kitobni yuklab olish uchun SAHIFALAB ilovasiga qayting.\n"
            "Rahmat! 🙏",
        )

    # ── /help ─────────────────────────────────────────────────────────────
    async def help_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await update.message.reply_text(
            "📋 *Buyruqlar ro'yxati:*\n\n"
            "/start — Boshlash\n"
            "/app — Ilovani ochish\n"
            "/help — Yordam\n\n"
            "Savollar bo'lsa, menga yozing! 😊",
            parse_mode="Markdown",
        )

    # ── /app ──────────────────────────────────────────────────────────────
    async def app_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        keyboard = [[
            InlineKeyboardButton(
                "🚀 Ilovani ochish",
                web_app=WebAppInfo(url=MINI_APP_URL),
            )
        ]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            "📚 SAHIFALAB — o'qish platformasi\n"
            "Kitoblar, testlar va resurslar sizni kutmoqda!",
            reply_markup=reply_markup,
        )

    # ── Fallback ─────────────────────────────────────────────────────────
    async def handle_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        keyboard = [[
            InlineKeyboardButton(
                "📚 Ilovani ochish",
                web_app=WebAppInfo(url=MINI_APP_URL),
            )
        ]]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            "Ilovani ochib ko'ring! 👇",
            reply_markup=reply_markup,
        )

    # ── Setup ─────────────────────────────────────────────────────────────
    def setup(self):
        self.app = Application.builder().token(BOT_TOKEN).build()
        self.app.add_handler(CommandHandler("start", self.start))
        self.app.add_handler(CommandHandler("help", self.help_command))
        self.app.add_handler(CommandHandler("app", self.app_command))
        # Payment handlers
        self.app.add_handler(PreCheckoutQueryHandler(self.pre_checkout))
        self.app.add_handler(
            MessageHandler(filters.SUCCESSFUL_PAYMENT, self.successful_payment)
        )
        # Text fallback
        self.app.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self.handle_message)
        )
        return self.app

    async def start_polling(self):
        await self.app.run_polling(drop_pending_updates=True)


bot_handler = TelegramBotHandler()
