import asyncio
import logging
from bot.bot import bot_handler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def main():
    """Main entry point for bot"""
    logger.info("Starting SAHIFALAB Telegram Bot...")
    
    app = bot_handler.setup()
    logger.info("Bot handlers setup complete")
    
    await bot_handler.start_polling()

if __name__ == "__main__":
    asyncio.run(main())
