# YTP Planning Agent

台北一日遊規劃系統。從關鍵字搜尋景點、規劃最佳路線，到抓取評論照片一站完成。

## 系統架構

```
┌─────────────────────────────────────────────────────┐
│                   docker-compose                     │
│                                                      │
│  ┌──────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │    db    │   │   tg-bot     │   │  agent-api  │ │
│  │Postgres16│◄──│Telegram Bot  │   │  FastAPI    │ │
│  │port 5432 │   │(收藏 IG/YT) │◄──│  port 8000  │ │
│  └──────────┘   └──────────────┘   └─────────────┘ │
└─────────────────────────────────────────────────────┘
```

**典型使用流程：**

```
POST /search  →  POST /plan  →  POST /enrich
   景點搜尋       路線規劃       評論 + 照片
```

---

## 快速開始（Docker）

```bash
# 1. 複製環境變數範本
cp .env.example .env
# 編輯 .env，填入必要的 key（見下方表格）

# 2. 啟動所有服務
docker compose up --build

# 3. 確認服務健康
curl http://localhost:8000/health
# {"status":"ok"}
```

Swagger UI：http://localhost:8000/docs

---

## API Endpoints

所有 `POST` endpoint 需在 Header 帶上 `X-API-Key: <YTP_API_KEY>`。

### GET /health

健康檢查，不需 API key。

```bash
curl http://localhost:8000/health
```

```json
{"status": "ok"}
```

---

### POST /search

用關鍵字搜尋台北景點，回傳 `SpotResult`（可直接傳給 `/plan`）。

**Request body：**

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `query` | string | ✅ | 搜尋關鍵字，例如 `"台北文青咖啡"` |
| `tg_user_id` | integer | — | Telegram user ID，自動從 DB 載入收藏偏好 |
| `user_id` | string | — | file-based 使用者 ID（`db/users/<id>.json`） |
| `tags` | string[] | — | 額外標籤，合併至使用者偏好 |

優先順序：`tg_user_id` > `user_id` > 無偏好。

```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your_key>" \
  -d '{"query": "台北文青咖啡", "tg_user_id": -1}'
```

**Response：** `SpotResult`

```json
{
  "query": "台北文青咖啡",
  "user_preference": { "selected_tags": [...], "reels": [...] },
  "top_results": [
    {
      "place_name": "來點咖啡",
      "score": 0.87,
      "extracted_places": [...]
    }
  ]
}
```

---

### POST /plan

接收 `/search` 的輸出（`SpotResult`），回傳 3 條優化路線。

```bash
curl -X POST http://localhost:8000/plan \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your_key>" \
  -d @search_result.json
```

**Response：** `PlanResponse`

```json
{
  "recommended_routes": [
    {
      "route_id": "route_A",
      "route_name": "晨光玫瑰與巷弄微醺之旅",
      "theme": "文青 × 花園",
      "tsp_evaluation": {
        "total_transit_time_mins": 45,
        "smoothness_score": 0.95
      },
      "google_maps_url": "https://www.google.com/maps/dir/...",
      "waypoints": [
        {
          "order": 1,
          "name": "台北玫瑰園",
          "address": "台北市中山區...",
          "lat": 25.05,
          "lng": 121.53,
          "stay_mins": 60,
          "opening_hours": ["週二-週日 09:00-17:00"],
          "tags": ["花園", "戶外"]
        }
      ]
    }
  ]
}
```

---

### POST /enrich

對規劃完成的路線，為每個景點抓取 Google 評論、照片，並生成短影片字幕。

**Request body：** `PlanResponse`（即 `/plan` 的輸出）

```bash
curl -X POST http://localhost:8000/enrich \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <your_key>" \
  -d @plan_result.json
```

**Response：** `EnrichResponse`

```json
{
  "run_id": "20260405_143022",
  "routes": [
    {
      "route_id": "route_A",
      "waypoints": [
        {
          "name": "台北玫瑰園",
          "reviews": ["很美的花園..."],
          "photos": ["data/routes/20260405_143022/route_A/台北玫瑰園/photo_0.jpg"],
          "captions": ["清晨的玫瑰園，陽光灑落..."]
        }
      ]
    }
  ]
}
```

---

## 完整流程範例（JavaScript）

```js
const BASE = "http://localhost:8000";
const HEADERS = {
  "Content-Type": "application/json",
  "X-API-Key": "<your_key>",
};

// 1. 搜尋景點（帶入 Telegram user ID 使用其收藏偏好）
const searchRes = await fetch(`${BASE}/search`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({ query: "台北文青咖啡", tg_user_id: 123456789 }),
});
const spotResult = await searchRes.json();

// 2. 規劃路線
const planRes = await fetch(`${BASE}/plan`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify(spotResult),
});
const planResult = await planRes.json();

// 3. 豐富內容（評論 + 照片 + 字幕）
const enrichRes = await fetch(`${BASE}/enrich`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify(planResult),
});
const enriched = await enrichRes.json();

console.log(planResult.recommended_routes[0].google_maps_url);
```

