# Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 bugs, consolidate models into single Pydantic source of truth, split `/search-and-plan` into `/search` + `/plan`.

**Architecture:** `agent/models.py` becomes the authoritative Pydantic model layer; `schemas.py` imports from it and adds API-specific schemas; `main.py` gains a `/search` endpoint and drops `/search-and-plan`.

**Tech Stack:** Python 3.11, FastAPI, Pydantic v2, Google ADK, uv

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `agent/models.py` | Rewrite | `Reel`, `UserPreference` as Pydantic BaseModel — single truth |
| `schemas.py` | Rewrite | API schemas; imports UserPreference/Reel from agent/models |
| `agent/preprocessor.py` | Modify | Accept `UserPreference` object; remove dict-based combined_tags lookup |
| `agent/search_pipeline.py` | Modify | Return unified `user_preference` dict (no `user_preference_full`) |
| `agent/planner.py` | Modify | Bug fixes: location passthrough, JSON fallback |
| `main.py` | Rewrite | Add `/search`, remove `/search-and-plan`, fix `get_event_loop` |
| `spot_result_v1.json` | Modify | Update fields to match new SpotResult schema |
| `test_local.py` | Modify | Update `--mode search`, add `--mode smoke` |

---

## Task 1: Rewrite `agent/models.py` — dataclass → Pydantic

**Files:**
- Modify: `agent/models.py`

- [ ] **Step 1: Verify current import works**

```bash
cd /Users/littlepants/Dev/YTP_Planning_Agent
uv run python -c "from agent.models import UserPreference, Reel, load_user; print('ok')"
```

Expected: `ok`

- [ ] **Step 2: Rewrite `agent/models.py`**

Replace entire file content:

```python
"""
agent/models.py — UserPreference 與 Reel 資料模型（唯一真相來源）

Pydantic BaseModel — 同時服務 API schema 層（schemas.py import）與內部 pipeline。
"""

from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel


class Reel(BaseModel):
    url: str
    text_content: str
    auto_tags: list[str] = []


class UserPreference(BaseModel):
    user_id: str = ""
    display_name: str = ""
    selected_tags: list[str] = []
    reels: list[Reel] = []

    def combined_tags(self) -> list[str]:
        """合併 selected_tags + 所有 reel auto_tags，去重並保留順序。"""
        seen = dict.fromkeys(self.selected_tags)
        for reel in self.reels:
            seen.update(dict.fromkeys(reel.auto_tags))
        return list(seen)

    def to_preference_string(self) -> str:
        """以純字串形式回傳所有偏好標籤，用於 LLM prompt。"""
        return "、".join(self.combined_tags())

    def save(self, path: str | Path) -> None:
        """將 UserPreference 寫回 JSON 檔案。"""
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.model_dump(), f, ensure_ascii=False, indent=2)

    @classmethod
    def load(cls, path: str | Path) -> "UserPreference":
        """從 JSON 檔案載入 UserPreference。"""
        with open(path, encoding="utf-8") as f:
            return cls.model_validate(json.load(f))


# ═══════════════════════════════════════════════════════════════════════════════
#  User Registry
# ═══════════════════════════════════════════════════════════════════════════════


def list_users(users_dir: str | Path) -> list[str]:
    """回傳 users_dir 中所有使用者的 user_id。"""
    users_dir = Path(users_dir)
    if not users_dir.is_dir():
        return []
    return sorted(
        f.stem
        for f in users_dir.iterdir()
        if f.suffix == ".json" and not f.name.startswith("_")
    )


def load_user(user_id: str, users_dir: str | Path) -> tuple[UserPreference, str]:
    """
    從 users_dir/<user_id>.json 載入使用者偏好。

    Returns:
        (UserPreference, 檔案路徑字串)

    Raises:
        FileNotFoundError: 找不到對應的使用者檔案
    """
    users_dir = Path(users_dir)
    path = users_dir / f"{user_id}.json"
    if not path.exists():
        available = list_users(users_dir)
        raise FileNotFoundError(
            f"找不到使用者 '{user_id}' 的偏好檔案：{path}\n現有使用者：{available}"
        )
    return UserPreference.load(path), str(path)
```

