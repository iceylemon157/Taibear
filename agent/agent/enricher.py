"""
agent/enricher.py — 景點評論、照片抓取與短影片字幕生成

針對規劃 Agent 產出的 3 條路線，對每個景點執行：
  1. 抓取最新 5 則 + 最熱門 5 則 Google 評論
  2. 下載最多 10 張 Google Maps 照片至本地
  3. 用 Gemini 2.5 Flash 生成 2-3 段短影片字幕（每段 < 20 中文字，含 emoji）

輸出結構：
  data/routes/{run_id}/
  ├── enrichment.json          ← 所有路線評論 + 字幕彙整
  ├── route_A/
  │   ├── 華山1914文創園區/
  │   │   ├── photo_01.jpg
  │   │   └── ...
  │   └── 里Ura/
  │       └── ...
  ├── route_B/
  └── route_C/
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import datetime
from pathlib import Path

import httpx

import config

PLACES_BASE = "https://maps.googleapis.com/maps/api/place"
PHOTO_BASE = "https://maps.googleapis.com/maps/api/place/photo"


# ═══════════════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _safe_folder_name(name: str) -> str:
    """將景點名稱轉為合法的資料夾名稱，保留中文，移除路徑危險字元。"""
    name = unicodedata.normalize("NFC", name)
    name = re.sub(r'[\\/*?:"<>|\n\r\t]', "_", name)
    name = name.strip().strip(".")
    return name or "unknown_place"


def _format_reviews_for_prompt(reviews: list[dict]) -> str:
    """將評論清單格式化為 prompt 用的文字區塊。"""
    if not reviews:
        return "（暫無評論）"
    lines = []
    for r in reviews:
        stars = "★" * r["rating"] + "☆" * (5 - r["rating"])
        text = r["text"][:300].strip() if r["text"] else "（無文字內容）"
        time_desc = f" [{r['time']}]" if r.get("time") else ""
        lines.append(f"{stars}{time_desc}\n{text}")
    return "\n\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
#  Google Places API — Reviews
# ═══════════════════════════════════════════════════════════════════════════════


def _fetch_reviews(place_id: str, sort: str = "most_relevant") -> list[dict]:
    """
    呼叫 Places Details API 取得最多 5 則評論。

    Args:
        place_id: Google Places place_id
        sort: "newest" 或 "most_relevant"

    Returns:
        評論清單，每筆含 author, rating, text, time。
    """
    url = f"{PLACES_BASE}/details/json"
    params = {
        "place_id": place_id,
        "fields": "reviews",
        "reviews_sort": sort,
        "language": "zh-TW",
        "key": config.GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        raw_reviews = data.get("result", {}).get("reviews", [])
        return [
            {
                "author": r.get("author_name", ""),
                "rating": int(r.get("rating", 0)),
                "text": r.get("text", "").strip(),
                "time": r.get("relative_time_description", ""),
            }
            for r in raw_reviews
        ]
    except Exception as e:
        print(f"[Enrich]   ⚠ 評論抓取失敗 ({sort}): {e}")
        return []


# ═══════════════════════════════════════════════════════════════════════════════
#  Google Places API — Photos
# ═══════════════════════════════════════════════════════════════════════════════


def _fetch_photo_references(place_id: str, max_photos: int = 10) -> list[str]:
    """
    取得景點的照片 reference 清單（最多 max_photos 筆）。
    同時搭第 1 次評論 API 呼叫，節省一次請求。
    """
    url = f"{PLACES_BASE}/details/json"
    params = {
        "place_id": place_id,
        "fields": "photos",
        "key": config.GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        photos = data.get("result", {}).get("photos", [])[:max_photos]
        return [p["photo_reference"] for p in photos if p.get("photo_reference")]
    except Exception as e:
        print(f"[Enrich]   ⚠ 照片 reference 取得失敗: {e}")
        return []


def _download_photo(photo_ref: str, save_path: Path, max_width: int = 1200) -> bool:
    """
    下載單張照片並儲存至 save_path。
    Google Places Photo endpoint 會先 302 再回圖片，需要 follow_redirects=True。
    """
    params = {
        "maxwidth": max_width,
        "photo_reference": photo_ref,
        "key": config.GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(PHOTO_BASE, params=params, timeout=20, follow_redirects=True)
        resp.raise_for_status()
        save_path.write_bytes(resp.content)
        return True
    except Exception as e:
        print(f"[Enrich]   ⚠ 照片下載失敗 ({save_path.name}): {e}")
        return False


def _generate_captions(
    place_name: str,
    newest: list[dict],
    relevant: list[dict],
) -> list[str]:
    """
    根據評論內容生成 2-3 段簡短字幕（不使用 LLM）。

    Returns:
        字幕清單，每段 < 20 中文字並含 emoji。
    """
    review_text = "\n".join(
        [r.get("text", "") for r in (newest + relevant) if r.get("text")]
    ).lower()

    captions: list[str] = [f"✨ {place_name}"]

    if any(word in review_text for word in ["夜景", "夕陽", "風景", "view", "景色"]):
        captions.append("🌇 景色真的很加分")
    elif any(word in review_text for word in ["美食", "好吃", "餐", "小吃", "飲料"]):
        captions.append("🍜 吃喝體驗很可以")
    elif any(word in review_text for word in ["拍照", "打卡", "照片", "攝影"]):
        captions.append("📸 拍照打卡很適合")
    elif any(word in review_text for word in ["交通", "捷運", "公車", "方便", "停車"]):
        captions.append("🚇 交通算是方便")
    else:
        captions.append("📍 值得安排停留")

    if any(word in review_text for word in ["人潮", "排隊", "假日", "熱門"]):
        captions.append("🕒 假日人多建議提早")
    else:
        captions.append("🧭 半天行程剛剛好")

    return captions[:3]


# ═══════════════════════════════════════════════════════════════════════════════
#  Per-place enrichment
# ═══════════════════════════════════════════════════════════════════════════════


def enrich_place(
    place_name: str,
    place_id: str,
    output_dir: Path,
) -> dict:
    """
    對單一景點執行完整 enrichment：
      - 抓取評論（最新 5 + 最熱門 5）
      - 下載照片（最多 10 張）
      - 生成字幕（2-3 段）

    Args:
        place_name: 景點名稱（顯示用）
        place_id:   Google Places place_id
        output_dir: 路線資料夾路徑，照片存在其子目錄內

    Returns:
        enrichment 資料 dict（不含二進位圖片）
    """
    safe_name = _safe_folder_name(place_name)
    place_dir = output_dir / safe_name
    place_dir.mkdir(parents=True, exist_ok=True)

    print(f"[Enrich] 📍 {place_name}")

    # ── 評論 ──────────────────────────────────────────────────────────────────
    newest = _fetch_reviews(place_id, sort="newest")
    relevant = _fetch_reviews(place_id, sort="most_relevant")
    print(f"[Enrich]   評論：最新 {len(newest)} 則，最熱門 {len(relevant)} 則")

    # ── 照片 ──────────────────────────────────────────────────────────────────
    photo_refs = _fetch_photo_references(place_id, max_photos=10)
    downloaded: list[str] = []
    for i, ref in enumerate(photo_refs, start=1):
        filename = f"photo_{i:02d}.jpg"
        if _download_photo(ref, place_dir / filename):
            downloaded.append(filename)
    print(f"[Enrich]   照片：{len(downloaded)}/{len(photo_refs)} 張下載成功")

    # ── 字幕 ──────────────────────────────────────────────────────────────────
    captions = _generate_captions(place_name, newest, relevant)
    print(f"[Enrich]   字幕：{captions}")

    return {
        "place_name": place_name,
        "place_id": place_id,
        "folder": safe_name,
        "reviews": {
            "newest": newest,
            "most_relevant": relevant,
        },
        "captions": captions,
        "photos": downloaded,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  Main entry point
# ═══════════════════════════════════════════════════════════════════════════════


def enrich_routes(
    routes: list[dict],
    base_output_dir: str | Path | None = None,
    max_places_per_route: int | None = None,
) -> dict:
    """
    對 3 條路線的所有景點執行 enrichment，儲存照片與評論摘要至本地。

    Args:
        routes:          planner 輸出的 recommended_routes 清單
        base_output_dir: 儲存根目錄，預設為 data/routes/

    Returns:
        {
          "run_id": "20240115_143022",
          "output_dir": "data/routes/20240115_143022",
          "routes": {
            "route_A": {
              "route_id": ...,
              "route_name": ...,
              "places": [ { place_name, captions, reviews, photos }, ... ]
            },
            ...
          }
        }
    """
    if base_output_dir is None:
        base_output_dir = config.ROUTES_DIR

    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_dir = Path(base_output_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    print("\n[Enrich] ════════════════════════════════════════")
    print(f"[Enrich] Run ID : {run_id}")
    print(f"[Enrich] 輸出路徑: {run_dir}")
    print(f"[Enrich] 路線數量: {len(routes)} 條")
    print("[Enrich] ════════════════════════════════════════")

    enriched_routes: dict[str, dict] = {}

    for route in routes:
        route_id = route.get("route_id", "unknown")
        route_name = route.get("route_name", "")
        waypoints = route.get("waypoints", [])

        print(f"\n[Enrich] ── {route_id}：{route_name} ──")

        route_dir = run_dir / route_id
        route_dir.mkdir(exist_ok=True)

        enriched_places: list[dict] = []

        limited_waypoints = (
            waypoints[:max_places_per_route]
            if max_places_per_route and max_places_per_route > 0
            else waypoints
        )

        for wp in limited_waypoints:
            place_name = wp.get("name", "").strip()
            place_id = wp.get("place_id", "").strip()

            if not place_name:
                continue

            if not place_id:
                print(f"[Enrich] ⚠ 跳過 {place_name}：缺少 place_id")
                enriched_places.append(
                    {
                        "place_name": place_name,
                        "place_id": "",
                        "folder": _safe_folder_name(place_name),
                        "reviews": {"newest": [], "most_relevant": []},
                        "captions": [f"✨ {place_name}", "📍 值得一訪的好地方"],
                        "photos": [],
                    }
                )
                continue

            place_data = enrich_place(place_name, place_id, route_dir)
            enriched_places.append(place_data)

        enriched_routes[route_id] = {
            "route_id": route_id,
            "route_name": route_name,
            "places": enriched_places,
        }

    # ── 儲存彙整 JSON ─────────────────────────────────────────────────────────
    result = {
        "run_id": run_id,
        "output_dir": str(run_dir),
        "routes": enriched_routes,
    }

    summary_path = run_dir / "enrichment.json"
    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    total_places = sum(len(r["places"]) for r in enriched_routes.values())
    total_photos = sum(
        len(p["photos"]) for r in enriched_routes.values() for p in r["places"]
    )
    print(f"\n[Enrich] ✅ 完成！景點 {total_places} 個，照片 {total_photos} 張")
    print(f"[Enrich] 📄 彙整報告：{summary_path}")

    return result
