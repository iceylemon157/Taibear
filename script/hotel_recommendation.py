from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from google import genai
from google.genai import types

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from gmaps_fetcher import search_by_keyword

# --- config ---------------------------------------------------------------

load_dotenv(ROOT / '.env')

INPUT_PATH = ROOT / 'data' / 'Taipei_Hotel_with_hashtag.json'
TOP_N = 5
CANDIDATE_POOL = 30
EARTH_RADIUS_KM = 6371.0

gemini = genai.Client(api_key=os.environ['GEMINI_API_KEY'])

# --- helpers --------------------------------------------------------------

def geocode(location: str) -> Optional[tuple[float, float]]:
    """Resolve a free-text location (landmark, MRT station, address) to (lat, lng)."""
    results = search_by_keyword(location, top_k=1)
    if not results:
        return None
    r = results[0]
    if r.get('lat') is None or r.get('lng') is None:
        return None
    return r['lat'], r['lng']


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def hashtag_match_count(hotel_tags: Optional[str], user_tags: list[str]) -> int:
    if not hotel_tags or not user_tags:
        return 0
    hotel_set = {t for t in hotel_tags.split() if t.startswith('#')}
    user_set = {t if t.startswith('#') else f'#{t}' for t in user_tags}
    return len(hotel_set & user_set)


def format_for_spec(hotel: dict, distance_km: float) -> dict:
    pics = hotel.get('top_pics') or []
    return {
        'hotel_name': hotel.get('chinese_name') or hotel.get('HotelName'),
        'google_rating': hotel.get('rating'),
        'review_count': hotel.get('review_count'),
        'hashtags': hotel.get('hashtags'),
        'address': hotel.get('chinese_address'),
        'link': hotel.get('gmaps_url'),
        'image': pics[0] if pics else None,
        'distance_km': round(distance_km, 2),
    }


# --- main -----------------------------------------------------------------

def recommend(desired_location: str, personal_hashtags: list[str]) -> list[dict]:
    coords = geocode(desired_location)
    if not coords:
        raise ValueError(f'could not geocode location: {desired_location!r}')
    lat0, lng0 = coords

    with open(INPUT_PATH, encoding='utf-8') as f:
        hotels = json.load(f)

    scored = []
    for h in hotels:
        lat, lng = h.get('PositionLat'), h.get('PositionLon')
        if lat is None or lng is None:
            continue
        distance = haversine_km(lat0, lng0, lat, lng)
        match = hashtag_match_count(h.get('hashtags'), personal_hashtags)
        scored.append((match, distance, h))

    # primary: hashtag overlap desc, secondary: distance asc
    scored.sort(key=lambda x: (-x[0], x[1]))
    return [format_for_spec(h, dist) for _, dist, h in scored[:TOP_N]]


# --- LLM-driven recommendation --------------------------------------------

def parse_user_prompt(prompt: str) -> dict:
    """Extract location and preferences from a free-text user prompt."""
    instruction = (
        "從使用者的住宿需求中提取：\n"
        "- location: 想住的區域、地標或捷運站名稱\n"
        "- preferences: 使用者在意的特質（用繁體中文，3-6 個短詞）\n\n"
        f"使用者：{prompt}"
    )
    resp = gemini.models.generate_content(
        model='gemini-2.5-flash',
        contents=instruction,
        config=types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema={
                'type': 'object',
                'properties': {
                    'location': {'type': 'string'},
                    'preferences': {'type': 'array', 'items': {'type': 'string'}},
                },
                'required': ['location'],
            },
        ),
    )
    return json.loads(resp.text)


def llm_rerank(user_prompt: str, candidates: list[dict], top_n: int) -> list[dict]:
    """Send candidates + prompt to Gemini; return top_n picks with reasons."""
    cand_text = '\n\n'.join(
        f"[{i}] {h.get('chinese_name') or h.get('HotelName')}\n"
        f"  Rating: {h.get('rating')} ({h.get('review_count')} reviews)\n"
        f"  Hashtags: {h.get('hashtags') or '(none)'}\n"
        f"  Review snippet: {(h.get('review_summary') or '')[:200]}"
        for i, h in enumerate(candidates)
    )
    instruction = (
        f"使用者需求：{user_prompt}\n\n"
        f"從以下飯店中挑出最符合使用者需求的 {top_n} 間，"
        f"並用繁體中文一句話說明為什麼適合。只能挑列表中的飯店，回傳對應的 index。\n\n"
        f"飯店列表：\n{cand_text}"
    )
    resp = gemini.models.generate_content(
        model='gemini-2.5-flash',
        contents=instruction,
        config=types.GenerateContentConfig(
            response_mime_type='application/json',
            response_schema={
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'index': {'type': 'integer'},
                        'reason': {'type': 'string'},
                    },
                    'required': ['index', 'reason'],
                },
            },
        ),
    )
    picks = json.loads(resp.text)
    out = []
    for pick in picks[:top_n]:
        idx = pick.get('index')
        if isinstance(idx, int) and 0 <= idx < len(candidates):
            entry = dict(candidates[idx])
            entry['_llm_reason'] = pick.get('reason', '')
            out.append(entry)
    return out


def recommend_from_prompt(user_prompt: str, top_n: int = TOP_N) -> list[dict]:
    parsed = parse_user_prompt(user_prompt)
    location = parsed.get('location') or '台北'

    coords = geocode(location)
    if not coords:
        raise ValueError(f'could not geocode location: {location!r}')
    lat0, lng0 = coords

    with open(INPUT_PATH, encoding='utf-8') as f:
        hotels = json.load(f)

    scored = []
    for h in hotels:
        if not h.get('chinese_name'):
            continue
        lat, lng = h.get('PositionLat'), h.get('PositionLon')
        if lat is None or lng is None:
            continue
        scored.append((haversine_km(lat0, lng0, lat, lng), h))
    scored.sort(key=lambda x: x[0])
    candidates = [h for _, h in scored[:CANDIDATE_POOL]]
    dist_by_id = {h.get('HotelID'): d for d, h in scored}

    picks = llm_rerank(user_prompt, candidates, top_n=top_n)

    out = []
    for h in picks:
        d = dist_by_id.get(h.get('HotelID'), 0.0)
        formatted = format_for_spec(h, d)
        formatted['reason'] = h.get('_llm_reason')
        formatted['parsed_location'] = location
        out.append(formatted)
    return out


# --- entrypoint -----------------------------------------------------------

OUTPUT_PATH = ROOT / 'output' / 'recommendations.json'


if __name__ == '__main__':
    prompt = input('描述你想要的飯店 (Describe your ideal hotel): ').strip()
    if not prompt:
        prompt = '我想找忠孝復興附近，文青風格、交通方便的飯店'
        print(f'(using default prompt: {prompt})')

    recs = recommend_from_prompt(prompt)

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(recs, f, ensure_ascii=False, indent=2)

    print(json.dumps(recs, ensure_ascii=False, indent=2))
    print(f'\nwrote {len(recs)} recommendations to {OUTPUT_PATH}')
