import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

from telegram import Update, BotCommand
from telegram.ext import ApplicationBuilder, MessageHandler, CommandHandler, CallbackQueryHandler, filters

from db.engine import init_db, get_session
from db.crud import get_or_create_user
from tg_bot.bot.handlers import handle_message
from tg_bot.bot.callbacks import handle_callback
from tg_bot.bot.keyboards import main_menu

WELCOME_TEXT = (
    "👋 歡迎使用 *靈感罐頭* \\(@reelsmap\\_bot\\)\\!\n\n"
    "把 Instagram Reels 或 YouTube Shorts 連結貼給我，\n"
    "我會自動幫你分析地點、分類、氛圍，收藏起來備用。\n\n"
    "*怎麼使用：*\n"
    "1️⃣ 直接貼連結 → 自動解析收藏\n"
    "2️⃣ 用選單查找你的收藏\n\n"
    "選擇功能開始："
)

MENU_COMMANDS = [
    BotCommand("start", "使用說明與主選單"),
    BotCommand("menu", "開啟主選單"),
]


def load_token():
    botenv = Path(__file__).parent.parent / ".botenv"
    if botenv.exists():
        return botenv.read_text().strip()
    return os.environ["TELEGRAM_BOT_TOKEN"]


async def cmd_start(update: Update, context):
    tg_user = update.message.from_user
    Session = get_session()
    with Session() as db:
        user = get_or_create_user(db, tg_user.id, tg_user.username or "")
        is_new = user.items == []

    if is_new:
        await update.message.reply_text(WELCOME_TEXT, reply_markup=main_menu(),
                                        parse_mode="MarkdownV2")
    else:
        await update.message.reply_text("請選擇功能：", reply_markup=main_menu())


async def cmd_menu(update: Update, context):
    await update.message.reply_text("請選擇功能：", reply_markup=main_menu())


async def post_init(app):
    await app.bot.set_my_commands(MENU_COMMANDS)


def main():
    init_db()
    token = load_token()
    app = ApplicationBuilder().token(token).post_init(post_init).build()

    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("menu", cmd_menu))
    app.add_handler(CallbackQueryHandler(handle_callback))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    print("Bot started (long-polling)...")
    app.run_polling()


if __name__ == "__main__":
    main()
