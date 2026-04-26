import json
import re

from google.adk.agents import Agent

import config
from .gemini_client import is_quota_error
from .tools import evaluate_route, geocode_places, search_places

SYSTEM_PROMPT = """你是一位台北一日遊規劃專家。你會根據使用者偏好與候選景點清單，規劃出 3 條風格不同的一日遊路線。

## 你的工作流程（必須依序完成）

### Step 1：景點座標化
- 呼叫 `geocode_places`，傳入候選景點清單中的所有景點名稱。
- 取得每個景點的 place_id、座標（lat/lng）與營業時間。

### Step 2：缺口補足（擴充景點）
- 根據使用者偏好標籤，判斷候選清單中是否缺少特定類型的景點。
- 若使用者偏好含「玫瑰」「花園」，且候選清單中沒有玫瑰園，必須呼叫 `search_places("台北 玫瑰園")`。
- 若使用者偏好含「bar」「酒吧」「微醺」，且候選清單中沒有酒吧，必須呼叫 `search_places("台北 文青 酒吧")`。
- 其他偏好標籤也以同樣邏輯判斷是否需要補充搜尋。
- 將搜尋結果中最合適的景點加入候選池。

### Step 3：規劃 3 條路線
根據以下主題各選 3~4 個景點（不要重複使用同一個景點在不同路線）：

**路線 A：完美命中型**
- 完全符合使用者願望清單（所有偏好標籤都要命中）
- 結合候選清單中的景點 + Step 2 找到的補充景點

**路線 B：老城慢活型**
- 以大稻埕、迪化街等台北老城區為主軸
- 主打復古文青風格

**路線 C：雨天/室內備案型**
- 根據天氣資訊決定是否主推此路線
- 以室內或半室內景點為主

每條路線選好景點後，**必須呼叫 `evaluate_route`** 來取得最佳順序。

### Step 4：輸出 JSON
輸出嚴格符合以下格式的 JSON，不要加任何其他文字：

```json
{
  "recommended_routes": [
    {
      "route_id": "route_A",
      "route_name": "路線的詩意名稱",
      "theme": "路線主題一句話描述",
      "tsp_evaluation": {
        "total_transit_time_mins": 數字,
        "smoothness_score": 0~1的小數
      },
      "google_maps_url": "https://www.google.com/maps/dir/...",
      "waypoints": [
        {
          "step_order": 1,
          "name": "景點名稱",
          "place_id": "ChIJ...",
          "location": {"lat": 25.0, "lng": 121.5},
          "suggested_time": "08:30 - 11:30",
          "reasoning": "為何選這個景點（結合使用者偏好說明）"
        }
      ]
    }
  ]
}
```

## 重要原則
- slow paced：每條路線只排 3~4 個地點，不要塞太多
- 早起優先：第一個景點安排早上開放的地點（08:00-10:00 可到）
- 營業時間驗證：確認景點的時段順序符合各自的營業時間
- 路線 C 的安排要根據天氣狀況調整——若今天下雨，路線 C 應全室內；若天氣好，可以是備案參考路線
"""


def create_planner_agent(model: str = "gemini-2.5-flash") -> Agent:
    """建立台北一日遊規劃 Agent。"""
    return Agent(
        name="taipei_day_planner",
        model=model,
        instruction=SYSTEM_PROMPT,
        tools=[geocode_places, search_places, evaluate_route],
    )


async def _run_planner_with_model(context: dict, model: str) -> dict:
    """使用指定模型執行規劃 Agent。"""
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.genai import types as genai_types

    agent = create_planner_agent(model)

    # 組裝傳給 Agent 的訊息
    user_message = _build_user_message(context)

    session_service = InMemorySessionService()
    await session_service.create_session(
        app_name="ytp_planner",
        user_id="user",
        session_id="session_1",
    )

    runner = Runner(
        agent=agent,
        app_name="ytp_planner",
        session_service=session_service,
    )

    final_response = ""
    async for event in runner.run_async(
        user_id="user",
        session_id="session_1",
        new_message=genai_types.Content(
            role="user",
            parts=[genai_types.Part(text=user_message)],
        ),
    ):
        if event.is_final_response() and event.content and event.content.parts:
            # 合併所有 text parts，過濾 None（function_call part 的 .text 為 None）
            texts = [p.text for p in event.content.parts if getattr(p, "text", None)]
            if texts:
                final_response = "".join(texts)

    return _parse_agent_response(final_response or "")


async def run_planner(context: dict) -> dict:
    """
    執行規劃 Agent，回傳解析後的路線 JSON。
    自動透過 config.MODELS["planner"] 清單進行模型降級。

    Args:
        context: 前處理後的 context dict，含 candidates, weather, persona, query

    Returns:
        解析後的路線字典 (recommended_routes)
    """
    models = config.MODELS.get("planner", ["gemini-2.5-flash"])
    last_exc: Exception | None = None
    for model in models:
        try:
            return await _run_planner_with_model(context, model)
        except Exception as e:
            if is_quota_error(e):
                print(f"[Planner] ⚠ {model} → 配額已用盡，嘗試下一個模型")
                last_exc = e
                continue
            raise
    raise RuntimeError(
        f"[Planner] 所有模型均已超出配額: {models}"
    ) from last_exc


def _build_user_message(context: dict) -> str:
    """組裝傳給 Agent 的 prompt。"""
    candidates = context["candidates"]
    weather = context["weather"]
    persona = context["persona"]
    query = context["query"]

    candidate_list = "\n".join(f"  - {p['name']}：{p['context']}" for p in candidates)

    return f"""請根據以下資訊規劃台北一日遊路線。

## 搜尋主題
{query}

## 使用者 Persona
{persona}

## 今日台北天氣
{weather["description"]}（降雨量 {weather["precipitation_mm"]}mm，最高 {weather["temp_max"]}°C）

## 候選景點清單（已過濾為台北地區）
{candidate_list}

請依照工作流程完成規劃，輸出 JSON 格式的 3 條路線。
google_maps_url 欄位填入空字串即可，系統會自動根據 place_id 重新產生正確的 URL。
"""


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
            try:
                data = json.loads(match.group())
            except json.JSONDecodeError:
                raise ValueError(
                    f"Agent 回應不含有效 JSON。前 300 字：{response[:300]}"
                )
        else:
            raise ValueError(
                f"Agent 回應不含有效 JSON。前 300 字：{response[:300]}"
            )

    # 直接傳入 waypoints（含 location 座標），讓 build_google_maps_url 使用精確座標
    for route in data.get("recommended_routes", []):
        waypoints = route.get("waypoints", [])
        route["google_maps_url"] = build_google_maps_url(waypoints)

    return data
