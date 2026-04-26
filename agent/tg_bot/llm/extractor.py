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
