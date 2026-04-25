import itertools

import httpx

import config

PLACES_BASE = "https://maps.googleapis.com/maps/api/place"
DISTANCE_MATRIX_BASE = "https://maps.googleapis.com/maps/api/distancematrix/json"


def geocode_places(place_names: list[str]) -> list[dict]:
    """
    將景點名稱清單轉換為 place_id、座標與營業時間。

    Args:
        place_names: 景點名稱清單，例如 ["華山1914文創園區", "里Ura"]

    Returns:
        每個景點的詳細資訊清單，包含 name, place_id, lat, lng, opening_hours, found。
    """
    results = []
    for name in place_names:
        info = _text_search(name)
        results.append(info)
    return results


def _text_search(query: str) -> dict:
    """呼叫 Google Places Text Search API 取得景點資訊。"""
    url = f"{PLACES_BASE}/textsearch/json"
    params = {
        "query": f"{query} 台北",
        "language": "zh-TW",
        "region": "tw",
        "key": config.GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if data.get("results"):
            place = data["results"][0]
            place_id = place.get("place_id", "")
            location = place.get("geometry", {}).get("location", {})
            opening_hours = _get_opening_hours(place_id)
            return {
                "name": query,
                "place_id": place_id,
                "lat": location.get("lat", 0.0),
                "lng": location.get("lng", 0.0),
                "opening_hours": opening_hours,
                "found": True,
            }
    except Exception as e:
        pass

    return {
        "name": query,
        "place_id": "",
        "lat": 0.0,
        "lng": 0.0,
        "opening_hours": [],
        "found": False,
    }


def _get_opening_hours(place_id: str) -> list[str]:
    """取得景點的每週營業時間文字描述。"""
    if not place_id:
        return []
    url = f"{PLACES_BASE}/details/json"
    params = {
        "place_id": place_id,
        "fields": "opening_hours",
        "language": "zh-TW",
        "key": config.GOOGLE_MAPS_API_KEY,
    }
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        weekday_text = (
            data.get("result", {}).get("opening_hours", {}).get("weekday_text", [])
        )
        return weekday_text
    except Exception:
        return []


def search_places(keyword: str) -> list[dict]:
    """
    搜尋補充景點（如玫瑰園、文青酒吧），回傳前 3 個候選。

    Args:
        keyword: 搜尋關鍵字，例如 "台北 玫瑰園" 或 "台北 文青 酒吧"

    Returns:
        最多 3 個候選景點，含 name, place_id, lat, lng, opening_hours。
    """
    url = f"{PLACES_BASE}/textsearch/json"
    params = {
        "query": keyword,
        "language": "zh-TW",
        "region": "tw",
        "key": config.GOOGLE_MAPS_API_KEY,
    }
    candidates = []
    try:
        resp = httpx.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        for place in data.get("results", [])[:3]:
            place_id = place.get("place_id", "")
            location = place.get("geometry", {}).get("location", {})
            opening_hours = _get_opening_hours(place_id)
            candidates.append(
                {
                    "name": place.get("name", ""),
                    "place_id": place_id,
                    "lat": location.get("lat", 0.0),
                    "lng": location.get("lng", 0.0),
                    "opening_hours": opening_hours,
                    "found": True,
                }
            )
    except Exception:
        pass
    return candidates


def evaluate_route(waypoints: list[dict]) -> dict:
    """
    對 3-4 個景點做 TSP 暴力全排列，找出總交通時間最短的順序。
    使用 Google Distance Matrix API 取得大眾運輸時間。

    Args:
        waypoints: 景點清單，每個含 name, place_id, lat, lng

    Returns:
        最佳排序結果，含 sorted_waypoints, total_transit_time_mins, smoothness_score
    """
    if len(waypoints) < 2:
        return {
            "sorted_waypoints": waypoints,
            "total_transit_time_mins": 0,
            "smoothness_score": 1.0,
        }

    # 取得所有點對點的交通時間（分鐘）
    transit_matrix = _build_transit_matrix(waypoints)

    # 暴力全排列找最短路徑（固定第一個點不動以減少計算）
    best_order = list(range(len(waypoints)))
    best_time = _route_total_time(best_order, transit_matrix)

    for perm in itertools.permutations(range(len(waypoints))):
        total = _route_total_time(list(perm), transit_matrix)
        if total < best_time:
            best_time = total
            best_order = list(perm)

    # 計算最佳可能時間（貪婪下界：每段取最小值）
    n = len(waypoints)
    min_possible = sum(
        min(transit_matrix[i][j] for j in range(n) if j != i) for i in range(n - 1)
    )
    smoothness_score = round(1 - (best_time - min_possible) / max(min_possible, 1), 3)
    smoothness_score = max(0.0, min(1.0, smoothness_score))

    sorted_waypoints = [waypoints[i] for i in best_order]
    return {
        "sorted_waypoints": sorted_waypoints,
        "total_transit_time_mins": best_time,
        "smoothness_score": smoothness_score,
    }


def _extract_lat_lng(w: dict) -> tuple[float, float]:
    """從 waypoint dict 中取出座標，同時相容兩種格式：
    - 頂層欄位：{"lat": 25.0, "lng": 121.5, ...}
    - 巢狀 location：{"location": {"lat": 25.0, "lng": 121.5}, ...}
    """
    if "lat" in w and "lng" in w:
        return float(w["lat"]), float(w["lng"])
    loc = w.get("location", {})
    return float(loc.get("lat", 0.0)), float(loc.get("lng", 0.0))


def _build_transit_matrix(waypoints: list[dict]) -> list[list[int]]:
    """呼叫 Distance Matrix API 取得所有點對點的大眾運輸時間（分鐘）。"""
    n = len(waypoints)
    matrix = [[0] * n for _ in range(n)]

    origins = "|".join(f"{lat},{lng}" for lat, lng in map(_extract_lat_lng, waypoints))
    destinations = origins

    try:
        resp = httpx.get(
            DISTANCE_MATRIX_BASE,
            params={
                "origins": origins,
                "destinations": destinations,
                "mode": "transit",
                "language": "zh-TW",
                "key": config.GOOGLE_MAPS_API_KEY,
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        for i, row in enumerate(data.get("rows", [])):
            for j, element in enumerate(row.get("elements", [])):
                if element.get("status") == "OK":
                    matrix[i][j] = element["duration"]["value"] // 60  # 秒 → 分鐘
                else:
                    # fallback：用直線距離估算（約 30 分鐘）
                    matrix[i][j] = 30 if i != j else 0
    except Exception:
        # API 失敗時用預設值
        for i in range(n):
            for j in range(n):
                matrix[i][j] = 0 if i == j else 30

    return matrix


def _route_total_time(order: list[int], matrix: list[list[int]]) -> int:
    """計算給定順序的總交通時間。"""
    return sum(matrix[order[i]][order[i + 1]] for i in range(len(order) - 1))


def build_google_maps_url(waypoints: list[dict]) -> str:
    """產生可直接在 Google Maps 開啟的導航 URL。
    使用 lat,lng 座標，不依賴名稱或 place_id，確保定位精確。
    waypoints 需含 location.lat / location.lng 或 lat / lng 欄位。
    """
    if not waypoints:
        return ""

    def point(wp: dict) -> str:
        loc = wp.get("location", {})
        lat = loc.get("lat") or wp.get("lat")
        lng = loc.get("lng") or wp.get("lng")
        if lat is not None and lng is not None:
            return f"{lat},{lng}"
        # fallback：無座標時用名稱
        import urllib.parse

        return urllib.parse.quote(wp["name"])

    origin = point(waypoints[0])
    destination = point(waypoints[-1])

    url = (
        f"https://www.google.com/maps/dir/?api=1"
        f"&origin={origin}"
        f"&destination={destination}"
        f"&travelmode=transit"
    )

    if len(waypoints) > 2:
        middle = "|".join(point(w) for w in waypoints[1:-1])
        url += f"&waypoints={middle}"

    return url
