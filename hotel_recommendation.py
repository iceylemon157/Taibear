from __future__ import annotations

import json
import math
from typing import Optional

from dotenv import load_dotenv

from gmaps_fetcher import search_by_keyword

# --- config ---------------------------------------------------------------

load_dotenv()

INPUT_PATH = 'Taipei_Hotel_with_hashtag.json'
TOP_N = 5
EARTH_RADIUS_KM = 6371.0

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


OUTPUT_PATH = 'recommendations.json'


if __name__ == '__main__':
    location = '忠孝復興捷運站'
    hashtags = ['#文青', '#交通便利', '#夜市']

    recs = recommend(location, hashtags)

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(recs, f, ensure_ascii=False, indent=2)

    print(json.dumps(recs, ensure_ascii=False, indent=2))
    print(f'\nwrote {len(recs)} recommendations to {OUTPUT_PATH}')
