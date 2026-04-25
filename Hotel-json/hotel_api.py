"""
FastAPI endpoint for hotel legality check
pip install fastapi uvicorn psycopg2-binary

執行：uvicorn hotel_api:app --reload
"""

import math
import psycopg2
import psycopg2.extras
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ← 改成你自己的 PostgreSQL 連線字串
DB_URL = "postgresql://user:password@localhost:5432/taibear"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Chrome extension 需要這個
    allow_methods=["GET"],
    allow_headers=["*"],
)


def get_conn():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def normalize(text: str) -> str:
    return text.strip().lower().replace(" ", "").replace("　", "") if text else ""


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@app.get("/api/check-hotel")
def check_hotel(
    name: str = "",
    license_number: str = "",
    address: str = "",
    lat: float = 0,
    lng: float = 0,
):
    """
    比對優先順序：
    1. 執照號碼（booking.com 有貼才比，最精確）
    2. GPS 座標（500m 內）
    3. 中文名模糊比對
    4. 英文名模糊比對

    重要：找不到 ≠ 一定非法，但在名冊裡 = 一定合法
    """
    conn = get_conn()
    cur  = conn.cursor()
    hotel = None

    # 1. 執照號碼精確比對
    if license_number:
        cur.execute(
            "SELECT * FROM hotels WHERE license_number = %s AND service_status = 1 LIMIT 1",
            (license_number.strip(),)
        )
        hotel = cur.fetchone()

    # 2. GPS 座標比對（500m 內視為同一家）
    if not hotel and lat and lng:
        cur.execute("""
            SELECT *, (
                6371 * acos(LEAST(1.0,
                    cos(radians(%s)) * cos(radians(lat)) *
                    cos(radians(lng) - radians(%s)) +
                    sin(radians(%s)) * sin(radians(lat))
                ))
            ) AS distance_km
            FROM hotels
            WHERE service_status = 1
            ORDER BY distance_km
            LIMIT 1
        """, (lat, lng, lat))
        row = cur.fetchone()
        if row and row["distance_km"] < 0.5:
            hotel = row

    # 3. 中文名模糊比對
    if not hotel and name:
        norm = normalize(name)
        if norm:
            cur.execute(
                "SELECT * FROM hotels WHERE service_status = 1 AND name_zh IS NOT NULL"
            )
            for row in cur.fetchall():
                db_norm = normalize(row["name_zh"])
                if db_norm and (norm in db_norm or db_norm in norm):
                    hotel = row
                    break

    # 4. 英文名模糊比對
    if not hotel and name:
        norm = normalize(name)
        if norm:
            cur.execute(
                "SELECT * FROM hotels WHERE service_status = 1 AND name_en IS NOT NULL"
            )
            for row in cur.fetchall():
                db_norm = normalize(row["name_en"])
                if db_norm and (norm in db_norm or db_norm in norm):
                    hotel = row
                    break

    cur.close()
    conn.close()

    if hotel:
        return {
            "legal": True,
            "matchedBy": _match_method(license_number, lat, lng, hotel),
            "hotel": {
                "name":          hotel["name_zh"] or hotel["name_en"],
                "licenseNumber": hotel["license_number"],
                "address":       hotel["address"],
                "lat":           hotel["lat"],
                "lng":           hotel["lng"],
                "hotelClass":    hotel["hotel_class"],
            }
        }

    # 找不到 → 非法警示，但說明是「查無登記」而非百分百確定非法
    return {
        "legal": False,
        "matchedBy": None,
        "hotel": None,
        "warning": "此房源未列於觀光署合法旅宿名冊，請謹慎評估。"
    }


def _match_method(license_number, lat, lng, hotel) -> str:
    if license_number:
        return "license"
    if lat and lng:
        return "gps"
    if hotel["name_zh"]:
        return "name_zh"
    return "name_en"