- [ ] **Step 3: Verify import still works**

```bash
uv run python -c "
from agent.models import UserPreference, Reel, load_user
u = UserPreference(user_id='test', selected_tags=['文青'])
print('combined_tags:', u.combined_tags())
print('model_dump:', u.model_dump())
"
```

Expected output:
```
combined_tags: ['文青']
model_dump: {'user_id': 'test', 'display_name': '', 'selected_tags': ['文青'], 'reels': []}
```

- [ ] **Step 4: Verify load_user works with existing alice.json**

```bash
uv run python -c "
import config
from agent.models import load_user
pref, path = load_user('alice', config.USERS_DIR)
print('user_id:', pref.user_id)
print('tags:', pref.selected_tags[:3])
print('path:', path)
"
```

Expected: prints alice's user_id, some tags, and the file path.

- [ ] **Step 5: Commit**

```bash
git add agent/models.py
git commit -m "refactor: convert UserPreference and Reel to Pydantic BaseModel"
```

---

## Task 2: Rewrite `schemas.py` — remove duplicates, add SpotResult

**Files:**
- Modify: `schemas.py`

- [ ] **Step 1: Rewrite `schemas.py`**

Replace entire file content:

```python
"""
schemas.py — API Pydantic schemas

UserPreference と Reel は agent/models.py から import（唯一真相）。
"""

from pydantic import BaseModel

from agent.models import Reel, UserPreference  # noqa: F401 — re-exported


class ExtractedPlace(BaseModel):
    name: str
    context: str


class TopResult(BaseModel):
    rank: int
    title: str
    url: str
    relevance_score: float
    summary: str
    extracted_places: list[ExtractedPlace]
    tags: list[str]


class SpotResult(BaseModel):
    """POST /search の出力 = POST /plan の入力。"""

    query: str
    user_preference: UserPreference
    top_results: list[TopResult]


class Location(BaseModel):
    lat: float
    lng: float


class Waypoint(BaseModel):
    step_order: int
    name: str
    place_id: str
    location: Location
    suggested_time: str
    reasoning: str


class TspEvaluation(BaseModel):
    total_transit_time_mins: int
    smoothness_score: float


class Route(BaseModel):
    route_id: str
    route_name: str
    theme: str
    tsp_evaluation: TspEvaluation
    google_maps_url: str
    waypoints: list[Waypoint]


class PlanResponse(BaseModel):
    recommended_routes: list[Route]
```

- [ ] **Step 2: Verify schemas import**

```bash
uv run python -c "
from schemas import SpotResult, PlanResponse, UserPreference, Reel
print('SpotResult fields:', list(SpotResult.model_fields.keys()))
print('UserPreference from agent.models:', UserPreference.__module__)
"
```

Expected:
```
SpotResult fields: ['query', 'user_preference', 'top_results']
UserPreference from agent.models: agent.models
```

- [ ] **Step 3: Commit**

```bash
git add schemas.py
git commit -m "refactor: simplify schemas.py — import UserPreference/Reel from agent.models, add SpotResult"
```

---

## Task 3: Update `agent/preprocessor.py` — use UserPreference object

**Files:**
- Modify: `agent/preprocessor.py`

The current `preprocess()` reads `user_preference.get("combined_tags", [])` which won't work after consolidation since `combined_tags` is a method, not a stored field. Fix by reconstructing a `UserPreference` object inside `preprocess()`.

- [ ] **Step 1: Replace `agent/preprocessor.py`**

Replace entire file content:

