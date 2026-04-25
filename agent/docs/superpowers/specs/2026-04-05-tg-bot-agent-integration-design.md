# TG Bot × Agent API Integration Design

**Date:** 2026-04-05  
**Scope:** Docker Compose 化 + 共享 PostgreSQL + 景點摘要生成 + Agent API 讀取 TG Bot 使用者收藏

---

## 1. 目標

1. 用 `docker-compose` 同時跑 TG Bot 和 Agent API，共用一個 PostgreSQL 資料庫
2. TG Bot 儲存景點時，同步用 LLM 生成一段景點重點摘要（`Place.description`）
3. Agent API 的 `/search` 接受 `tg_user_id`，從 DB 自動組成 `UserPreference`（`selected_tags` + `reels`）
4. 現有 `data/users/*.json` 在 agent-api 容器啟動時匯入 DB 作為 demo 資料

---

## 2. 系統架構

```
YTP_Planning_Agent/   ← monorepo，兩個服務都在這裡
├── main.py            (Agent API)
├── agent/             (Agent API pipeline)
├── db/                (SHARED — 兩個服務共用)
├── tg_bot/            (TG Bot，從 reels-tg-bot/ merge 進來)
├── Dockerfile.agent
├── Dockerfile.tgbot
└── docker-compose.yml

docker-compose.yml
├── db           postgres:16，port 5432，volume postgres_data
├── tg-bot       context: .，dockerfile: Dockerfile.tgbot，depends_on db
└── agent-api    context: .，dockerfile: Dockerfile.agent，depends_on db，port 8000
```

所有服務共用根目錄 `.env`，各服務只讀自己需要的變數。

### 資料流

```
使用者貼 IG/YT 連結
  → tg-bot scraper 抓 metadata
  → extractor.py: 景點萃取（gemini-2.5-flash-lite）
  → extractor.py: 摘要生成（gemma-4-31b-it）
  → 寫入 PostgreSQL: users / items / places / item_places

前端呼叫 POST /search { tg_user_id: 123 }
  → agent-api db/ 查詢 User → Items → Places
  → 組成 UserPreference { selected_tags, reels }
  → run_search(query, preference)
  → 回傳 SpotResult
```

---

## 3. DB Schema 變更

只有一處變更：`places` 表新增 `description` 欄位。

```sql
ALTER TABLE places ADD COLUMN description TEXT;
```

**SQLAlchemy model（`reels-tg-bot/db/models.py`）：**

```python
description = Column(Text)  # LLM 生成的景點重點摘要，可為 null
```

其餘 schema 不動：

| 表 | 說明 |
|----|------|
| `users` | Telegram user_id（BigInteger PK）, username |
| `items` | 收藏影片，url UNIQUE，FK → users |
| `places` | 景點主檔，新增 description 欄 |
| `item_places` | items ↔ places M2M |
| `daily_usage` | 每日 LLM/操作用量限制 |

---

## 4. TG Bot 變更

### 4.1 景點摘要生成（`llm/extractor.py`）

新增 `generate_description(store_name, domain, category, vibe, title, description_text)` 函式：

- 模型：`gemma-4-31b-it`（Google AI Studio，同一支 `GEMINI_API_KEY`）
- 輸出：2-3 句中文重點摘要，說明這個地點的特色與適合情境
- 若生成失敗（quota / 解析錯誤）：靜默 fallback，`description = None`，不 block 主流程

**呼叫時機：** 現有 `extract_locations()` 之後、`create_item_with_places()` 之前，對每個 location dict 注入 `description` 欄位。

### 4.2 Key 管理

TG Bot 改為只用單一 `GEMINI_API_KEY`，移除 `GEMINI_API_KEY2`/`GEMINI_API_KEY3` 的讀取邏輯。

