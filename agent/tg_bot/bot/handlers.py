import re
from dotenv import load_dotenv
load_dotenv()

from tg_bot.scraper.fetch import fetch_metadata
from tg_bot.llm.extractor import extract_locations, generate_description
from db.engine import get_session
from db.crud import get_or_create_user, get_item_by_url, create_item_with_places
from db.rate_limit import check_and_increment_llm

YT_PATTERN = re.compile(
    r"https?://(www\.)?(youtube\.com/(shorts|watch)|youtu\.be)/\S+"
)
IG_PATTERN = re.compile(
    r"https?://(www\.)?instagram\.com/(reel|p|tv)/\S+"
)

DOMAIN_ICON = {"美食": "🍽️", "景點": "📍"}
CATEGORY_EMOJI = {
    "拉麵": "🍜", "咖哩": "🍛", "火鍋": "🫕", "燒肉/烤肉": "🥩",
    "牛肉麵": "🍝", "滷肉飯": "🍚", "熱炒": "🥘", "海鮮": "🦞",
    "壽司/日料": "🍣", "韓式料理": "🥢", "義式料理": "🍝",
    "早午餐": "🍳", "咖啡廳/甜點": "☕", "酒吧/居酒屋": "🍺", "小吃": "🧆",
    "自然景觀": "🌲", "歷史人文": "🏯", "藝文空間": "🎨",
    "商業娛樂": "🎡", "建築特色": "🏛️",
}


def _friendly_error(e: Exception) -> str:
    msg = str(e)
    if "429" in msg or "quota" in msg.lower() or "rate" in msg.lower():
        return "AI 分析額度暫時用完了，請等一下再試 🙏"
    if "login required" in msg.lower() or "rate-limit" in msg.lower():
        return "這部影片需要登入才能讀取，目前無法分析 😅"
    if "Sign in to confirm" in msg:
        return "YouTube 暫時擋住我了，請稍後再試 😓"
    if "not available" in msg.lower() or "404" in msg:
        return "找不到這部影片，可能已被刪除或設為私人 🔒"
    return "哎呀，遇到一點問題，請稍後再試 🙏"


def detect_url(text: str) -> tuple[str, str] | None:
    for word in text.split():
        if YT_PATTERN.search(word):
            return ("youtube", word)
        if IG_PATTERN.search(word):
            return ("instagram", word)
    return None


def _format_saved(locations: list[dict]) -> str:
    lines = []
    for loc in locations:
        domain = loc.get("domain", "")
        category = loc.get("category", "")
        location = loc.get("location", "")
        store = loc.get("store_name", "")
        cat_emoji = CATEGORY_EMOJI.get(category, "")

        if domain == "美食":
            lines.append(f"🍽️ 已成功收藏！這是一間在 {location} 的 {category} {cat_emoji}\n   📌 {store}")
        elif domain == "景點":
            lines.append(f"📍 已成功收藏！這是 {location} 的 {category} {cat_emoji}\n   📌 {store}")

    return "\n\n".join(lines)


async def handle_message(update, context):
    text = update.message.text or ""
    tg_user = update.message.from_user

    result = detect_url(text)
    if result is None:
        await update.message.reply_text(
            "嗨！我只看得懂 Instagram Reels 或 YouTube Shorts 的連結喔 🔗\n"
            "把連結貼給我，我幫你收藏起來！"
        )
        return

    platform, url = result
    Session = get_session()

    with Session() as db:
        get_or_create_user(db, tg_user.id, tg_user.username or "")

        existing = get_item_by_url(db, url)
        if existing:
            await update.message.reply_text("這個連結我之前就幫你收藏過了！😉")
            return

        allowed, reason = check_and_increment_llm(db, tg_user.id)
        if not allowed:
            await update.message.reply_text(reason)
            return

        await update.message.reply_text("收到！幫你分析中，稍等一下 🔍")

        try:
            meta = fetch_metadata(url)
            locations = extract_locations(meta)

            for loc in locations:
                if loc.get("domain") != "其他":
                    loc["description"] = generate_description(
                        store_name=loc.get("store_name", ""),
                        domain=loc.get("domain", ""),
                        category=loc.get("category", ""),
                        vibe=loc.get("vibe") or [],
                        title=meta.get("title", ""),
                        description_text=meta.get("description", "") or "",
                    )

            create_item_with_places(
                db,
                user_id=tg_user.id,
                platform=platform,
                url=url,
                title=meta.get("title", ""),
                raw_metadata=meta,
                locations=locations,
            )
        except Exception as e:
            msg = _friendly_error(e)
            await update.message.reply_text(msg)
            return

    real_locations = [loc for loc in locations if loc.get("domain") != "其他"]

    if not locations:
        await update.message.reply_text(
            "影片收下來了，不過我看不太出來是哪裡的景點或美食 🤔\n"
            "已幫你記錄連結！"
        )
        return

    if not real_locations:
        await update.message.reply_text(
            "這部影片好像不是美食或景點耶，我就先不存囉！🙅‍♂️"
        )
        return

    await update.message.reply_text(_format_saved(real_locations))