```python
import httpx

from agent.models import UserPreference

# 台北常見地名關鍵字，用來過濾非台北景點
TAIPEI_KEYWORDS = [
    "台北", "Taipei", "大稻埕", "中山", "信義", "大安", "松山",
    "內湖", "士林", "文山", "南港", "北投", "中正", "萬華", "大同",
]
NON_TAIPEI_KEYWORDS = [
    "雲林", "台中", "台南", "高雄", "嘉義", "彰化", "南投",
    "宜蘭", "花蓮", "台東", "屏東", "基隆", "新竹", "苗栗", "桃園",
]


def is_taipei_place(name: str, context: str) -> bool:
    """判斷景點是否在台北，排除明確標示其他縣市的景點。"""
    text = name + context
    for keyword in NON_TAIPEI_KEYWORDS:
        if keyword in text:
            return False
    return True


def extract_candidate_places(top_results: list[dict]) -> list[dict]:
    """從 top_results 提取並去重台北景點，附帶 context。"""
    seen_names: set[str] = set()
    candidates: list[dict] = []
    for result in top_results:
        for place in result.get("extracted_places", []):
            name = place.get("name", "").strip()
            context = place.get("context", "").strip()
            if name and name not in seen_names and is_taipei_place(name, context):
                seen_names.add(name)
                candidates.append({"name": name, "context": context})
    return candidates


def get_taipei_weather() -> dict:
    """從 Open-Meteo 取得台北當日天氣（免 API key）。"""
    lat, lng = 25.0330, 121.5654
    url = (
        f"https://api.open-meteo.com/v1/forecast"
        f"?latitude={lat}&longitude={lng}"
        f"&daily=weathercode,precipitation_sum,temperature_2m_max,temperature_2m_min"
        f"&timezone=Asia%2FTaipei"
        f"&forecast_days=1"
    )
    try:
        response = httpx.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        daily = data.get("daily", {})
        weather_code = daily.get("weathercode", [0])[0]
        precip = daily.get("precipitation_sum", [0.0])[0]
        temp_max = daily.get("temperature_2m_max", [25.0])[0]
        temp_min = daily.get("temperature_2m_min", [18.0])[0]
        is_rainy = weather_code >= 61 or precip > 1.0
        return {
            "is_rainy": is_rainy,
            "weather_code": weather_code,
            "precipitation_mm": precip,
            "temp_max": temp_max,
            "temp_min": temp_min,
            "description": "下雨（建議安排室內備案路線）" if is_rainy else "天氣良好（適合戶外活動）",
        }
    except Exception as e:
        return {
            "is_rainy": False,
            "weather_code": 0,
            "precipitation_mm": 0.0,
            "temp_max": 25.0,
            "temp_min": 18.0,
            "description": f"天氣資料取得失敗（{e}），預設晴天",
        }


def build_persona_description(preference: UserPreference) -> str:
    """從 UserPreference 組成 persona 描述字串，傳給 LLM。"""
    lines = []
    if preference.display_name:
        lines.append(f"使用者：{preference.display_name}")
    tags = preference.combined_tags()
    lines.append(f"使用者偏好標籤：{', '.join(tags)}")
    if preference.reels:
        lines.append("使用者的社群貼文（反映真實喜好）：")
        for reel in preference.reels:
            text = reel.text_content.strip()
            if text:
                lines.append(f'  - "{text}"')
    return "\n".join(lines)


def preprocess(request_data: dict) -> dict:
    """
    前處理入口：
    - 從 request_data["user_preference"] 重建 UserPreference 物件
    - 提取並過濾台北景點候選清單
    - 取得台北天氣
    - 組裝 persona 描述

    回傳 context dict 供 LlmAgent 使用。
    """
    pref_obj = UserPreference.model_validate(request_data.get("user_preference", {}))
    candidates = extract_candidate_places(request_data.get("top_results", []))
    weather = get_taipei_weather()
    persona = build_persona_description(pref_obj)
    return {
        "candidates": candidates,
        "weather": weather,
        "persona": persona,
        "query": request_data.get("query", ""),
    }
```

- [ ] **Step 2: Verify preprocessor works**

