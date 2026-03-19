import asyncio
import logging
import sys
import os

# Ensure the parent directory is on sys.path so "from bot.bot import ..." works
# whether this file is run from inside the bot/ folder or from the project root.
_here = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)
# Also make the bot's own dir available for relative imports
if _here not in sys.path:
    sys.path.insert(0, _here)

try:
    from bot.bot import bot_handler  # running from project root
except ModuleNotFoundError:
    from bot import bot_handler      # running from inside bot/ folder

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

if __name__ == "__main__":
    logger.info("Starting SAHIFALAB Telegram Bot...")
    # run_polling() manages its own event loop — do NOT wrap in asyncio.run()
    app = bot_handler.setup()
    logger.info("Bot is running! Press Ctrl+C to stop.")
    app.run_polling(drop_pending_updates=True)
