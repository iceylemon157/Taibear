"""
Google Places API — search hotels by name or keyword, fetch full details.

Public API:
    search_by_name(name, region)        → dict  (first match)
    search_by_keyword(keyword, top_k)   → list[dict]  (candidates)
    get_details(place_id)               → dict  (full hotel info)
"""

from __future__ import annotations

import httpx

from ._config import GOOGLE_MAPS_API_KEY, PLACES_BASE

# Fields returned by get_details
_DETAIL_FIELDS = ",".join([
    "place_id",
    "name",
    "formatted_address",
    "formatted_phone_number",
    "international_phone_number",
    "rating",
    "user_ratings_total",
    "price_level",
    "website",
    "url",
    "opening_hours",
    "geometry",
    "types",
])


def search_by_name(name: str, region: str = "") -> dict | None:
    """
    Find a hotel by name. Returns the first Places result with full details,
    or None if nothing found.

    Args:
        name:   Hotel name, e.g. "君悅酒店"
        region: Optional disambiguation suffix, e.g. "台北"
    """
    url = f"{PLACES_BASE}/textsearch/json"
    query = f"{name} {region}".strip() if region else name
    params = {
        "query": query,
        "language": "zh-TW",
        "region": "tw",
        "key": GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if not results:
            return None
        place_id = results[0].get("place_id", "")
        return get_details(place_id) if place_id else None
    except Exception as e:
        print(f"[gmaps_fetcher] ⚠ search_by_name({name!r}): {e}")
        return None


def search_with_status(name: str, region: str = "") -> tuple[dict | None, str]:
    """
    Like search_by_name, but returns the API status alongside the result.

    Returns:
        (place_dict, "OK") on success
        (None, status) on failure — status is the Google API status string:
            "ZERO_RESULTS"      — no match found
            "OVER_QUERY_LIMIT"  — quota exceeded / billing inactive
            "REQUEST_DENIED"    — API key invalid / API not enabled
            "EXCEPTION:<name>"  — local network / parse failure
    """
    url = f"{PLACES_BASE}/textsearch/json"
    query = f"{name} {region}".strip() if region else name
    params = {
        "query": query,
        "language": "zh-TW",
        "region": "tw",
        "key": GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "UNKNOWN")
        if status != "OK":
            return None, status
        results = data.get("results", [])
        if not results:
            return None, "ZERO_RESULTS"
        place_id = results[0].get("place_id", "")
        if not place_id:
            return None, "NO_PLACE_ID"
        return get_details(place_id), "OK"
    except Exception as e:
        return None, f"EXCEPTION:{type(e).__name__}"


def search_by_keyword(keyword: str, top_k: int = 5) -> list[dict]:
    """
    Keyword search (e.g. "台北 五星飯店"). Returns basic info for top_k results.
    Call get_details() on any result to get the full record.

    Returns:
        list of {place_id, name, address, lat, lng, rating, types}
    """
    url = f"{PLACES_BASE}/textsearch/json"
    params = {
        "query": keyword,
        "language": "zh-TW",
        "region": "tw",
        "key": GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        candidates = []
        for place in resp.json().get("results", [])[:top_k]:
            location = place.get("geometry", {}).get("location", {})
            candidates.append({
                "place_id": place.get("place_id", ""),
                "name": place.get("name", ""),
                "address": place.get("formatted_address", ""),
                "lat": location.get("lat"),
                "lng": location.get("lng"),
                "rating": place.get("rating"),
                "types": place.get("types", []),
            })
        return candidates
    except Exception as e:
        print(f"[gmaps_fetcher] ⚠ search_by_keyword({keyword!r}): {e}")
        return []


def get_details(place_id: str) -> dict:
    """
    Fetch full hotel details for a place_id.

    Returns:
        {
          place_id, name, address, phone, phone_intl,
          rating, review_count, price_level,   # price_level: 1(cheap)–4(expensive)
          website, google_maps_url,
          opening_hours,                        # list of weekday strings
          lat, lng, types
        }
    """
    url = f"{PLACES_BASE}/details/json"
    params = {
        "place_id": place_id,
        "fields": _DETAIL_FIELDS,
        "language": "zh-TW",
        "key": GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        r = resp.json().get("result", {})
        location = r.get("geometry", {}).get("location", {})
        return {
            "place_id": r.get("place_id", place_id),
            "name": r.get("name", ""),
            "address": r.get("formatted_address", ""),
            "phone": r.get("formatted_phone_number", ""),
            "phone_intl": r.get("international_phone_number", ""),
            "rating": r.get("rating"),
            "review_count": r.get("user_ratings_total"),
            "price_level": r.get("price_level"),
            "website": r.get("website", ""),
            "google_maps_url": r.get("url", ""),
            "opening_hours": r.get("opening_hours", {}).get("weekday_text", []),
            "lat": location.get("lat"),
            "lng": location.get("lng"),
            "types": r.get("types", []),
        }
    except Exception as e:
        print(f"[gmaps_fetcher] ⚠ get_details({place_id!r}): {e}")
        return {"place_id": place_id}
