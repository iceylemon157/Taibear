"""
hotel_recommender.py — Hotel recommendation logic for /api/recommend-hotels.

Two entry points:
    recommend(location, hashtags, top_n)        — hashtag + distance scoring
    recommend_from_prompt(user_prompt, top_n)   — LLM-driven (Gemini)

Data source: data/hotels/HotelList.json (enriched hotel list with hashtags,
ratings, reviews, and Google Maps URLs).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Optional

from google import genai
from google.genai import types

import config
from gmaps_fetcher import search_by_keyword

HOTEL_DATA_PATH = config.DATA_DIR / "hotels" / "HotelList.json"
TOP_N_DEFAULT   = 5
CANDIDATE_POOL  = 30
EARTH_RADIUS_KM = 6371.0


# ── helpers ────────────────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def _hashtag_match_count(hotel_tags: Optional[str], user_tags: list[str]) -> int:
    if not hotel_tags or not user_tags:
        return 0
    hotel_set = {t for t in hotel_tags.split() if t.startswith("#")}
    user_set   = {t if t.startswith("#") else f"#{t}" for t in user_tags}
    return len(hotel_set & user_set)


def _geocode(location: str) -> Optional[tuple[float, float]]:
    """Resolve a free-text location (landmark, MRT station, address) to (lat, lng)."""
    results = search_by_keyword(location, top_k=1)
    if not results:
        return None
    r = results[0]
    if r.get("lat") is None or r.get("lng") is None:
        return None
    return r["lat"], r["lng"]


def _load_hotels() -> list[dict]:
    with open(HOTEL_DATA_PATH, encoding="utf-8") as f:
        return json.load(f)


def _format(hotel: dict, distance_km: float) -> dict:
    pics = hotel.get("top_pics") or []
    return {
        "hotel_id":     hotel.get("HotelID"),
        "hotel_name":   hotel.get("chinese_name") or hotel.get("HotelName"),
        "name_en":      hotel.get("HotelName"),
        "google_rating": hotel.get("rating"),
        "review_count": hotel.get("review_count"),
        "hashtags":     hotel.get("hashtags"),
        "address":      hotel.get("chinese_address"),
        "link":         hotel.get("gmaps_url"),
        "image":        pics[0] if pics else None,
        "distance_km":  round(distance_km, 2),
    }


def _gemini_client() -> genai.Client:
    key = config.GOOGLE_API_KEYS[0] if config.GOOGLE_API_KEYS else ""
    return genai.Client(api_key=key)


# ── public API ─────────────────────────────────────────────────────────────────

def recommend(
    location: str,
    hashtags: list[str],
    top_n: int = TOP_N_DEFAULT,
) -> list[dict]:
    """
    Simple recommendation: hashtag overlap (desc) + distance (asc) scoring.
    No Gemini call — fast and cheap.

    Args:
        location: Free-text location (landmark, MRT station, address, …)
        hashtags: User preference tags, e.g. ["文青", "交通方便"] or ["#地點優越"]
        top_n:    Number of results to return
    """
    coords = _geocode(location)
    if not coords:
        raise ValueError(f"Could not geocode location: {location!r}")
    lat0, lng0 = coords

    hotels = _load_hotels()
    scored = []
    for h in hotels:
        lat, lng = h.get("PositionLat"), h.get("PositionLon")
        if lat is None or lng is None:
            continue
        distance = _haversine_km(lat0, lng0, lat, lng)
        match    = _hashtag_match_count(h.get("hashtags"), hashtags)
        scored.append((match, distance, h))

    # primary: hashtag overlap desc, secondary: distance asc
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [_format(h, dist) for _, dist, h in scored[:top_n]]


def recommend_from_prompt(
    user_prompt: str,
    top_n: int = TOP_N_DEFAULT,
) -> list[dict]:
    """
    LLM-driven recommendation: parse prompt → geocode → proximity filter →
    Gemini rerank with reasons.

    Args:
        user_prompt: Free-text hotel requirement in any language.
        top_n:       Number of results to return.
    """
    client = _gemini_client()

    # 1. Parse location + preferences from the prompt
    parse_resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=(
            "從使用者的住宿需求中提取：\n"
            "- location: 想住的區域、地標或捷運站名稱\n"
            "- preferences: 使用者在意的特質（用繁體中文，3-6 個短詞）\n\n"
            f"使用者：{user_prompt}"
        ),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "object",
                "properties": {
                    "location":    {"type": "string"},
                    "preferences": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["location"],
            },
        ),
    )
    parsed   = json.loads(parse_resp.text)
    location = parsed.get("location") or "台北"

    # 2. Geocode and collect nearest CANDIDATE_POOL hotels
    coords = _geocode(location)
    if not coords:
        raise ValueError(f"Could not geocode location: {location!r}")
    lat0, lng0 = coords

    hotels = _load_hotels()
    dist_scored = []
    for h in hotels:
        if not h.get("chinese_name"):
            continue
        lat, lng = h.get("PositionLat"), h.get("PositionLon")
        if lat is None or lng is None:
            continue
        dist_scored.append((_haversine_km(lat0, lng0, lat, lng), h))
    dist_scored.sort(key=lambda x: x[0])
    candidates = [h for _, h in dist_scored[:CANDIDATE_POOL]]
    dist_by_id = {h.get("HotelID"): d for d, h in dist_scored}

    # 3. LLM rerank
    cand_text = "\n\n".join(
        f"[{i}] {h.get('chinese_name') or h.get('HotelName')}\n"
        f"  Rating: {h.get('rating')} ({h.get('review_count')} reviews)\n"
        f"  Hashtags: {h.get('hashtags') or '(none)'}\n"
        f"  Review snippet: {(h.get('review_summary') or '')[:200]}"
        for i, h in enumerate(candidates)
    )
    rerank_resp = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=(
            f"使用者需求：{user_prompt}\n\n"
            f"從以下飯店中挑出最符合使用者需求的 {top_n} 間，"
            f"並用繁體中文一句話說明為什麼適合。只能挑列表中的飯店，回傳對應的 index。\n\n"
            f"飯店列表：\n{cand_text}"
        ),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "index":  {"type": "integer"},
                        "reason": {"type": "string"},
                    },
                    "required": ["index", "reason"],
                },
            },
        ),
    )
    picks = json.loads(rerank_resp.text)

    out = []
    for pick in picks[:top_n]:
        idx = pick.get("index")
        if not isinstance(idx, int) or not (0 <= idx < len(candidates)):
            continue
        h = candidates[idx]
        formatted = _format(h, dist_by_id.get(h.get("HotelID"), 0.0))
        formatted["reason"]          = pick.get("reason", "")
        formatted["parsed_location"] = location
        out.append(formatted)
    return out