---

## 測試服務

### 1. Swagger UI 互動測試

打開 http://localhost:8000/docs ，可以直接在瀏覽器試打所有 API。

### 2. 健康檢查

```bash
curl http://localhost:8000/health
```

### 3. Demo 使用者（不需 Telegram）

容器啟動時會自動從 `db/users/*.json` 匯入 demo 使用者（ID = `-1`, `-2`, ...）：

```bash
# 用 demo 使用者跑完整流程
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $YTP_API_KEY" \
  -d '{"query": "台北週末下午", "tg_user_id": -1}' \
  | python3 -m json.tool
```

### 4. 端對端 curl 測試

```bash
# Step 1: 搜尋 → 存成 search.json
curl -s -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $YTP_API_KEY" \
  -d '{"query": "台北文青咖啡", "tg_user_id": -1}' > search.json

# Step 2: 規劃 → 存成 plan.json
curl -s -X POST http://localhost:8000/plan \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $YTP_API_KEY" \
  -d @search.json > plan.json

# Step 3: 豐富內容
curl -s -X POST http://localhost:8000/enrich \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $YTP_API_KEY" \
  -d @plan.json | python3 -m json.tool
```

### 5. 單元測試

```bash
uv run pytest tests/ -v
```

---

## 環境變數

複製 `.env.example` 並填入：

```bash
cp .env.example .env
```

| 變數 | 服務 | 說明 |
|------|------|------|
| `POSTGRES_DB` | db | 資料庫名稱（預設 `ytp`） |
| `POSTGRES_USER` | db | 資料庫帳號 |
| `POSTGRES_PASSWORD` | db | 資料庫密碼 |
| `DATABASE_URL` | tg-bot, agent-api | `postgresql://user:pass@db:5432/ytp` |
| `TELEGRAM_BOT_TOKEN` | tg-bot | BotFather 取得的 token |
| `APIFY_TOKEN` | tg-bot | Instagram Reels scraper |
| `GEMINI_API_KEY` | tg-bot | 景點萃取 + 摘要生成（gemma-4-31b-it） |
| `YOUTUBE_API_KEY` | tg-bot | YouTube Shorts metadata |
| `GOOGLE_API_KEY` | agent-api | Gemini key #1（搜尋 + 規劃） |
| `GOOGLE_API_KEY_2` | agent-api | Gemini key #2（optional，rotation） |
| `GOOGLE_API_KEY_3` | agent-api | Gemini key #3（optional，rotation） |
| `GOOGLE_MAPS_API_KEY` | agent-api | Places API + Distance Matrix |
| `YTP_API_KEY` | agent-api | API 認證 key（自行產生） |

產生 `YTP_API_KEY`：
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## 專案結構

```
YTP_Planning_Agent/
├── main.py                  # FastAPI app（/search、/plan、/enrich）
├── schemas.py               # Pydantic input/output schema
├── Dockerfile.agent         # agent-api 容器
├── Dockerfile.tgbot         # tg-bot 容器
├── docker-compose.yml       # 三服務編排
├── .env.example             # 環境變數範本
│
├── agent/                   # 規劃 pipeline
│   ├── planner.py           # LlmAgent + Gemini 2.5 Flash
│   ├── preprocessor.py      # 前處理：過濾非台北、天氣
│   └── tools.py             # geocode_places, search_places, evaluate_route
│
├── search/                  # 搜尋 pipeline
│   ├── agents/
│   │   ├── models.py        # UserPreference, Reel dataclasses
│   │   ├── search_agent.py  # 完整 pipeline 入口
│   │   └── ...
│   └── config.py
│
├── db/                      # 共用資料庫層（兩服務共用）
│   ├── engine.py            # SQLAlchemy engine
│   ├── models.py            # ORM models（users/items/places）
│   ├── crud.py              # TG Bot CRUD
│   ├── user_loader.py       # load_preference_from_db()
│   └── users/              # Demo 使用者 JSON
│
├── tg_bot/                  # Telegram Bot
│   ├── bot/                 # main.py, handlers, callbacks, keyboards
│   ├── llm/                 # extractor.py（景點萃取 + 摘要生成）
│   └── scraper/             # Instagram / YouTube metadata 抓取
│
├── scripts/
│   └── seed_demo_users.py   # DB 初始化：匯入 demo 使用者
│
└── tests/                   # pytest 單元測試
```

---

## 本地開發（不用 Docker）

```bash
# 安裝依賴
uv sync

# 需要本地 PostgreSQL，或用 docker 只跑 db：
docker compose up db -d

# 啟動 agent-api
uv run python scripts/seed_demo_users.py
uv run uvicorn main:app --reload --port 8000

# ADK web UI（測試規劃 agent）
uv run adk web .
```

---

## 版本控制

使用 **Conventional Commits**：

```
feat:     新功能
fix:      修正
chore:    設定、依賴更新
refactor: 重構
docs:     文件
test:     測試
```
