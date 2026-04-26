# TG Bot × Agent API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 `reels-tg-bot` merge 進 YTP_Planning_Agent monorepo，共用 PostgreSQL、依賴管理、Docker Compose；新增景點摘要生成（gemma-4-31b-it）；Agent API `/search` 從 DB 自動組成 UserPreference。

**Architecture:** 兩個服務（tg-bot / agent-api）都在同一個 repo 裡，共用 `db/` package（SQLAlchemy models + engine + crud）和 `pyproject.toml`。每個服務有自己的 Dockerfile（`Dockerfile.agent` / `Dockerfile.tgbot`），docker-compose 都 build from `.`。TG Bot 程式碼移至 `tg_bot/`，`db/` 保持 root-level shared package。

**Tech Stack:** Python 3.11, FastAPI, python-telegram-bot 21.6, SQLAlchemy 2.x, psycopg2-binary, PostgreSQL 16, google-generativeai, yt-dlp, Docker, docker-compose v2, uv

---

## Target File Structure

```
YTP_Planning_Agent/
├── main.py                      (Agent API — unchanged)
├── config.py                    (unchanged)
├── schemas.py                   (unchanged)
├── agent/                       (Agent API pipeline — unchanged)
│   ├── models.py
│   ├── planner.py
│   ├── tools.py
│   ├── enricher.py
│   ├── preprocessor.py
│   ├── search_pipeline.py
│   └── gemini_client.py
├── db/                          ← SHARED (moved from reels-tg-bot/db/)
│   ├── __init__.py
│   ├── engine.py
│   ├── models.py                (+ new: description column)
│   ├── crud.py                  (+ new: description field)
│   ├── rate_limit.py
│   └── user_loader.py           ← NEW: builds UserPreference from DB
├── tg_bot/                      ← moved from reels-tg-bot/
│   ├── __init__.py
│   ├── bot/
│   │   ├── __init__.py
│   │   ├── main.py              (entry: python -m tg_bot.bot.main)
│   │   ├── handlers.py          (updated imports + description injection)
│   │   ├── keyboards.py
│   │   └── callbacks.py
│   ├── llm/
│   │   ├── __init__.py
│   │   └── extractor.py         (single key + generate_description)
│   └── scraper/
│       ├── __init__.py
│       └── fetch.py
├── scripts/
│   └── seed_demo_users.py       ← NEW
├── tests/
│   ├── __init__.py
│   ├── test_extractor.py        ← NEW
│   └── test_user_loader.py      ← NEW
├── Dockerfile.agent             ← NEW
├── Dockerfile.tgbot             ← NEW
├── docker-compose.yml           ← NEW
├── pyproject.toml               (merged deps)
└── .env.example                 (updated)
```

### Import changes after merge

| 檔案 | 原 import | 新 import |
|------|-----------|-----------|
| `tg_bot/bot/handlers.py` | `from scraper.fetch import ...` | `from tg_bot.scraper.fetch import ...` |
| `tg_bot/bot/handlers.py` | `from llm.extractor import ...` | `from tg_bot.llm.extractor import ...` |
| `tg_bot/bot/handlers.py` | `from db.xxx import ...` | 不變（db/ 在 root） |
| `tg_bot/bot/callbacks.py` | `from db.xxx import ...` | 不變 |
| `tg_bot/bot/callbacks.py` | `from .keyboards import ...` | 不變（relative import） |
| `tg_bot/bot/main.py` | `from bot.handlers import ...` | `from tg_bot.bot.handlers import ...` |
| `tg_bot/bot/main.py` | `from bot.callbacks import ...` | `from tg_bot.bot.callbacks import ...` |
| `tg_bot/bot/main.py` | `from bot.keyboards import ...` | `from tg_bot.bot.keyboards import ...` |
| `tg_bot/bot/main.py` | `from db.engine import ...` | 不變 |
| `main.py` (agent API) | — | `from db.user_loader import load_preference_from_db` (新增) |

