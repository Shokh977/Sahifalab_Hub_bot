"""
SAHIFALAB Telegram Bot — Sam (16 yo mentor)
Features: /start, /app, /help, deep-link payments (Stars / Click / Payme via BotFather tokens)
"""
import logging
import os
import json
import asyncio
from pathlib import Path
from datetime import datetime, UTC
from typing import Any
from zoneinfo import ZoneInfo
import httpx
from telegram import (
    Update,
    Bot,
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
from telegram.error import Forbidden
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
        self.data_dir = Path(__file__).resolve().parent
        self.subscribers_file = self.data_dir / "subscribers.json"
        self.news_file = self.data_dir / "news_posts.json"
        self.scheduled_news_file = self.data_dir / "scheduled_news.json"
        self.admin_ids = self._parse_admin_ids(os.getenv("BOT_ADMIN_IDS", ""))
        self.timezone = ZoneInfo(os.getenv("BOT_TIMEZONE", "Asia/Tashkent"))
        self.file_lock = asyncio.Lock()
        self.scheduler_task: asyncio.Task | None = None

    @staticmethod
    def _parse_admin_ids(raw: str) -> set[int]:
        ids: set[int] = set()
        for chunk in raw.split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            try:
                ids.add(int(chunk))
            except ValueError:
                logger.warning(f"Invalid BOT_ADMIN_IDS entry ignored: {chunk}")
        return ids

    def _is_admin(self, telegram_user_id: int | None) -> bool:
        if telegram_user_id is None:
            return False
        return telegram_user_id in self.admin_ids

    async def _read_json(self, file_path: Path, default: Any) -> Any:
        async with self.file_lock:
            if not file_path.exists():
                return default
            try:
                return json.loads(file_path.read_text(encoding="utf-8"))
            except Exception as e:
                logger.error(f"Failed to read {file_path.name}: {e}")
                return default

    async def _write_json(self, file_path: Path, data: Any) -> None:
        async with self.file_lock:
            file_path.write_text(
                json.dumps(data, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

    async def _get_subscribers(self) -> set[int]:
        data = await self._read_json(self.subscribers_file, default=[])
        subscribers: set[int] = set()
        if isinstance(data, list):
            for value in data:
                try:
                    subscribers.add(int(value))
                except Exception:
                    continue
        return subscribers

    async def _save_subscribers(self, subscribers: set[int]) -> None:
        await self._write_json(self.subscribers_file, sorted(subscribers))

    async def _add_subscriber(self, chat_id: int) -> None:
        subscribers = await self._get_subscribers()
        subscribers.add(chat_id)
        await self._save_subscribers(subscribers)

    async def _remove_subscriber(self, chat_id: int) -> None:
        subscribers = await self._get_subscribers()
        if chat_id in subscribers:
            subscribers.remove(chat_id)
            await self._save_subscribers(subscribers)

    async def _save_news_post(self, text: str, author_id: int | None, author_name: str | None) -> dict[str, Any]:
        return await self._save_news_item(
            text=text,
            author_id=author_id,
            author_name=author_name,
            photo_file_id=None,
            source="manual",
        )

    async def _save_news_item(
        self,
        text: str,
        author_id: int | None,
        author_name: str | None,
        photo_file_id: str | None,
        source: str,
    ) -> dict[str, Any]:
        posts = await self._read_json(self.news_file, default=[])
        if not isinstance(posts, list):
            posts = []

        next_id = (posts[-1].get("id", 0) + 1) if posts else 1
        post = {
            "id": next_id,
            "text": text,
            "photo_file_id": photo_file_id,
            "author_id": author_id,
            "author_name": author_name,
            "source": source,
            "created_at": datetime.now(UTC).isoformat(),
        }
        posts.append(post)
        posts = posts[-100:]
        await self._write_json(self.news_file, posts)
        return post

    async def _get_scheduled_news(self) -> list[dict[str, Any]]:
        data = await self._read_json(self.scheduled_news_file, default=[])
        return data if isinstance(data, list) else []

    async def _save_scheduled_news(self, posts: list[dict[str, Any]]) -> None:
        await self._write_json(self.scheduled_news_file, posts)

    def _news_keyboard(self) -> InlineKeyboardMarkup:
        keyboard = [[
            InlineKeyboardButton(
                "📚 SAHIFALAB ni ochish",
                web_app=WebAppInfo(url=MINI_APP_URL),
            )
        ]]
        return InlineKeyboardMarkup(keyboard)

    def _format_news_text(self, post: dict[str, Any]) -> str:
        post_id = post.get("id", "?")
        text = str(post.get("text", "")).strip()
        return f"📰 SAHIFALAB Yangiliklari\n\n{text}\n\n#news_{post_id}"

    def _format_scheduled_item(self, item: dict[str, Any]) -> str:
        run_at = str(item.get("run_at", ""))
        try:
            local_dt = datetime.fromisoformat(run_at).astimezone(self.timezone)
            when = local_dt.strftime("%Y-%m-%d %H:%M")
        except Exception:
            when = run_at
        icon = "🖼️" if item.get("photo_file_id") else "📝"
        text = str(item.get("text", "")).strip()
        if len(text) > 70:
            text = text[:67] + "..."
        return f"#{item.get('id', '?')} {icon} {when}\n{text}"

    def _parse_schedule_input(self, raw: str) -> tuple[datetime | None, str | None]:
        raw = raw.strip()
        formats = [
            "%Y-%m-%d %H:%M",
            "%Y-%m-%dT%H:%M",
            "%d.%m.%Y %H:%M",
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(raw, fmt).replace(tzinfo=self.timezone)
                return dt.astimezone(UTC), None
            except ValueError:
                continue
        return None, (
            "Sana formati noto'g'ri. Masalan: 2026-03-18 21:00 yoki 18.03.2026 21:00"
        )

    def _extract_news_content(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> tuple[str, str | None]:
        text = " ".join(context.args).strip()
        reply = update.message.reply_to_message if update.message else None
        photo_file_id = None
        if reply and reply.photo:
            photo_file_id = reply.photo[-1].file_id
            if not text:
                text = (reply.caption or "").strip()
        return text, photo_file_id

    async def _send_news_to_chat(self, bot: Bot, chat_id: int, post: dict[str, Any]) -> None:
        text = self._format_news_text(post)
        reply_markup = self._news_keyboard()
        if post.get("photo_file_id"):
            await bot.send_photo(
                chat_id=chat_id,
                photo=post["photo_file_id"],
                caption=text,
                reply_markup=reply_markup,
            )
        else:
            await bot.send_message(
                chat_id=chat_id,
                text=text,
                reply_markup=reply_markup,
            )

    async def _recent_news(self, limit: int = 5) -> list[dict[str, Any]]:
        posts = await self._read_json(self.news_file, default=[])
        if not isinstance(posts, list):
            return []
        return list(reversed(posts[-limit:]))

    async def _broadcast_news(
        self,
        bot: Bot,
        post: dict[str, Any],
    ) -> tuple[int, int]:
        subscribers = await self._get_subscribers()
        if not subscribers:
            return 0, 0

        sent = 0
        failed = 0
        for chat_id in list(subscribers):
            try:
                await self._send_news_to_chat(bot, chat_id, post)
                sent += 1
            except Forbidden:
                failed += 1
                subscribers.discard(chat_id)
            except Exception as e:
                logger.warning(f"Failed to send news to {chat_id}: {e}")
                failed += 1

        await self._save_subscribers(subscribers)
        return sent, failed

    async def _dispatch_due_scheduled_news(self, bot: Bot) -> None:
        scheduled = await self._get_scheduled_news()
        if not scheduled:
            return

        now = datetime.now(UTC)
        pending: list[dict[str, Any]] = []
        due: list[dict[str, Any]] = []
        for item in scheduled:
            try:
                run_at = datetime.fromisoformat(str(item.get("run_at")))
            except Exception:
                logger.warning(f"Skipping invalid scheduled item: {item}")
                continue
            if run_at <= now:
                due.append(item)
            else:
                pending.append(item)

        if len(pending) != len(scheduled):
            await self._save_scheduled_news(pending)

        for item in due:
            post = await self._save_news_item(
                text=str(item.get("text", "")).strip(),
                author_id=item.get("author_id"),
                author_name=item.get("author_name"),
                photo_file_id=item.get("photo_file_id"),
                source="scheduled",
            )
            await self._broadcast_news(bot, post)

    async def _schedule_loop(self, application: Application) -> None:
        while True:
            try:
                await self._dispatch_due_scheduled_news(application.bot)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Scheduled news loop failed: {e}")
            await asyncio.sleep(20)

    async def post_init(self, application: Application) -> None:
        if not self.scheduler_task or self.scheduler_task.done():
            self.scheduler_task = asyncio.create_task(self._schedule_loop(application))

    async def post_shutdown(self, application: Application) -> None:
        if self.scheduler_task and not self.scheduler_task.done():
            self.scheduler_task.cancel()
            try:
                await self.scheduler_task
            except asyncio.CancelledError:
                pass

    # ── /start — regular or deep-link pay_{order_id} ──────────────────────
    async def start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        user = update.effective_user
        chat_id = update.effective_chat.id
        args = context.args  # e.g. ["pay_stars_3_807466591_abc12345"]

        # Deep link: /start pay_{order_id}
        if args and args[0].startswith("pay_"):
            order_id = args[0][4:]  # strip "pay_" prefix
            await self._send_invoice(update, context, order_id)
            return

        await self._add_subscriber(chat_id)

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
            "Kitoblar, testlar va foydali resurslar shu yerda! 📖\n"
            "Siz yangiliklar kanaliga obuna qilindingiz. 📰\n\n"
            "👇 Tugmani bosing va ilovani oching:",
            parse_mode="Markdown",
            reply_markup=reply_markup,
        )

    # ── /subscribe ─────────────────────────────────────────────────────────
    async def subscribe_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await self._add_subscriber(update.effective_chat.id)
        await update.message.reply_text(
            "✅ Siz SAHIFALAB yangiliklariga obuna bo'ldingiz."
        )

    # ── /unsubscribe ───────────────────────────────────────────────────────
    async def unsubscribe_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await self._remove_subscriber(update.effective_chat.id)
        await update.message.reply_text(
            "🔕 Siz yangiliklardan chiqdingiz. Qayta ulanish uchun /subscribe buyrug'ini yuboring."
        )

    # ── /latest ────────────────────────────────────────────────────────────
    async def latest_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        posts = await self._recent_news(limit=5)
        if not posts:
            await update.message.reply_text("Hali yangiliklar joylanmagan.")
            return

        lines = ["📰 So'nggi yangiliklar:\n"]
        for post in posts:
            text = str(post.get("text", "")).strip()
            post_id = post.get("id", "?")
            created = str(post.get("created_at", ""))[:10]
            icon = "🖼️" if post.get("photo_file_id") else "📝"
            if len(text) > 120:
                text = text[:117] + "..."
            lines.append(f"#{post_id} {icon} ({created})\n{text}\n")

        await update.message.reply_text("\n".join(lines))

    # ── /news (admin only) ────────────────────────────────────────────────
    async def news_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        user_id = update.effective_user.id if update.effective_user else None
        if not self._is_admin(user_id):
            await update.message.reply_text("⛔ Bu buyruq faqat adminlar uchun.")
            return

        text = " ".join(context.args).strip()
        text, photo_file_id = self._extract_news_content(update, context)
        if not text:
            await update.message.reply_text(
                "Foydalanish:\n/news Bugun soat 21:00 da jonli dars bo'ladi\nYoki rasmga reply qilib /news <caption> yuboring."
            )
            return

        post = await self._save_news_item(
            text=text,
            author_id=user_id,
            author_name=update.effective_user.first_name if update.effective_user else "Admin",
            photo_file_id=photo_file_id,
            source="manual",
        )
        sent, failed = await self._broadcast_news(context.bot, post)
        await update.message.reply_text(
            f"✅ Yangilik yuborildi.\nQabul qilganlar: {sent}\nXatolik: {failed}"
        )

    # ── /schedule_news (admin only) ───────────────────────────────────────
    async def schedule_news_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        user_id = update.effective_user.id if update.effective_user else None
        if not self._is_admin(user_id):
            await update.message.reply_text("⛔ Bu buyruq faqat adminlar uchun.")
            return

        raw = " ".join(context.args).strip()
        if not raw:
            await update.message.reply_text(
                "Foydalanish:\n/schedule_news 2026-03-18 21:00 Ertaga yangi kitob chiqadi\nYoki rasmga reply qilib shu formatda yuboring."
            )
            return

        dt_utc = None
        text = ""
        for separator in (" ", "T"):
            if separator == "T" and "T" not in raw:
                continue
            if separator == " ":
                parts = raw.split(" ", 2)
                if len(parts) >= 3:
                    candidate_dt = f"{parts[0]} {parts[1]}"
                    dt_utc, error = self._parse_schedule_input(candidate_dt)
                    if dt_utc:
                        text = parts[2].strip()
                        break
            else:
                parts = raw.split(" ", 1)
                if len(parts) >= 2:
                    dt_utc, error = self._parse_schedule_input(parts[0])
                    if dt_utc:
                        text = parts[1].strip()
                        break

        if not dt_utc:
            _, error = self._parse_schedule_input(raw)
            await update.message.reply_text(error)
            return

        _, photo_file_id = self._extract_news_content(update, context)
        reply = update.message.reply_to_message if update.message else None
        if not text and reply:
            text = (reply.caption or "").strip()

        if not text:
            await update.message.reply_text("Yangilik matnini ham kiriting.")
            return

        if dt_utc <= datetime.now(UTC):
            await update.message.reply_text("Kelajakdagi vaqtni tanlang.")
            return

        scheduled = await self._get_scheduled_news()
        next_id = (scheduled[-1].get("id", 0) + 1) if scheduled else 1
        item = {
            "id": next_id,
            "text": text,
            "photo_file_id": photo_file_id,
            "author_id": user_id,
            "author_name": update.effective_user.first_name if update.effective_user else "Admin",
            "run_at": dt_utc.isoformat(),
            "created_at": datetime.now(UTC).isoformat(),
        }
        scheduled.append(item)
        scheduled.sort(key=lambda post: str(post.get("run_at", "")))
        await self._save_scheduled_news(scheduled)

        local_dt = dt_utc.astimezone(self.timezone)
        await update.message.reply_text(
            f"⏰ Yangilik rejalashtirildi: #{next_id}\n"
            f"Vaqt: {local_dt.strftime('%Y-%m-%d %H:%M')} ({self.timezone.key})"
        )

    # ── /scheduled (admin only) ──────────────────────────────────────────
    async def scheduled_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        user_id = update.effective_user.id if update.effective_user else None
        if not self._is_admin(user_id):
            await update.message.reply_text("⛔ Bu buyruq faqat adminlar uchun.")
            return

        scheduled = await self._get_scheduled_news()
        if not scheduled:
            await update.message.reply_text("Rejalashtirilgan yangiliklar yo'q.")
            return

        lines = ["⏰ Rejalashtirilgan yangiliklar:\n"]
        for item in scheduled[:10]:
            lines.append(self._format_scheduled_item(item))
        await update.message.reply_text("\n\n".join(lines))

    # ── /cancel_news (admin only) ────────────────────────────────────────
    async def cancel_news_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        user_id = update.effective_user.id if update.effective_user else None
        if not self._is_admin(user_id):
            await update.message.reply_text("⛔ Bu buyruq faqat adminlar uchun.")
            return

        if not context.args:
            await update.message.reply_text("Foydalanish:\n/cancel_news 3")
            return

        try:
            cancel_id = int(context.args[0])
        except ValueError:
            await update.message.reply_text("ID raqam bo'lishi kerak.")
            return

        scheduled = await self._get_scheduled_news()
        new_items = [item for item in scheduled if int(item.get("id", -1)) != cancel_id]
        if len(new_items) == len(scheduled):
            await update.message.reply_text("Bunday rejalashtirilgan yangilik topilmadi.")
            return

        await self._save_scheduled_news(new_items)
        await update.message.reply_text(f"🗑️ Rejalashtirilgan yangilik bekor qilindi: #{cancel_id}")

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
        admin_line = (
            "\n/news <matn> — Yangilik yuborish (admin)"
            "\n/schedule_news <sana> <matn> — Yangilikni vaqtga qo'yish (admin)"
            "\n/scheduled — Rejalashtirilganlar ro'yxati (admin)"
            "\n/cancel_news <id> — Rejalashtirilgan yangilikni bekor qilish (admin)"
        ) if self._is_admin(update.effective_user.id if update.effective_user else None) else ""
        await update.message.reply_text(
            "📋 *Buyruqlar ro'yxati:*\n\n"
            "/start — Boshlash\n"
            "/app — Ilovani ochish\n"
            "/subscribe — Yangiliklarga obuna\n"
            "/unsubscribe — Yangiliklardan chiqish\n"
            "/latest — So'nggi yangiliklar\n"
            "/help — Yordam\n\n"
            f"{admin_line}\n"
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
        self.app = Application.builder().token(BOT_TOKEN).post_init(self.post_init).post_shutdown(self.post_shutdown).build()
        self.app.add_handler(CommandHandler("start", self.start))
        self.app.add_handler(CommandHandler("help", self.help_command))
        self.app.add_handler(CommandHandler("app", self.app_command))
        self.app.add_handler(CommandHandler("subscribe", self.subscribe_command))
        self.app.add_handler(CommandHandler("unsubscribe", self.unsubscribe_command))
        self.app.add_handler(CommandHandler("latest", self.latest_command))
        self.app.add_handler(CommandHandler("news", self.news_command))
        self.app.add_handler(CommandHandler("schedule_news", self.schedule_news_command))
        self.app.add_handler(CommandHandler("scheduled", self.scheduled_command))
        self.app.add_handler(CommandHandler("cancel_news", self.cancel_news_command))
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