```bash
uv run python -c "
from agent.preprocessor import preprocess
result = preprocess({
    'query': '台北文青',
    'user_preference': {'user_id': 'test', 'selected_tags': ['文青'], 'reels': []},
    'top_results': []
})
print('keys:', list(result.keys()))
print('persona:', result['persona'])
"
```

Expected:
```
keys: ['candidates', 'weather', 'persona', 'query']
persona: 使用者偏好標籤：文青
```

- [ ] **Step 3: Commit**

```bash
git add agent/preprocessor.py
git commit -m "refactor: preprocessor uses UserPreference object, removes user_preference_full dependency"
```

---

## Task 4: Update `agent/search_pipeline.py` — unified output format

**Files:**
- Modify: `agent/search_pipeline.py`

Change the `run()` return value to use `preference.model_dump()` instead of two separate preference dicts.

- [ ] **Step 1: Update imports and return value in `run()`**

In `agent/search_pipeline.py`, find the import at the top:

```python
from .models import Reel, UserPreference
```

This stays the same (Pydantic models have the same interface for method calls).

Find the return statement at the end of `run()` (around line 297) and replace it:

```python
    # ── 組裝輸出（SpotResult 格式） ──────────────────────────────────────────
    return {
        "query": query,
        "user_preference": preference.model_dump(),
        "top_results": top_results,
    }
```

The old return had three keys: `query`, `user_preference` (lean), `user_preference_full` (full). The new return has two keys: `query`, `user_preference` (full via model_dump).

- [ ] **Step 2: Verify pipeline import works**

```bash
uv run python -c "from agent.search_pipeline import run; print('import ok')"
```

Expected: `import ok`

- [ ] **Step 3: Commit**

```bash
git add agent/search_pipeline.py
git commit -m "refactor: search_pipeline returns unified user_preference (drops user_preference_full)"
```

---

## Task 5: Fix bugs in `agent/planner.py`

**Files:**
- Modify: `agent/planner.py`

Three changes:
1. Add `import re` at top
2. Fix `_parse_agent_response` to pass `waypoints` directly to `build_google_maps_url` (preserves `location`)
3. Add JSON fallback in `_parse_agent_response`

- [ ] **Step 1: Add `import re` at top of `agent/planner.py`**

The file currently starts with:
```python
import json

from google.adk.agents import Agent
```

Change to:
```python
import json
import re

from google.adk.agents import Agent
```

- [ ] **Step 2: Fix `_parse_agent_response` — location passthrough + JSON fallback**

Find `_parse_agent_response` (starts around line 165). Replace the entire function:

```python
def _parse_agent_response(response: str) -> dict:
    """從 Agent 回應中提取 JSON，並重新產生 Google Maps URL。"""
    from .tools import build_google_maps_url

    response = response.strip()

    # 嘗試提取 markdown code block 中的 JSON
    if "```json" in response:
        start = response.index("```json") + 7
        end = response.index("```", start)
        response = response[start:end].strip()
    elif "```" in response:
        start = response.index("```") + 3
        end = response.index("```", start)
        response = response[start:end].strip()

    # JSON 解析，失敗時嘗試從回應中找出 JSON 物件
    try:
        data = json.loads(response)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", response, re.DOTALL)
        if match:
            data = json.loads(match.group())
        else:
            raise ValueError(
                f"Agent 回應不含有效 JSON。前 300 字：{response[:300]}"
            )

    # 用 waypoints 的 location 座標重新產生 Google Maps URL（保留精確座標）
    for route in data.get("recommended_routes", []):
        waypoints = route.get("waypoints", [])
        route["google_maps_url"] = build_google_maps_url(waypoints)

    return data
