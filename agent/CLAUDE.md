# YTP Planning Agent

台北一日遊規劃 Agent，接收景點檢索結果 JSON，輸出 3 條優化路線。

## 技術棧

- **Runtime**: Python 3.10+, managed by `uv`
- **Agent Framework**: Google ADK (`google-adk`) with Gemini 2.5 Flash
- **Web Service**: FastAPI + uvicorn
- **APIs**: Google Places API, Google Distance Matrix API, Open-Meteo (天氣)
- **Version Control**: git + conventional commits

## 專案結構

```
ytp_planning_agent/
├── main.py                  # FastAPI app
├── agent/
│   ├── planner.py           # LlmAgent 定義 + system prompt
│   ├── tools.py             # geocode_places, search_places, evaluate_route
│   └── preprocessor.py      # 前處理：過濾非台北、呼叫天氣
├── schemas.py               # Pydantic input/output schema
├── pyproject.toml
└── .env.example
```

## 架構說明

### 兩層設計

1. **Python 前處理層** (`preprocessor.py`)
   - 解析並合併所有 `top_results[].extracted_places`
   - 過濾非台北景點（透過地名或低相關分數判斷）
   - 呼叫 Open-Meteo API 取得台北當日天氣
   - 組裝 context 字串傳入 Agent

2. **LlmAgent** (`planner.py`)
   - 使用 Gemini 2.5 Flash
   - 工具：`geocode_places`, `search_places`, `evaluate_route`
   - System prompt 強制執行 4 步驟流程（初始化 → 擴充 → 路線生成 → 輸出）

### 工具說明

- `geocode_places(names: list[str])`: Google Places Text Search，回傳 place_id + lat/lng + 營業時間
- `search_places(keyword: str)`: 補足缺口景點（玫瑰園、酒吧等），回傳前 3 候選
- `evaluate_route(waypoints: list)`: 暴力全排列 TSP（3-4 點最多 24 種），呼叫 Distance Matrix API，回傳最佳排序

### Smoothness Score

`smoothness_score = 1 - (actual_transit_time / optimal_transit_time)`，範圍 0-1。

## 環境設定

```bash
# 安裝依賴
uv sync

# 設定環境變數（複製 .env.example 並填入）
cp .env.example .env

# 本地測試（ADK web UI）
uv run adk web agent/

# 啟動 FastAPI 服務
uv run uvicorn main:app --reload
```

## 環境變數

| 變數 | 說明 |
|------|------|
| `GOOGLE_API_KEY` | Gemini API key（ADK 使用） |
| `GOOGLE_MAPS_API_KEY` | Google Maps Platform key（Places + Distance Matrix） |

Open-Meteo 不需要 API key。

## API Endpoints

- `POST /plan` — 接收 spot_result JSON，回傳 3 條路線
- `GET /health` — 健康檢查
- `GET /docs` — Swagger UI

## Input/Output

- **Input**: `spot_result_v1.json` 格式（`query` + `user_preference` + `top_results`）
- **Output**: `{ "recommended_routes": [...] }` 格式（見 spec.md）

## Conventional Commits

```
feat: 新增功能
fix: 修復 bug
chore: 設定、依賴更新
refactor: 重構
docs: 文件
test: 測試
```

## Spec 改進事項（相對於 spec.md）

1. **非台北景點過濾**：rank 8 雲林景點等需在前處理層剔除
2. **smoothness_score 公式**：已在上方定義
3. **Google Maps URL**：使用 URL-encoded 景點名稱，非直接中文字串
4. **Persona 動態化**：從 `combined_tags` + `reels` 文字內容推斷，不寫死使用者名稱
5. **`reels` 欄位活用**：`user_preference_full.reels[].text_content` 加入 system prompt 豐富偏好描述
