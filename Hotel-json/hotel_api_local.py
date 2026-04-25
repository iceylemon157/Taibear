"""
Taibear Hotel API — 本地 JSON 版（不需要 PostgreSQL）
測試用，直接把 HotelList.json 載入記憶體查詢

執行：uvicorn hotel_api_local:app --reload --port 8000
"""

import json
import math
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── 啟動時載入 JSON ──────────────────────────────────────────

JSON_PATH = Path(__file__).parent / "HotelList.json"

def _build_index(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)
    index = []
    for h in data["Hotels"]:
        org_name = None
        if h.get("Organizations"):
            org_name = h["Organizations"][0].get("Name")
        addr = h.get("PostalAddress", {})
        index.append({
            "hotel_id":       h["HotelID"],
            "name_en":        h.get("HotelName", ""),
            "name_zh":        org_name or "",
            "license_number": h.get("HotelLicenseNumber", ""),
            "city":           addr.get("City", ""),
            "address":        addr.get("StreetAddress", ""),
            "lat":            h.get("PositionLat"),
            "lng":            h.get("PositionLon"),
            "hotel_class":    h["HotelClasses"][0] if h.get("HotelClasses") else None,
        })
    return index

print("載入旅宿資料庫...")
HOTELS = _build_index(JSON_PATH)
print(f"共 {len(HOTELS)} 筆合法旅宿已就緒")

# ── 工具函式 ────────────────────────────────────────────────

def normalize(text: str) -> str:
    return text.strip().lower().replace(" ", "").replace("　", "") if text else ""

def haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ── API ─────────────────────────────────────────────────────

@app.get("/api/check-hotel")
def check_hotel(
    name: str = "",
    license_number: str = "",
    address: str = "",
    lat: float = 0,
    lng: float = 0,
    source: str = "booking",   # "booking" | "airbnb"
):
    """
    Booking.com：GPS 精確 → 150m 內直接信任，不需名字吻合
    Airbnb    ：GPS 故意模糊 → 不信 GPS，只靠名字比對
    兩者都支援執照號碼精確比對（最優先）
    """
    hotel = None
    matched_by = None

    # 1. 執照號碼精確比對（任何平台皆適用）
    if license_number:
        for h in HOTELS:
            if h["license_number"] == license_number.strip():
                hotel, matched_by = h, "license"
                break

    # 2. GPS 比對 — 只信任 Booking.com（GPS 是真實地址）
    if not hotel and lat and lng and source == "booking":
        best, best_km = None, 0.15   # 150m
        for h in HOTELS:
            if not (h["lat"] and h["lng"]):
                continue
            km = haversine_km(lat, lng, h["lat"], h["lng"])
            if km < best_km:
                best, best_km = h, km
        if best:
            hotel, matched_by = best, "gps"

    # 3. 中文名模糊比對（雙方都要 ≥4 字元，避免 "-" 或極短字誤判）
    if not hotel and name:
        norm = normalize(name)
        if len(norm) >= 4:
            for h in HOTELS:
                db = normalize(h["name_zh"])
                if len(db) >= 4 and (norm in db or db in norm):
                    hotel, matched_by = h, "name_zh"
                    break

    # 4. 英文名模糊比對（同上）
    if not hotel and name:
        norm = normalize(name)
        if len(norm) >= 4:
            for h in HOTELS:
                db = normalize(h["name_en"])
                if len(db) >= 4 and (norm in db or db in norm):
                    hotel, matched_by = h, "name_en"
                    break

    if hotel:
        return {
            "legal": True,
            "matchedBy": matched_by,
            "hotel": {
                "name":          hotel["name_zh"] or hotel["name_en"],
                "licenseNumber": hotel["license_number"],
                "address":       hotel["address"],
                "lat":           hotel["lat"],
                "lng":           hotel["lng"],
                "hotelClass":    hotel["hotel_class"],
            }
        }

    return {
        "legal": False,
        "matchedBy": None,
        "hotel": None,
        "warning": "此房源未列於觀光署合法旅宿名冊，請謹慎評估。"
    }


@app.get("/health")
def health():
    return {"status": "ok", "hotels": len(HOTELS)}
