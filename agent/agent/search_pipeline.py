"""
agent/search_pipeline.py — 景點搜尋 Pipeline（Gemini Search Grounding 版）

用 Gemini 2.5 Flash + Google Search Grounding 一步取代舊有的四步驟流程：
  舊：DuckDuckGo → embed_filter (sentence-transformers) → 抓 HTML → LLM rank + extract
  新：Gemini + Google Search Grounding → 直接取得結構化景點清單

Pipeline:
  (0) 從 reels 萃取使用者偏好標籤（Gemini，僅首次執行）
  (1) Gemini + Google Search Grounding → 搜尋 + 景點萃取一步完成
  (2) 解析回應，回傳與 preprocessor.preprocess() 相容的 spot_result 格式
"""

from __future__ import annotations

import json
import re
from typing import Optional

from google.genai import types as genai_types

import config

from .gemini_client import call_with_fallback
from .models import Reel, UserPreference

# ═══════════════════════════════════════════════════════════════════════════════
#  Prompts
# ═══════════════════════════════════════════════════════════════════════════════

_REEL_TAG_PROMPT = """\
你是旅遊偏好標籤萃取助手。
根據以下 Reel / 短影片文字內容，萃取最多 3 個簡潔的繁體中文（台灣）偏好標籤，
描述使用者想要的旅遊體驗類型。

規則：
- 上限 3 個標籤
- 必須是繁體中文
- 描述體驗特質（如「文青」「安靜」「療癒系」），禁止包含地名
- 只回傳 JSON 字串陣列，不加任何說明{existing_part}

Reel 內容：
{text_content}

標籤："""

_SEARCH_PROMPT = """\
你是一位台北旅遊規劃助手。請使用 Google Search 搜尋「{query}」相關的台北景點與店家資訊。

使用者偏好標籤：{tags}

【搜尋任務】
1. 找出 {top_k} 個最符合查詢主題、確實位於台北市的具體景點或店家
2. 根據使用者偏好標籤提升相關景點的排名
3. 嚴格排除台北市以外的地點（新北、桃園、台中、台南、高雄等）

【輸出規則】
- extracted_places.name：必須是可在 Google Maps 直接搜尋到的真實店名或景點名
  （禁止填城市名、行政區名、泛稱如「台北咖啡廳」）
- extracted_places.context：2–4 句繁體中文特色介紹，聚焦體驗特質，避免空洞稱讚詞
- relevance_score：根據查詢主題 + 使用者偏好的相符程度（0.0–1.0）
- tags：3–5 個繁體中文標籤
- 只回傳合法 JSON，不加任何 markdown fence 或說明文字

【輸出格式】
{{
  "top_results": [
    {{
      "rank": 1,
      "title": "搜尋來源網頁標題",
      "url": "來源網址（若無則填空字串）",
      "relevance_score": 0.95,
      "summary": "2–3 句摘要",
      "extracted_places": [
        {{"name": "真實景點或店家名稱", "context": "2–4 句特色介紹"}}
      ],
      "tags": ["標籤1", "標籤2", "標籤3"]
    }}
  ]
}}

查詢：{query}
"""


# ═══════════════════════════════════════════════════════════════════════════════
#  Step 0 — Reel Tag Extraction
# ═══════════════════════════════════════════════════════════════════════════════


def _extract_reel_tags(
    reel: Reel,
    existing_tags: list[str],
) -> None:
    """
    用 Gemini 從 Reel 文字內容萃取偏好標籤，結果直接寫入 reel.auto_tags。
    existing_tags 用來避免生成重複或語意相同的標籤。
    """
    if not reel.text_content.strip():
        return

    existing_part = ""
    if existing_tags:
        existing_part = (
            "\n\n已有的偏好標籤（請避免生成語意相同或高度相似的標籤）：\n"
            + "\n".join(f"- {t}" for t in existing_tags)
        )

    prompt = _REEL_TAG_PROMPT.format(
        existing_part=existing_part,
        text_content=reel.text_content,
    )

    raw = ""
    cleaned = ""
    try:
        raw = (
            call_with_fallback(
                "tag",
                lambda client, model: client.models.generate_content(
                    model=model,
                    contents=prompt,
                ).text or "",
            )
        )
        cleaned = re.sub(
            r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.MULTILINE
        ).strip()
        tags = json.loads(cleaned)
        if isinstance(tags, list):
            reel.auto_tags = [str(t) for t in tags]
            return
    except (json.JSONDecodeError, ValueError):
        pass
    except Exception as e:
        print(f"[Search] ⚠ Reel tag 萃取失敗：{e}")
        return

    # Fallback：嘗試用逗號/換行分割
    if cleaned:
        reel.auto_tags = [
            t.strip() for t in re.split(r"[,，、\n]", cleaned) if t.strip()
        ]


# ═══════════════════════════════════════════════════════════════════════════════
#  Step 1 — Gemini Search Grounding
# ═══════════════════════════════════════════════════════════════════════════════