---

## Task 1: 建立目錄結構並移入 tg_bot 程式碼

**Files:**
- Create dirs: `tg_bot/`, `tg_bot/bot/`, `tg_bot/llm/`, `tg_bot/scraper/`
- Copy from `/Users/littlepants/Dev/reels-tg-bot/`

- [ ] **Step 1: 建立 tg_bot 目錄並複製程式碼**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent

# 建立目錄結構
mkdir -p tg_bot/bot tg_bot/llm tg_bot/scraper

# 複製程式碼
cp /Users/littlepants/Dev/reels-tg-bot/bot/*.py tg_bot/bot/
cp /Users/littlepants/Dev/reels-tg-bot/llm/*.py tg_bot/llm/
cp /Users/littlepants/Dev/reels-tg-bot/scraper/*.py tg_bot/scraper/

# 複製共用 db/ 到 root
cp /Users/littlepants/Dev/reels-tg-bot/db/*.py db/ 2>/dev/null || \
  cp -r /Users/littlepants/Dev/reels-tg-bot/db db/

# 建立 __init__.py
touch tg_bot/__init__.py tg_bot/bot/__init__.py tg_bot/llm/__init__.py tg_bot/scraper/__init__.py
touch db/__init__.py
```

- [ ] **Step 2: 確認檔案都在正確位置**

```bash
ls tg_bot/bot/ tg_bot/llm/ tg_bot/scraper/ db/
```

預期輸出：
```
tg_bot/bot/:
__init__.py  callbacks.py  handlers.py  keyboards.py  main.py

tg_bot/llm/:
__init__.py  extractor.py

tg_bot/scraper/:
__init__.py  fetch.py

db/:
__init__.py  crud.py  engine.py  models.py  rate_limit.py
```

- [ ] **Step 3: Commit**

```bash
git add tg_bot/ db/
git commit -m "chore: add tg_bot/ and shared db/ to monorepo"
```

---

## Task 2: 更新 tg_bot 內部 import

**Files:**
- Modify: `tg_bot/bot/main.py`
- Modify: `tg_bot/bot/handlers.py`

- [ ] **Step 1: 更新 tg_bot/bot/handlers.py 的 import**

找到並替換 handlers.py 頂部的 import：

```python
import re
from pathlib import Path
from dotenv import load_dotenv

from tg_bot.scraper.fetch import fetch_metadata        # ← 原: from scraper.fetch
from tg_bot.llm.extractor import extract_locations     # ← 原: from llm.extractor
from db.engine import get_session
from db.crud import get_or_create_user, get_item_by_url, create_item_with_places
from db.rate_limit import check_and_increment_llm
```

- [ ] **Step 2: 更新 tg_bot/bot/main.py 的 import 和 load_dotenv**

找到並替換：

```python
import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()   # ← 原: load_dotenv(Path(__file__).parent.parent / ".env")，改為自動尋找

from telegram import Update, BotCommand
from telegram.ext import ApplicationBuilder, MessageHandler, CommandHandler, CallbackQueryHandler, filters

from db.engine import init_db, get_session
from db.crud import get_or_create_user
from tg_bot.bot.handlers import handle_message        # ← 原: from bot.handlers
from tg_bot.bot.callbacks import handle_callback      # ← 原: from bot.callbacks
from tg_bot.bot.keyboards import main_menu            # ← 原: from bot.keyboards
```

- [ ] **Step 3: 確認 tg_bot package 可正常 import（不需 DB）**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent
uv run python -c "from tg_bot.bot.keyboards import main_menu; print('ok')"
```

預期：`ok`

- [ ] **Step 4: Commit**

```bash
git add tg_bot/bot/main.py tg_bot/bot/handlers.py
git commit -m "chore: update tg_bot imports for monorepo structure"
```

---

## Task 3: 合併依賴到 pyproject.toml

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: 加入 TG Bot 所需的依賴**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent
uv add "python-telegram-bot==21.6" "sqlalchemy==2.0.36" "psycopg2-binary==2.9.10" \
       "google-generativeai==0.8.5" "yt-dlp==2025.3.31"
```

（`httpx` 和 `python-dotenv` 已在 pyproject.toml，跳過）

- [ ] **Step 2: 確認全部依賴可 import**

```bash
uv run python -c "
import telegram, sqlalchemy, psycopg2, google.generativeai, yt_dlp
print('all deps ok')
"
```

預期：`all deps ok`

- [ ] **Step 3: Commit**

```bash
git add pyproject.toml uv.lock
git commit -m "chore: merge tg-bot dependencies into pyproject.toml"
```

---

## Task 4: Place.description — 共用 db/models.py

**Files:**
- Modify: `db/models.py`

- [ ] **Step 1: 在 Place 加 `description` 欄位**

開啟 `db/models.py`，在 `address` 行後加：

```python
address = Column(String(500))
description = Column(Text)          # LLM 生成的景點重點摘要，可為 null
created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
```

- [ ] **Step 2: 驗證 model 可 import**

```bash
uv run python -c "from db.models import Place; print(Place.__table__.columns.keys())"
```

預期輸出包含 `description`。

- [ ] **Step 3: Commit**

```bash
git add db/models.py
git commit -m "feat: add description column to Place model"
```

---

## Task 5: db/crud.py — 寫入 description

**Files:**
- Modify: `db/crud.py`

- [ ] **Step 1: 更新 `create_item_with_places` 中的 Place 建立**

找到 `place = Place(` 區塊，加入 `description`：

```python
place = Place(
    store_name=loc.get("store_name"),
    domain=loc.get("domain"),
    location=loc.get("location"),
    category=loc.get("category"),
    vibe=loc.get("vibe") or [],
    address=loc.get("address"),
    description=loc.get("description"),     # ← 新增
)
```

- [ ] **Step 2: 驗證 import 正常**

```bash
uv run python -c "from db.crud import create_item_with_places; print('ok')"
```

預期：`ok`

- [ ] **Step 3: Commit**

```bash
git add db/crud.py
git commit -m "feat: write description field when creating Place"
```

---

## Task 6: tg_bot/llm/extractor.py — 單一 key + generate_description()

**Files:**
- Modify: `tg_bot/llm/extractor.py`
- Create: `tests/__init__.py`
- Create: `tests/test_extractor.py`

- [ ] **Step 1: 寫失敗測試**

建立 `tests/__init__.py`（空檔）和 `tests/test_extractor.py`：

```python
from unittest.mock import patch, MagicMock
from tg_bot.llm.extractor import generate_description


def test_generate_description_returns_string():
    mock_response = MagicMock()
    mock_response.text = "充滿工業風格的咖啡廳，適合拍照打卡。甜點精緻，下午茶首選。"

    with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}), \
         patch("tg_bot.llm.extractor.genai") as mock_genai:
        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model
        mock_genai.configure = MagicMock()

        result = generate_description(
            store_name="轉運棧咖啡廳",
            domain="美食",
            category="咖啡廳/甜點",
            vibe=["攝影出片"],
            title="台北超美咖啡廳",
            description_text="超好拍的咖啡廳！",
        )

    assert isinstance(result, str)
    assert len(result) > 0


def test_generate_description_returns_none_on_error():
    with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}), \
         patch("tg_bot.llm.extractor.genai") as mock_genai:
        mock_genai.configure = MagicMock()
        mock_genai.GenerativeModel.side_effect = Exception("quota exceeded")

        result = generate_description(
            store_name="test",
            domain="美食",
            category="小吃",
            vibe=[],
            title="",
            description_text="",
        )

    assert result is None
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
uv run pytest tests/test_extractor.py -v 2>&1 | head -20
```

預期：`ImportError: cannot import name 'generate_description'`

- [ ] **Step 3: 實作 extractor.py 變更**

完整替換 `tg_bot/llm/extractor.py`：

```python
import os
import json
import google.generativeai as genai

PROMPT_TEMPLATE = """
你是一個精準的社群影音資料分析助理。
請閱讀以下來自 Instagram/YouTube 的貼文內容（標題、描述、標籤），並嚴格根據我提供的【Tag 字典】，提取出對應的資訊。

【Tag 字典】
- Domain: [美食, 景點, 其他]
- Location: [基隆, 台北, 新北, 桃園, 新竹, 苗栗, 台中, 彰化, 南投, 雲林, 嘉義, 台南, 高雄, 屏東, 宜蘭, 花蓮, 台東, 澎湖, 金門, 馬祖, 台灣其他, 東京, 京都, 大阪, 北海道, 沖繩, 福岡, 名古屋, 日本其他, 香港, 澳門, 新加坡, 曼谷, 首爾, 峇里島, 海外其他]
- Category (Domain=美食): [拉麵, 咖哩, 火鍋, 燒肉/烤肉, 牛肉麵, 滷肉飯, 熱炒, 海鮮, 壽司/日料, 韓式料理, 義式料理, 早午餐, 咖啡廳/甜點, 酒吧/居酒屋, 小吃]
- Category (Domain=景點): [自然景觀, 歷史人文, 藝文空間, 商業娛樂, 建築特色]
- Category (Domain=其他): [其他]
- Vibe: [攝影出片, 適合工作/讀書, 散步放鬆, 朋友聚會, 逛街購物, 戶外活動]

【台灣地名對照】（鄉鎮→縣市）
斗六、虎尾、西螺、北港 → 雲林
竹北、竹東 → 新竹
板橋、新莊、中和、永和、淡水、九份 → 新北
豐原、大甲、逢甲、一中街 → 台中
清境、日月潭、埔里 → 南投
安平、赤崁樓 → 台南
六合夜市、駁二、瑞豐夜市、左營 → 高雄
墾丁 → 屏東
七星潭、太魯閣 → 花蓮
阿里山 → 嘉義
礁溪、羅東 → 宜蘭
中壢 → 桃園
基隆廟口 → 基隆

【輸出規則】
1. 必須輸出純 JSON，不得有多餘文字或 markdown。
2. 若影片介紹多個地點，每個地點輸出一筆，放在 "locations" 陣列。
3. 每個欄位只能從 Tag 字典中挑選。若完全無法判斷，填 null。
4. "vibe" 可挑 1~2 個，以陣列表示。
5. "store_name" 直接從內文提取確切店名或景點名（不受字典限制）。
6. "location" 填縣市層級（優先參考地名對照表，例如「斗六」→ 填「雲林」）。
7. "address" 填完整地址（若內文有提到），否則填 null。
8. 如果資訊不足以判斷是美食還是景點，請直接回傳 locations 空陣列。
9. 不要用過於概括的 store_name，如果無法確定店名，就留 null。

【貼文內容】
標題：{title}
描述：{description}
標籤：{tags}
打卡地點：{checkin}

【預期輸出格式】
{{
  "locations": [
    {{
      "store_name": "店名或景點名稱",
      "domain": "美食",
      "location": "新竹",
      "category": "小吃",
      "vibe": ["朋友聚會"],
      "address": "新竹市東區民生路147號"
    }}
  ]
}}
"""

DESCRIPTION_PROMPT = """
你是一個旅遊景點文案助理。請根據以下景點資訊，用繁體中文寫出 2-3 句的重點摘要，
說明這個地點的特色與適合的情境，語氣輕鬆自然，像在推薦朋友一樣。
不要加任何標題或格式符號，只輸出純文字摘要。

景點名稱：{store_name}
類型：{domain} / {category}
氛圍標籤：{vibe}
影片標題：{title}
影片描述：{description}
"""


def _load_api_key() -> str:
    """Return the single GEMINI_API_KEY from env."""
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        raise RuntimeError("GEMINI_API_KEY not set in environment")
    return key


def extract_locations(metadata: dict) -> list[dict]:
    key = _load_api_key()
    genai.configure(api_key=key)
    model = genai.GenerativeModel("gemini-2.5-flash-lite")

    prompt = PROMPT_TEMPLATE.format(
        title=metadata.get("title", ""),
        description=(metadata.get("description", "") or "")[:2000],
        tags=", ".join(metadata.get("tags", [])),
        checkin=metadata.get("checkin", "") or "無",
    )

    response = model.generate_content(prompt)
    raw = response.text.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]

    parsed = json.loads(raw)
    locations = parsed.get("locations", [])

    for loc in locations:
        if not loc.get("store_name"):
            location = loc.get("location") or ""
            category = loc.get("category") or ""
            loc["store_name"] = f"{location}{category}" if (location or category) else "未命名地點"

    return locations


def generate_description(
    store_name: str,
    domain: str,
    category: str,
    vibe: list[str],
    title: str,
    description_text: str,
) -> str | None:
    """Generate a 2-3 sentence place highlight using gemma-4-31b-it.
    Returns None on any failure — caller must not block on this.
    """
    try:
        key = _load_api_key()
        genai.configure(api_key=key)
        model = genai.GenerativeModel("gemma-4-31b-it")
        prompt = DESCRIPTION_PROMPT.format(
            store_name=store_name or "未知",
            domain=domain or "",
            category=category or "",
            vibe="、".join(vibe) if vibe else "無",
            title=title or "",
            description=description_text[:500] if description_text else "",
        )
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception:
        return None
```

- [ ] **Step 4: 執行測試確認通過**

```bash
uv run pytest tests/test_extractor.py -v
```

預期：`2 passed`

- [ ] **Step 5: Commit**

```bash
git add tg_bot/llm/extractor.py tests/
git commit -m "feat: add generate_description (gemma-4-31b-it), single API key"
```

---

## Task 7: tg_bot/bot/handlers.py — 注入 description

**Files:**
- Modify: `tg_bot/bot/handlers.py`

- [ ] **Step 1: 更新 handlers.py import 行**

替換頂部所有 import 為：

```python
import re
from dotenv import load_dotenv

from tg_bot.scraper.fetch import fetch_metadata
from tg_bot.llm.extractor import extract_locations, generate_description
from db.engine import get_session
from db.crud import get_or_create_user, get_item_by_url, create_item_with_places
from db.rate_limit import check_and_increment_llm
```

（移除 `from pathlib import Path`，`load_dotenv` 保留但不帶參數）

- [ ] **Step 2: 在 handle_message 的 try 區塊注入 description**

找到：

```python
        try:
            meta = fetch_metadata(url)
            locations = extract_locations(meta)
            create_item_with_places(
```

改為：

```python
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
```

- [ ] **Step 3: 驗證 import**

```bash
uv run python -c "from tg_bot.bot.handlers import handle_message; print('ok')"
```

預期：`ok`

- [ ] **Step 4: Commit**

```bash
git add tg_bot/bot/handlers.py
git commit -m "feat: inject place description before saving to DB"
```

---

## Task 8: db/user_loader.py — load_preference_from_db()

**Files:**
- Create: `db/user_loader.py`
- Create: `tests/test_user_loader.py`

- [ ] **Step 1: 寫失敗測試**

建立 `tests/test_user_loader.py`：

```python
from unittest.mock import MagicMock, patch
from db.user_loader import load_preference_from_db


def _make_place(store_name, vibe, description):
    p = MagicMock()
    p.store_name = store_name
    p.vibe = vibe
    p.description = description
    return p


def _make_item(url, places):
    i = MagicMock()
    i.url = url
    i.item_places = [MagicMock(place=p) for p in places]
    return i


def test_load_preference_builds_user_preference():
    place1 = _make_place("小籠包王", ["朋友聚會", "攝影出片"], "道地台灣小吃，必訪！")
    place2 = _make_place("大安森林公園", ["散步放鬆"], "台北市中心綠洲，適合慢跑。")
    item1 = _make_item("https://ig.com/reel/abc", [place1])
    item2 = _make_item("https://ig.com/reel/def", [place2])

    mock_user = MagicMock()
    mock_user.username = "testuser"
    mock_user.items = [item1, item2]

    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_session.get.return_value = mock_user

    with patch("db.user_loader.get_session", return_value=MagicMock(return_value=mock_session)):
        pref = load_preference_from_db(12345)

    assert pref.user_id == "12345"
    assert pref.display_name == "testuser"
    assert "朋友聚會" in pref.selected_tags
    assert "散步放鬆" in pref.selected_tags
    assert len(pref.reels) == 2
    assert pref.reels[0].url == "https://ig.com/reel/abc"
    assert "道地台灣小吃" in pref.reels[0].text_content
    assert "朋友聚會" in pref.reels[0].auto_tags


def test_load_preference_returns_empty_if_user_not_found():
    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_session.get.return_value = None

    with patch("db.user_loader.get_session", return_value=MagicMock(return_value=mock_session)):
        pref = load_preference_from_db(99999)

    assert pref.user_id == ""
    assert pref.selected_tags == []
    assert pref.reels == []
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
uv run pytest tests/test_user_loader.py -v 2>&1 | head -10
```

預期：`ModuleNotFoundError: No module named 'db.user_loader'`

- [ ] **Step 3: 實作 db/user_loader.py**

```python
"""
db/user_loader.py — Build UserPreference from shared PostgreSQL.
Used by Agent API /search when tg_user_id is provided.
"""
from db.engine import get_session
from db.models import User
from agent.models import Reel, UserPreference


def load_preference_from_db(tg_user_id: int) -> UserPreference:
    """
    Query the shared DB for a Telegram user's saved places and build a UserPreference.
    Returns an empty UserPreference if the user is not found — never raises.
    """
    Session = get_session()
    with Session() as db:
        user = db.get(User, tg_user_id)
        if user is None:
            return UserPreference()

        seen_tags: dict[str, None] = {}
        reels: list[Reel] = []

        for item in user.items:
            item_vibes: dict[str, None] = {}
            descriptions: list[str] = []

            for ip in item.item_places:
                place = ip.place
                if place.description:
                    descriptions.append(place.description)
                for tag in (place.vibe or []):
                    seen_tags[tag] = None
                    item_vibes[tag] = None

            reels.append(Reel(
                url=item.url,
                text_content=" ".join(descriptions),
                auto_tags=list(item_vibes),
            ))

        return UserPreference(
            user_id=str(tg_user_id),
            display_name=user.username or "",
            selected_tags=list(seen_tags),
            reels=reels,
        )
```

- [ ] **Step 4: 執行測試確認通過**

```bash
uv run pytest tests/test_user_loader.py -v
```

預期：`2 passed`

- [ ] **Step 5: Commit**

```bash
git add db/user_loader.py tests/test_user_loader.py
git commit -m "feat: add db/user_loader for DB-based UserPreference"
```

---

## Task 9: main.py — SearchRequest + /search 更新

**Files:**
- Modify: `main.py`

- [ ] **Step 1: 加入 db/user_loader import**

在 `main.py` 的 import 區塊，`from agent.models import UserPreference, load_user` 那行後面加：

```python
from db.user_loader import load_preference_from_db
```

- [ ] **Step 2: 更新 SearchRequest**

找到：

```python
class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    tags: list[str] = []
```

改為：

```python
class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    tg_user_id: Optional[int] = None   # Telegram user ID — loads preference from DB
    tags: list[str] = []
```

- [ ] **Step 3: 更新 /search handler 偏好載入邏輯**

找到：

```python
        preference = UserPreference()
        preference_path = None

        if request.user_id:
            preference, preference_path = load_user(request.user_id, config.USERS_DIR)
```

改為：

```python
        preference = UserPreference()
        preference_path = None

        if request.tg_user_id is not None:
            preference = load_preference_from_db(request.tg_user_id)
        elif request.user_id:
            preference, preference_path = load_user(request.user_id, config.USERS_DIR)
```

- [ ] **Step 4: 驗證 FastAPI app 啟動**

```bash
uv run python -c "from main import app; print('ok')"
```

預期：`ok`

- [ ] **Step 5: Commit**

```bash
git add main.py
git commit -m "feat: /search accepts tg_user_id and loads UserPreference from DB"
```

---

## Task 10: scripts/seed_demo_users.py

**Files:**
- Create: `scripts/__init__.py`
- Create: `scripts/seed_demo_users.py`

- [ ] **Step 1: 建立 seed script**

建立 `scripts/__init__.py`（空）和 `scripts/seed_demo_users.py`：

```python
"""
scripts/seed_demo_users.py — Import db/users/*.json into PostgreSQL as demo data.

Runs on every agent-api container start. Idempotent via ON CONFLICT DO NOTHING.
Demo users get synthetic negative integer IDs: -1, -2, ...
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import config
from db.engine import get_engine
from db.models import Base, User, Item, ItemPlace, Place
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert


def seed():
    users_dir = Path(config.USERS_DIR)
    if not users_dir.exists():
        print(f"[seed] No users dir at {users_dir}, skipping.")
        return

    json_files = sorted(users_dir.glob("*.json"))
    if not json_files:
        print("[seed] No user JSON files found, skipping.")
        return

    engine = get_engine()
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        for idx, path in enumerate(json_files):
            demo_id = -(idx + 1)  # -1, -2, ...
            data = json.loads(path.read_text(encoding="utf-8"))

            db.execute(
                pg_insert(User.__table__)
                .values(id=demo_id, username=data.get("display_name") or path.stem)
                .on_conflict_do_nothing()
            )

            for reel in data.get("reels", []):
                url = reel.get("url", "")
                if not url:
                    continue

                result = db.execute(
                    pg_insert(Item.__table__)
                    .values(
                        user_id=demo_id,
                        platform="demo",
                        url=url,
                        title=reel.get("text_content", "")[:200],
                        raw_metadata={},
                    )
                    .on_conflict_do_nothing()
                    .returning(Item.__table__.c.id)
                )
                row = result.fetchone()
                if row is None:
                    continue
                item_id = row[0]

                text = reel.get("text_content", "")
                auto_tags = reel.get("auto_tags", [])

                result2 = db.execute(
                    pg_insert(Place.__table__)
                    .values(
                        store_name=text[:50] if text else "Demo",
                        domain="景點",
                        vibe=auto_tags,
                        description=text[:300] if text else None,
                    )
                    .returning(Place.__table__.c.id)
                )
                place_id = result2.fetchone()[0]

                db.execute(
                    pg_insert(ItemPlace.__table__)
                    .values(item_id=item_id, place_id=place_id)
                    .on_conflict_do_nothing()
                )

        db.commit()
        print(f"[seed] Imported {len(json_files)} demo user(s) from {users_dir}")


if __name__ == "__main__":
    seed()
```

- [ ] **Step 2: 驗證 script 可 import**

```bash
uv run python -c "import scripts.seed_demo_users; print('ok')"
```

預期：`ok`

- [ ] **Step 3: Commit**

```bash
git add scripts/
git commit -m "feat: add seed_demo_users script"
```

---

## Task 11: Dockerfile.agent + Dockerfile.tgbot

**Files:**
- Create: `Dockerfile.agent`
- Create: `Dockerfile.tgbot`

- [ ] **Step 1: 建立 Dockerfile.agent**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
CMD ["sh", "-c", "uv run python scripts/seed_demo_users.py && uv run uvicorn main:app --host 0.0.0.0 --port 8000"]
```

- [ ] **Step 2: 建立 Dockerfile.tgbot**

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .
CMD ["uv", "run", "python", "-m", "tg_bot.bot.main"]
```

- [ ] **Step 3: 驗證兩個 image 都能 build**

```bash
docker build -f Dockerfile.agent -t agent-api:test . && echo "agent ok"
docker build -f Dockerfile.tgbot -t tg-bot:test . && echo "tgbot ok"
```

預期：`agent ok` 和 `tgbot ok`

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.agent Dockerfile.tgbot
git commit -m "chore: add Dockerfile.agent and Dockerfile.tgbot"
```

---

## Task 12: docker-compose.yml + .env.example

**Files:**
- Create: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: 建立 docker-compose.yml**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

  tg-bot:
    build:
      context: .
      dockerfile: Dockerfile.tgbot
    environment:
      DATABASE_URL: ${DATABASE_URL}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      APIFY_TOKEN: ${APIFY_TOKEN}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      YOUTUBE_API_KEY: ${YOUTUBE_API_KEY}
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

  agent-api:
    build:
      context: .
      dockerfile: Dockerfile.agent
    environment:
      DATABASE_URL: ${DATABASE_URL}
      GOOGLE_API_KEY: ${GOOGLE_API_KEY}
      GOOGLE_API_KEY_2: ${GOOGLE_API_KEY_2}
      GOOGLE_API_KEY_3: ${GOOGLE_API_KEY_3}
      GOOGLE_MAPS_API_KEY: ${GOOGLE_MAPS_API_KEY}
      YTP_API_KEY: ${YTP_API_KEY}
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
```

- [ ] **Step 2: 更新 .env.example**

```env
# ── PostgreSQL ────────────────────────────────────────
POSTGRES_DB=ytp
POSTGRES_USER=ytp
POSTGRES_PASSWORD=changeme
DATABASE_URL=postgresql://ytp:changeme@db:5432/ytp

# ── TG Bot ────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=
APIFY_TOKEN=
GEMINI_API_KEY=           # 景點萃取（gemini-2.5-flash-lite）+ 摘要（gemma-4-31b-it）
YOUTUBE_API_KEY=

# ── Agent API ─────────────────────────────────────────
GOOGLE_API_KEY=            # Gemini key #1（rotation）
GOOGLE_API_KEY_2=          # Gemini key #2（optional）
GOOGLE_API_KEY_3=          # Gemini key #3（optional）
GOOGLE_MAPS_API_KEY=
YTP_API_KEY=
```

- [ ] **Step 3: 驗證 compose config 合法**

先複製並填入最少值後驗證：

```bash
cp .env.example .env
# 手動在 .env 填入真實的 POSTGRES_PASSWORD 和 DATABASE_URL
docker compose config --quiet && echo "config valid"
```

預期：`config valid`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore: add docker-compose and update .env.example"
```

---

## Task 13: 整合驗證

- [ ] **Step 1: 啟動所有服務**

```bash
docker compose up --build
```

預期 log 包含：
- `db` 健康檢查通過（`database system is ready to accept connections`）
- `[seed] Imported N demo user(s)` 或 `skipping`
- `agent-api` Uvicorn 在 port 8000 啟動
- `tg-bot` 顯示 `Bot started (long-polling)...`

- [ ] **Step 2: 健康檢查**

```bash
curl http://localhost:8000/health
```

預期：`{"status":"ok"}`

- [ ] **Step 3: 驗證 /search 接受 tg_user_id**

```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $YTP_API_KEY" \
  -d '{"query": "台北咖啡廳", "tg_user_id": -1}'
```

預期：回傳 SpotResult JSON

- [ ] **Step 4: 執行所有測試**

```bash
docker compose exec agent-api uv run pytest tests/ -v
```

預期：`4 passed`

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "chore: integration verified — monorepo with docker-compose"
```