```

- [ ] **Step 3: Verify planner import works**

```bash
uv run python -c "from agent.planner import run_planner, create_planner_agent; print('import ok')"
```

Expected: `import ok`

- [ ] **Step 4: Commit**

```bash
git add agent/planner.py
git commit -m "fix: planner preserves waypoint location for Maps URL; add JSON fallback in response parser"
```

---

## Task 6: Rewrite `main.py` — new `/search`, remove `/search-and-plan`, fix asyncio

**Files:**
- Modify: `main.py`

- [ ] **Step 1: Replace `main.py`**

Replace entire file content:

```python
"""
main.py — YTP Planning Agent FastAPI 服務入口

Endpoints:
  GET  /health   — 健康檢查（不需 API key）
  POST /search   — 關鍵字搜尋景點，回傳 SpotResult
  POST /plan     — 接收 SpotResult → 3 條路線
  POST /enrich   — 接收路線 JSON → 評論 + 照片 + 字幕
"""

import asyncio
import secrets
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Security
from fastapi.security.api_key import APIKeyHeader
from pydantic import BaseModel

load_dotenv()

import config
from agent.enricher import enrich_routes
from agent.models import UserPreference, load_user
from agent.planner import run_planner
from agent.preprocessor import preprocess
from agent.search_pipeline import run as run_search
from schemas import PlanResponse, SpotResult

api_key_header = APIKeyHeader(name="X-API-Key")


def verify_api_key(key: str = Security(api_key_header)) -> None:
    if not config.YTP_API_KEY:
        raise HTTPException(
            status_code=500, detail="YTP_API_KEY not configured on server"
        )
    if not secrets.compare_digest(key, config.YTP_API_KEY):
        raise HTTPException(status_code=403, detail="Invalid API key")


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="YTP Planning Agent",
    description="台北一日遊規劃 Agent API — 從關鍵字搜尋到路線一站完成",
    version="0.4.0",
    lifespan=lifespan,
)


# ── Request / Response schemas ──────────────────────────────────────────────────


class SearchRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    tags: Optional[list[str]] = None


class EnrichRequest(BaseModel):
    recommended_routes: list


class EnrichResponse(BaseModel):
    run_id: str
    output_dir: str
    routes: dict


# ── Endpoints ───────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/search", response_model=SpotResult, dependencies=[Security(verify_api_key)])
async def search(request: SearchRequest):
    """
    用關鍵字搜尋台北景點（Gemini + Google Search Grounding）。
    回傳 SpotResult 格式，可直接傳給 POST /plan。
    """
    try:
        preference = UserPreference()
        preference_path = None

        if request.user_id:
            preference, preference_path = load_user(request.user_id, config.USERS_DIR)

        if request.tags:
            merged = list(dict.fromkeys(preference.selected_tags + request.tags))
            preference = preference.model_copy(update={"selected_tags": merged})

        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: run_search(
                query=request.query,
                preference=preference,
                preference_path=preference_path,
            ),
        )
        return SpotResult.model_validate(result)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/plan", response_model=PlanResponse, dependencies=[Security(verify_api_key)])
async def plan(request: SpotResult):
    """
    接收 SpotResult（/search 的輸出），回傳 3 條優化路線。
    適合已有搜尋結果、只需要規劃的情境。
    """
    try:
        context = preprocess(request.model_dump())
        result = await run_planner(context)
        return PlanResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post(
    "/enrich", response_model=EnrichResponse, dependencies=[Security(verify_api_key)]
)
async def enrich(request: EnrichRequest):
    """
    對規劃完成的 3 條路線，針對每個景點：
      1. 抓取最新 5 則 + 最熱門 5 則 Google 評論
      2. 下載最多 10 張 Google Maps 照片至本地
      3. 用 Gemini 生成 2-3 段短影片字幕

    結果儲存至 data/routes/{run_id}/，並回傳摘要。
    """
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None,
            lambda: enrich_routes(request.recommended_routes),
        )
        return EnrichResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

- [ ] **Step 2: Verify app loads without error**

```bash
uv run python -c "from main import app; print('routes:', [r.path for r in app.routes])"
```

Expected output (order may vary):
```
routes: ['/openapi.json', '/docs', '/docs/oauth2-redirect', '/redoc', '/health', '/search', '/plan', '/enrich']
```

Confirm `/search-and-plan` is gone and `/search` is present.

- [ ] **Step 3: Commit**

