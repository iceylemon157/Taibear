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


def _load_hidden_spot_candidates() -> list[dict]:
    """從 DB 取出所有隱藏景點，格式化為 candidate dict。"""
    try:
        from db.engine import get_session
        from db.hidden_spots import get_all_spots
        SessionLocal = get_session()
        with SessionLocal() as db:
            spots = get_all_spots(db)
        return [
            {
                "name": s.name,
                "context": (
                    f"[隱藏景點] {s.description or ''} "
                    f"地址：{s.address or ''} "
                    f"類型：{s.category or ''} "
                    f"氛圍：{', '.join(s.vibes or [])}"
                ),
            }
            for s in spots
        ]
    except Exception as e:
        print(f"[Preprocessor] ⚠ 隱藏景點注入失敗：{e}")
        return []


def preprocess(request_data: dict) -> dict:
    """
    前處理入口：
    - 從 request_data["user_preference"] 重建 UserPreference 物件
    - 提取並過濾台北景點候選清單
    - 取得台北天氣
    - 組裝 persona 描述

    回傳 context dict 供 LlmAgent 使用。
    """
    pref_raw = request_data.get("user_preference") or {}
    pref_obj = UserPreference.model_validate(pref_raw)
    candidates = extract_candidate_places(request_data.get("top_results", []))
    weather = get_taipei_weather()
    persona = build_persona_description(pref_obj)

    hidden = _load_hidden_spot_candidates()
    existing_names = {c["name"] for c in candidates}
    candidates += [h for h in hidden if h["name"] not in existing_names]

    return {
        "candidates": candidates,
        "weather": weather,
        "persona": persona,
        "query": request_data.get("query", ""),
    }