def _search_with_grounding(
    query: str,
    preference: UserPreference,
) -> list[dict]:
    """
    呼叫 Gemini 2.5 Flash + Google Search Grounding，一步完成：
      - 網路搜尋（取代 DuckDuckGo）
      - 相關性過濾（取代 sentence-transformers embed_filter）
      - 景點萃取與結構化（取代 LLM rank + extract）

    Returns:
        top_results 清單，每筆含 rank, title, url, relevance_score,
        summary, extracted_places, tags。
    """
    all_tags = preference.combined_tags()
    tags_str = "、".join(all_tags) if all_tags else "無特定偏好"

    prompt = _SEARCH_PROMPT.format(
        query=query,
        tags=tags_str,
        top_k=config.SEARCH_PLACES_TOP_K,
    )

    print(f"[Search] Gemini Search Grounding：{query!r}（偏好：{tags_str}）")

    try:
        raw_text = call_with_fallback(
            "search",
            lambda client, model: (
                client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=genai_types.GenerateContentConfig(
                        tools=[genai_types.Tool(google_search=genai_types.GoogleSearch())],
                    ),
                ).text
                or ""
            ),
        )
    except Exception as e:
        print(f"[Search] ⚠ Gemini Search Grounding 失敗：{e}")
        return []

    return _parse_top_results(raw_text)


def _parse_top_results(raw_text: str) -> list[dict]:
    """
    從 Gemini 回應文字中解析 top_results 清單。
    處理可能夾雜的 markdown fence 或多餘文字。
    """
    text = raw_text.strip()

    # 1. 去除 markdown fence
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()

    # 2. 嘗試直接解析整份 JSON
    try:
        data = json.loads(text)
        results = data.get("top_results", [])
        if isinstance(results, list):
            return results
    except json.JSONDecodeError:
        pass

    # 3. 嘗試從文字中找出第一個包含 top_results 的 JSON 物件
    match = re.search(r'\{[^{}]*"top_results".*\}', text, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group())
            results = data.get("top_results", [])
            if isinstance(results, list):
                return results
        except json.JSONDecodeError:
            pass

    print(f"[Search] ⚠ 無法解析 Gemini 回應，原始內容（前 300 字）：\n{text[:300]}")
    return []


# ═══════════════════════════════════════════════════════════════════════════════
#  Main Pipeline Entry Point
# ═══════════════════════════════════════════════════════════════════════════════


def run(
    query: str,
    preference: Optional[UserPreference] = None,
    preference_path: Optional[str] = None,
    **_kwargs,  # 吸收舊版 API 的 smart_search、provider 等參數，維持向後相容
) -> dict:
    """
    執行完整景點搜尋 Pipeline，回傳與 preprocessor.preprocess() 相容的 spot_result dict。

    Args:
        query:           搜尋查詢字串（例如「台北美術文青」）
        preference:      使用者偏好；若為 None 則使用空偏好
        preference_path: 提供時，Reel tag 萃取結果會寫回此路徑（避免下次重複呼叫 LLM）
        **_kwargs:       忽略舊版參數（smart_search, provider 等）

    Returns:
        {
          "query": "...",
          "user_preference": { user_id, display_name, selected_tags, reels },
          "top_results": [ { rank, title, url, relevance_score, summary,
                             extracted_places, tags }, ... ]
        }
    """
    if preference is None:
        preference = UserPreference()

    # ── Step 0：萃取 Reel 偏好標籤（僅處理尚未標記的） ─────────────────────
    untagged = [
        r for r in preference.reels if not r.auto_tags and r.text_content.strip()
    ]
    if untagged:
        print(f"[Search] 從 {len(untagged)} 個 reel 萃取偏好標籤...")
        for reel in untagged:
            # 每次累積目前已有的標籤，避免重複
            accumulated = list(
                dict.fromkeys(
                    preference.selected_tags
                    + [t for r in preference.reels for t in r.auto_tags]
                )
            )
            _extract_reel_tags(reel, accumulated)
            print(f"         {reel.url} → {reel.auto_tags}")

        # 寫回檔案，下次直接使用快取的標籤
        if preference_path:
            preference.save(preference_path)

    # ── Step 1：Gemini + Google Search Grounding ─────────────────────────────
    top_results = _search_with_grounding(query, preference)

    # 重新標記 rank（確保連續且從 1 開始）
    for i, result in enumerate(top_results, start=1):
        result["rank"] = i

    # 統計有效景點數
    valid_count = sum(
        1
        for r in top_results
        if isinstance(r.get("extracted_places"), list) and r["extracted_places"]
    )
    print(f"[Search] 完成：{valid_count}/{len(top_results)} 筆含有效景點資料")

    # ── 組裝輸出（SpotResult 格式） ──────────────────────────────────────────
    return {
        "query": query,
        "user_preference": preference.model_dump(),
        "top_results": top_results,
    }