```bash
git add main.py
git commit -m "feat: add POST /search, remove /search-and-plan, fix asyncio.get_running_loop()"
```

---

## Task 7: Update `spot_result_v1.json` — match new SpotResult schema

**Files:**
- Modify: `spot_result_v1.json`

The old file has `user_preference` with `combined_tags` (derived, no longer accepted) and no `reels` field. Update to match `SpotResult.user_preference: UserPreference`.

- [ ] **Step 1: Update `spot_result_v1.json`**

Find the `user_preference` block (lines 3-16) and replace:

```json
"user_preference": {
    "user_id": "alice",
    "selected_tags": [
        "文青",
        "預算中等",
        "咖啡廳",
        "安靜",
        "花園",
        "玫瑰",
        "療癒系",
        "貓咪友善",
        "閱讀空間"
    ],
    "combined_tags": ["文青", "預算中等", "咖啡廳", "安靜", "花園", "玫瑰"]
},
```

Replace with:

```json
"user_preference": {
    "user_id": "alice",
    "display_name": "Alice Chen",
    "selected_tags": [
        "文青",
        "預算中等",
        "咖啡廳",
        "安靜",
        "花園",
        "玫瑰",
        "療癒系",
        "貓咪友善",
        "閱讀空間"
    ],
    "reels": []
},
```

- [ ] **Step 2: Verify the file parses as SpotResult**

```bash
uv run python -c "
import json
from schemas import SpotResult
with open('spot_result_v1.json', encoding='utf-8') as f:
    data = json.load(f)
sr = SpotResult.model_validate(data)
print('query:', sr.query)
print('user_id:', sr.user_preference.user_id)
print('combined_tags:', sr.user_preference.combined_tags()[:3])
print('top_results count:', len(sr.top_results))
"
```

Expected:
```
query: 台北美術文青
user_id: alice
combined_tags: ['文青', '預算中等', '咖啡廳']
top_results count: <some number>
```

- [ ] **Step 3: Commit**

```bash
git add spot_result_v1.json
git commit -m "chore: update spot_result_v1.json to match new SpotResult schema"
```

---

## Task 8: Update `test_local.py` — fix modes, add `--mode smoke`

**Files:**
- Modify: `test_local.py`

Changes:
1. `run_search_and_plan` → `run_search` (calls `POST /search`, not `/search-and-plan`)
2. `run_plan` now sends the full SpotResult JSON (same as before, but fixture is now valid)
3. Add `run_smoke` function
4. Update `main()` arg parser to include `smoke` mode

- [ ] **Step 1: Replace `run_search_and_plan` with `run_search`**

Find and replace the entire `run_search_and_plan` function (lines 149-170):

```python
# ═══════════════════════════════════════════════════════════════════════════════
#  Mode: search（POST /search）
# ═══════════════════════════════════════════════════════════════════════════════


def run_search(query: str, user_id: str | None, open_browser: bool) -> None:
    payload: dict = {"query": query}
    if user_id:
        payload["user_id"] = user_id

    print(f"📡 POST /search")
    print(f"   query={query!r}  user={user_id or '(無)'}")
    print("   （搜尋需要 30~60 秒，請稍候...）")

    vprint(f"\n   Payload: {json.dumps(payload, ensure_ascii=False)}")

    r = httpx.post(f"{BASE_URL}/search", json=payload, headers=HEADERS, timeout=180)
    if r.status_code != 200:
        _handle_response_error(r)

    result = r.json()
    top = result.get("top_results", [])
    print(f"\n📋 搜尋結果（{len(top)} 筆）：")
    for item in top[:3]:
        places = [p["name"] for p in item.get("extracted_places", [])]
        print(f"  [{item.get('rank')}] {item.get('title', '')} — 景點：{places}")
    if len(top) > 3:
        print(f"  ... 以及 {len(top) - 3} 筆")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n💾 SpotResult 存至 {OUTPUT_JSON}（可接著跑 --mode plan）")
```

