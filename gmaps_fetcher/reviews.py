"""
Google Places — review fetching.

Public API:
    fetch_reviews(place_id, sort, language)  → list[dict]
"""

from __future__ import annotations

import httpx

from ._config import GOOGLE_MAPS_API_KEY, PLACES_BASE


def fetch_reviews(
    place_id: str,
    sort: str = "most_relevant",
    language: str = "zh-TW",
) -> list[dict]:
    """
    Fetch up to 5 reviews for a place (Google Places API limit per request).

    Args:
        place_id: Google Places place_id
        sort:     "most_relevant" or "newest"
        language: BCP-47 language code, e.g. "zh-TW", "en"

    Returns:
        list of {author, rating, text, time, profile_photo_url}
    """
    url = f"{PLACES_BASE}/details/json"
    params = {
        "place_id": place_id,
        "fields": "reviews",
        "reviews_sort": sort,
        "language": language,
        "key": GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        raw = resp.json().get("result", {}).get("reviews", [])
        return [
            {
                "author": r.get("author_name", ""),
                "rating": int(r.get("rating", 0)),
                "text": r.get("text", "").strip(),
                "time": r.get("relative_time_description", ""),
                "profile_photo_url": r.get("profile_photo_url", ""),
            }
            for r in raw
        ]
    except Exception as e:
        print(f"[gmaps_fetcher] ⚠ fetch_reviews({place_id!r}, sort={sort!r}): {e}")
        return []