### 4.3 Dockerfile（`reels-tg-bot/Dockerfile`）

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "-m", "bot.main"]
```

---

## 5. Agent API 變更

### 5.1 共用 `db/` 模組（root-level）

reels-tg-bot 的 `db/` 整個移進 monorepo root，兩個服務都 import `from db.xxx`：

```
db/
├── __init__.py
├── engine.py      # SQLAlchemy engine，讀 DATABASE_URL
├── models.py      # 共用 models（含新增的 description 欄位）
├── crud.py        # TG Bot CRUD 操作
├── rate_limit.py  # 每日用量限制
└── user_loader.py # NEW: load_preference_from_db(tg_user_id) → UserPreference
```

### 5.2 `load_preference_from_db` 邏輯

```python
def load_preference_from_db(tg_user_id: int) -> UserPreference:
    # 查 User → Items → ItemPlaces → Places
    # selected_tags = 所有 Place.vibe 的扁平去重列表
    # reels = [
    #     Reel(
    #         url=item.url,
    #         text_content=" ".join(p.description for p in item.places if p.description),
    #         auto_tags=deduplicated vibes from item's places,
    #     )
    #     for item in user.items
    # ]
```

若 `tg_user_id` 不存在於 DB，回傳空的 `UserPreference()`，不拋錯。

### 5.3 `SearchRequest` 變更（`main.py`）

```python
class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None      # 現有 file-based（不動）
    tg_user_id: Optional[int] = None   # 新增：從 DB 載入偏好
    tags: list[str] = []
```

優先順序：`tg_user_id` > `user_id` > 空偏好。

### 5.4 Demo 資料匯入（`scripts/seed_demo_users.py`）

- 讀取 `data/users/*.json`（`UserPreference` 格式）
- 對每個檔案用 sequential negative ID（`-1`, `-2`, ...）建立 `User`
- 每個 `Reel` → `Item`（platform=`"demo"`）+ 1 筆 minimal `Place`（store_name = text_content 前 50 字，vibe = auto_tags）
- **冪等**：以 `INSERT ... ON CONFLICT DO NOTHING` 實作，每次容器啟動都可重跑
- agent-api `Dockerfile` entrypoint：`python scripts/seed_demo_users.py && uvicorn main:app`

### 5.5 Dockerfile（根目錄 `Dockerfile`）

```dockerfile
FROM python:3.11-slim
WORKDIR /app
RUN pip install uv
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen
COPY . .
CMD ["sh", "-c", "uv run python scripts/seed_demo_users.py && uv run uvicorn main:app --host 0.0.0.0 --port 8000"]
```

---

## 6. Docker Compose

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
      retries: 5

  tg-bot:
    build:
      context: ../reels-tg-bot
    environment:
      DATABASE_URL: ${DATABASE_URL}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      APIFY_TOKEN: ${APIFY_TOKEN}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      YOUTUBE_API_KEY: ${YOUTUBE_API_KEY}
    depends_on:
      db:
        condition: service_healthy

  agent-api:
    build:
      context: .
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

volumes:
  postgres_data:
```

---

## 7. `.env` 設計

根目錄新增 `.env.example`（統一管理所有服務的環境變數）：

```env
# ── PostgreSQL ────────────────────────────────────────
POSTGRES_DB=ytp
POSTGRES_USER=ytp
POSTGRES_PASSWORD=changeme
DATABASE_URL=postgresql://ytp:changeme@db:5432/ytp

# ── TG Bot ────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=
APIFY_TOKEN=
GEMINI_API_KEY=           # 用於景點萃取 + 摘要生成（gemma-4-31b-it）
YOUTUBE_API_KEY=

# ── Agent API ─────────────────────────────────────────
GOOGLE_API_KEY=            # Gemini key #1（rotation）
GOOGLE_API_KEY_2=          # Gemini key #2（optional）
GOOGLE_API_KEY_3=          # Gemini key #3（optional）
GOOGLE_MAPS_API_KEY=
YTP_API_KEY=
```

> **注意**：`../reels-tg-bot/.env` 保留本地開發用（不刪），docker-compose 使用 `YTP_Planning_Agent/.env`。

---

## 8. 不在本次 scope 內

- TG Bot 端直接觸發 `/search` 或 `/plan`（未來可加）
- Alembic migration（本次用 `Base.metadata.create_all` 建表）
- TG Bot 的查詢 UI 顯示 `description` 欄位
- Agent API 的 `tg_user_id` auth 驗證（信任呼叫者傳入的 ID）