- [ ] **Step 2: Add `run_smoke` function**

Add the following function after `run_enrich` (before the CLI section comment):

```python
# ═══════════════════════════════════════════════════════════════════════════════
#  Mode: smoke（health → search → plan → enrich，含回應驗證）
# ═══════════════════════════════════════════════════════════════════════════════


def run_smoke(query: str, user_id: str | None, open_browser: bool) -> None:
    """
    對所有 API endpoint 依序測試，每步驗證回應結構。
    health → search → plan → enrich
    """
    failed = False

    def check(condition: bool, msg: str) -> None:
        nonlocal failed
        if not condition:
            print(f"   ❌ FAIL: {msg}")
            failed = True
        else:
            vprint(f"   ✓ {msg}")

    # ── 1. health ─────────────────────────────────────────────────────────────
    print("🔍 [1/4] GET /health ...")
    r = httpx.get(f"{BASE_URL}/health", timeout=5)
    check(r.status_code == 200, f"status_code == 200 (got {r.status_code})")
    check(r.json() == {"status": "ok"}, "body == {status: ok}")
    print("   ✅ health OK")

    if failed:
        print("\n❌ Smoke test 中止")
        return

    # ── 2. search ─────────────────────────────────────────────────────────────
    print(f"\n🔍 [2/4] POST /search (query={query!r}) ...")
    payload: dict = {"query": query}
    if user_id:
        payload["user_id"] = user_id
    r = httpx.post(f"{BASE_URL}/search", json=payload, headers=HEADERS, timeout=180)
    if r.status_code != 200:
        _handle_response_error(r)
    spot_result = r.json()
    check("top_results" in spot_result, "response has top_results")
    check("user_preference" in spot_result, "response has user_preference")
    check(isinstance(spot_result.get("top_results"), list), "top_results is list")
    top_count = len(spot_result.get("top_results", []))
    check(top_count > 0, f"top_results not empty (got {top_count})")
    print(f"   ✅ search OK — {top_count} 筆結果")

    if failed:
        print("\n❌ Smoke test 中止（search 回應不符預期）")
        return

    # ── 3. plan ───────────────────────────────────────────────────────────────
    print("\n🤖 [3/4] POST /plan ...")
    print("   （需要 30~90 秒，LLM 規劃中...）")
    r = httpx.post(f"{BASE_URL}/plan", json=spot_result, headers=HEADERS, timeout=300)
    if r.status_code != 200:
        _handle_response_error(r)
    plan_result = r.json()
    routes = plan_result.get("recommended_routes", [])
    check("recommended_routes" in plan_result, "response has recommended_routes")
    check(isinstance(routes, list), "recommended_routes is list")
    check(len(routes) > 0, f"recommended_routes not empty (got {len(routes)})")
    for route in routes:
        check("waypoints" in route, f"route {route.get('route_id')} has waypoints")
        check("tsp_evaluation" in route, f"route {route.get('route_id')} has tsp_evaluation")
    print(f"   ✅ plan OK — {len(routes)} 條路線")
    _print_route_summary(routes)
    _save_and_visualize(plan_result, open_browser)

    if failed:
        print("\n❌ Smoke test 中止（plan 回應不符預期）")
        return

    # ── 4. enrich ─────────────────────────────────────────────────────────────
    print("\n📸 [4/4] POST /enrich ...")
    total_places = sum(len(r.get("waypoints", [])) for r in routes)
    print(f"   路線數：{len(routes)}  景點總數：{total_places}")
    print("   （每個景點抓取評論 + 照片 + 字幕，預計 1~3 分鐘...）")
    r = httpx.post(
        f"{BASE_URL}/enrich",
        json={"recommended_routes": routes},
        headers=HEADERS,
        timeout=600,
    )
    if r.status_code != 200:
        _handle_response_error(r)
    enrich_result = r.json()
    check("run_id" in enrich_result, "response has run_id")
    check("output_dir" in enrich_result, "response has output_dir")
    check("routes" in enrich_result, "response has routes")
    run_id = enrich_result.get("run_id", "?")
    print(f"   ✅ enrich OK — run_id={run_id}")

    # ── Summary ───────────────────────────────────────────────────────────────
    print()
    if failed:
        print("❌ Smoke test 完成，但有驗證失敗項目（見上方 ❌ FAIL）")
    else:
        print("✅ Smoke test 完成！所有 4 個 API 正常。")
```

