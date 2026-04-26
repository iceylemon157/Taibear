import re
import random
from telegram import Update
from telegram.error import BadRequest
from telegram.ext import ContextTypes

from db.engine import get_session
from db.crud import get_domains, get_locations_by_domain, get_places
from db.rate_limit import check_and_increment_other
from .keyboards import main_menu, domain_keyboard, location_keyboard, vibe_keyboard

# Reusable edit helper
async def _edit(update: Update, text: str, keyboard=None):
    try:
        await update.callback_query.edit_message_text(
            text, reply_markup=keyboard, parse_mode="MarkdownV2"
        )
    except BadRequest as e:
        if "is not modified" not in str(e):
            raise


def _strip_hashtags(text: str) -> str:
    return re.sub(r"\s*#\S+", "", text).strip()


def _esc(text: str) -> str:
    """Escape special chars for MarkdownV2."""
    return re.sub(r"([_\[\]()~`>#+\-=|{}.!\\])", r"\\\1", text or "")


def _domain_icon(domain: str) -> str:
    return {"美食": "🍽️", "景點": "📍"}.get(domain, "📌")


def _format_places(places: list[dict]) -> str:
    if not places:
        return "_這個分類還沒有收藏。_"
    lines = []
    for i, p in enumerate(places, 1):
        name = _esc(p.get("store_name") or "未知地點")
        vibe_str = _esc(" · ".join(p.get("vibe") or []))
        loc = _esc(p.get("location", ""))
        icon = _domain_icon(p.get("domain", ""))
        addr = _esc(p.get("address") or "")
        header = f"{i}\\. {icon} *{name}*"
        meta = f"　`{loc}`" + (f"  _{vibe_str}_" if vibe_str else "")
        addr_line = f"\n　📮 `{addr}`" if addr else ""
        lines.append(f"{header}\n{meta}{addr_line}\n　[▶ 前往影片]({p['url']})")
    return "\n\n".join(lines)


async def handle_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    data = query.data
    user_id = query.from_user.id
    Session = get_session()

    with Session() as db:
        allowed, reason = check_and_increment_other(db, user_id)
    if not allowed:
        await query.answer(reason, show_alert=True)
        return

    # ── 主選單 ──────────────────────────────────────────
    if data == "m":
        await _edit(update, "請選擇功能：", main_menu())

    # ── 收藏清單：選分類 ────────────────────────────────
    elif data == "ls":
        await _edit(update, "選擇分類：", domain_keyboard("ls"))

    # ── 收藏清單：選地點 ────────────────────────────────
    elif data.startswith("ls:") and data.count(":") == 1:
        domain = data.split(":")[1]
        with Session() as db:
            locs = get_locations_by_domain(db, user_id, domain)
        if not locs:
            await _edit(update, f"{_esc(domain)} 還沒有收藏。", main_menu())
        else:
            await _edit(update, f"*{_esc(domain)}* — 選擇地點：",
                        location_keyboard(f"ls:{domain}", locs))

    # ── 收藏清單：顯示結果 ──────────────────────────────
    elif data.startswith("ls:") and data.count(":") == 2:
        _, domain, location = data.split(":")
        with Session() as db:
            places = get_places(db, user_id, domain, location)
        text = f"*{_esc(domain)} · {_esc(location)}*\n\n{_format_places(places)}"
        await _edit(update, text, location_keyboard(f"ls:{domain}",
            [location]))  # back button context kept minimal

    # ── 附近搜尋：選城市 ────────────────────────────────
    elif data == "nr":
        with Session() as db:
            # 列出使用者有收藏的所有城市
            all_locs: set[str] = set()
            for domain in get_domains(db, user_id):
                all_locs.update(get_locations_by_domain(db, user_id, domain))
        if not all_locs:
            await _edit(update, "還沒有收藏任何地點。", main_menu())
        else:
            await _edit(update, "選擇城市：",
                        location_keyboard("nr", sorted(all_locs)))

    # ── 附近搜尋：顯示該城市所有收藏 ───────────────────
    elif data.startswith("nr:"):
        location = data.split(":", 1)[1]
        with Session() as db:
            domains = get_domains(db, user_id)
            all_places = []
            for domain in domains:
                all_places += get_places(db, user_id, domain, location)
        text = f"*📍 {_esc(location)} 的收藏*\n\n{_format_places(all_places)}"
        await _edit(update, text, main_menu())

    # ── 標籤搜尋：選 Vibe ───────────────────────────────
    elif data == "tg":
        await _edit(update, "選擇心情標籤：", vibe_keyboard())

    # ── 標籤搜尋：顯示符合 Vibe 的結果 ─────────────────
    elif data.startswith("tg:"):
        vibe = data.split(":", 1)[1]
        with Session() as db:
            from sqlalchemy import text as sql_text
            from db.models import Place, Item, ItemPlace
            rows = (
                db.query(Place, Item.url)
                .join(ItemPlace, ItemPlace.place_id == Place.id)
                .join(Item, Item.id == ItemPlace.item_id)
                .filter(Item.user_id == user_id, Place.vibe.any(vibe))
                .all()
            )
        if not rows:
            await _edit(update, f"沒有標記「{_esc(vibe)}」的收藏。", main_menu())
        else:
            places = [{"store_name": p.store_name, "url": url,
                       "vibe": p.vibe, "location": p.location, "domain": p.domain} for p, url in rows]
            text = f"*🏷️ {_esc(vibe)}*\n\n{_format_places(places)}"
            await _edit(update, text, main_menu())

    # ── 隨機推薦 ────────────────────────────────────────
    elif data == "rand":
        with Session() as db:
            from db.models import Place, Item, ItemPlace
            rows = (
                db.query(Place, Item.url)
                .join(ItemPlace, ItemPlace.place_id == Place.id)
                .join(Item, Item.id == ItemPlace.item_id)
                .filter(Item.user_id == user_id, Place.store_name.isnot(None))
                .all()
            )
        if not rows:
            await _edit(update, "還沒有收藏，先貼幾個連結吧！", main_menu())
        else:
            place, url = random.choice(rows)
            icon = _domain_icon(place.domain)
            name = _esc(place.store_name or "")
            loc = _esc(place.location or "")
            cat = _esc(place.category or "")
            addr = _esc(place.address or "")
            addr_line = f"\n📮 `{addr}`" if addr else ""
            text = (f"*{icon} 今天去這裡！*\n\n"
                    f"*{name}*\n"
                    f"`{loc}` · {cat}{addr_line}\n\n"
                    f"[▶ 前往影片]({url})")
            await _edit(update, text, main_menu())

    # ── 最近收藏 ────────────────────────────────────────
    elif data == "recent":
        with Session() as db:
            from db.models import Item, ItemPlace, Place
            items = (
                db.query(Item)
                .filter(Item.user_id == user_id)
                .order_by(Item.created_at.desc())
                .limit(5)
                .all()
            )
        if not items:
            await _edit(update, "還沒有收藏。", main_menu())
        else:
            lines = []
            for idx, i in enumerate(items, 1):
                title = _esc(_strip_hashtags(i.title or "") or i.url[:30])
                lines.append(f"{idx}\\. [{title}]({i.url})")
            await _edit(update, "*🕐 最近收藏*\n\n" + "\n\n".join(lines), main_menu())
