"""
把 HotelList.json import 進 PostgreSQL
執行前先設定下面的 DB_URL
"""

import json
import psycopg2
from psycopg2.extras import execute_values

# ← 改成你自己的 PostgreSQL 連線字串
DB_URL = "postgresql://user:password@localhost:5432/taibear"

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS hotels (
    id              SERIAL PRIMARY KEY,
    hotel_id        TEXT UNIQUE NOT NULL,
    name_en         TEXT,
    name_zh         TEXT,
    license_number  TEXT,
    city            TEXT,
    address         TEXT,
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    service_status  INTEGER,
    hotel_class     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hotels_name_zh ON hotels (name_zh);
CREATE INDEX IF NOT EXISTS idx_hotels_name_en ON hotels (name_en);
CREATE INDEX IF NOT EXISTS idx_hotels_latlon  ON hotels (lat, lng);
"""

def load_hotels(path: str) -> list[dict]:
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)

    rows = []
    for h in data["Hotels"]:
        org_name = None
        if h.get("Organizations"):
            org_name = h["Organizations"][0].get("Name")

        addr   = h.get("PostalAddress", {})
        street = addr.get("StreetAddress", "")
        city   = addr.get("City", "")

        rows.append((
            h["HotelID"],
            h.get("HotelName"),
            org_name,
            h.get("HotelLicenseNumber"),
            city,
            street,
            h.get("PositionLat"),
            h.get("PositionLon"),
            h.get("ServiceStatus", 1),
            h["HotelClasses"][0] if h.get("HotelClasses") else None,
        ))
    return rows


def main():
    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()

    print("建立 hotels 資料表...")
    cur.execute(CREATE_TABLE)

    print("讀取 HotelList.json...")
    rows = load_hotels("HotelList.json")
    print(f"共 {len(rows)} 筆，開始 import...")

    execute_values(
        cur,
        """
        INSERT INTO hotels
            (hotel_id, name_en, name_zh, license_number, city, address, lat, lng, service_status, hotel_class)
        VALUES %s
        ON CONFLICT (hotel_id) DO UPDATE SET
            name_en        = EXCLUDED.name_en,
            name_zh        = EXCLUDED.name_zh,
            license_number = EXCLUDED.license_number,
            city           = EXCLUDED.city,
            address        = EXCLUDED.address,
            lat            = EXCLUDED.lat,
            lng            = EXCLUDED.lng,
            service_status = EXCLUDED.service_status,
            hotel_class    = EXCLUDED.hotel_class
        """,
        rows,
        page_size=500,
    )

    conn.commit()
    cur.close()
    conn.close()
    print("完成！")


if __name__ == "__main__":
    main()