- [ ] **Step 3: Update `main()` — fix mode choices and function calls**

Find the `parser.add_argument("--mode", ...)` block and update:

```python
    parser.add_argument(
        "--mode",
        choices=["plan", "search", "direct", "enrich", "smoke"],
        default="plan",
        help="執行模式（預設：plan）",
    )
```

Find the mode dispatch at the bottom of `main()` and update:

```python
    if args.mode == "plan":
        run_plan(open_browser=open_browser)
    elif args.mode == "search":
        run_search(
            query=args.query,
            user_id=args.user or None,
            open_browser=open_browser,
        )
    elif args.mode == "enrich":
        run_enrich(open_browser=open_browser)
    elif args.mode == "smoke":
        run_smoke(
            query=args.query,
            user_id=args.user or None,
            open_browser=open_browser,
        )
```

Also update the API key check — `direct` mode still skips it, all others need it:

```python
    if args.mode != "direct" and not API_KEY:
        print("⚠️  YTP_API_KEY 未設定，請在 .env 中設定：YTP_API_KEY=...")
        sys.exit(1)
```

(This line is unchanged — just confirming it covers `smoke` mode too.)

- [ ] **Step 4: Update the docstring at the top of `test_local.py`**

Replace the existing docstring:

```python
"""
本地測試腳本 — 呼叫 API 並自動視覺化路線

用法：
  # 搜尋景點（POST /search，需要 server）
  uv run python test_local.py --mode search --query "台北美術文青" --user alice

  # 用搜尋結果規劃路線（POST /plan，需要 server）
  uv run python test_local.py --mode plan

  # 完整 smoke test：health → search → plan → enrich
  uv run python test_local.py --mode smoke --query "台北美術文青" --user alice

  # 對上次的路線結果執行 enrichment（POST /enrich，需要 server）
  uv run python test_local.py --mode enrich

  # 直接跑 pipeline（不需要 server，適合 debug）
  uv run python test_local.py --mode direct --query "台北美術文青" --user alice

  # 不開瀏覽器，只存檔
  uv run python test_local.py --mode smoke --no-open

  # 顯示完整 API 回應與錯誤
  uv run python test_local.py --mode search --verbose
"""
```

- [ ] **Step 5: Verify test_local.py syntax**

```bash
uv run python -c "import test_local; print('syntax ok')"
```

Expected: `syntax ok`

- [ ] **Step 6: Commit**

```bash
git add test_local.py
git commit -m "feat: update test_local.py — add smoke mode, update search to POST /search"
```

---

## Task 9: Smoke Test Run

**Prerequisites:** Server must be running.

- [ ] **Step 1: Start the server in a separate terminal**

```bash
uv run uvicorn main:app --reload
```

Wait for: `Application startup complete.`

- [ ] **Step 2: Run health check first**

```bash
uv run python test_local.py --mode plan --no-open
```

This uses `spot_result_v1.json` (already updated) and calls `/plan`. Confirms the plan endpoint works before running the full smoke test.

Expected: prints 3 routes, saves `last_result.json` and `routes_map.html`.

- [ ] **Step 3: Run full smoke test**

```bash
uv run python test_local.py --mode smoke --query "台北美術文青" --user alice --no-open --verbose
```

Expected final line: `✅ Smoke test 完成！所有 4 個 API 正常。`

If any step fails, `--verbose` will show the full API response.

- [ ] **Step 4: Final commit (if any last fixes needed)**

```bash
git add -p   # stage only what changed
git commit -m "fix: <describe any last-minute fix>"
```
