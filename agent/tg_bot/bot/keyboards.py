from telegram import InlineKeyboardButton, InlineKeyboardMarkup


def main_menu() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("📋 收藏清單", callback_data="ls")],
        [
            InlineKeyboardButton("📍 附近搜尋", callback_data="nr"),
            InlineKeyboardButton("🏷️ 標籤搜尋", callback_data="tg"),
        ],
        [
            InlineKeyboardButton("🎲 隨機推薦", callback_data="rand"),
            InlineKeyboardButton("🕐 最近收藏", callback_data="recent"),
        ],
    ])


def domain_keyboard(prefix: str) -> InlineKeyboardMarkup:
    domains = ["美食", "景點", "其他"]
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(d, callback_data=f"{prefix}:{d}") for d in domains],
        [InlineKeyboardButton("⬅️ 返回", callback_data="m")],
    ])


def location_keyboard(prefix: str, locations: list[str]) -> InlineKeyboardMarkup:
    rows = [[InlineKeyboardButton(loc, callback_data=f"{prefix}:{loc}")] for loc in locations]
    rows.append([InlineKeyboardButton("⬅️ 返回", callback_data="m")])
    return InlineKeyboardMarkup(rows)


def vibe_keyboard() -> InlineKeyboardMarkup:
    vibes = ["攝影出片", "適合工作/讀書", "散步放鬆", "朋友聚會", "逛街購物", "戶外活動"]
    rows = [[InlineKeyboardButton(v, callback_data=f"tg:{v}")] for v in vibes]
    rows.append([InlineKeyboardButton("⬅️ 返回", callback_data="m")])
    return InlineKeyboardMarkup(rows)
