"""
db/seed_hotels.py — 將 data/hotels/HotelList.json 批次匯入 PostgreSQL。

冪等：hotel_id ON CONFLICT DO UPDATE。
若資料表已有資料則跳過（加快後續啟動速度）。

執行方式：
    cd agent && python -m db.seed_hotels
    cd agent && python -m db.seed_hotels --path /custom/path/HotelList.json
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy.dialects.postgresql import insert as pg_insert

from db.engine import get_engine, get_session, init_db
from db.models import Hotel

DEFAULT_JSON = Path(__file__).parent.parent / "data" / "hotels" / "HotelList.json"
# Raw (original Tourism Bureau format) is kept as HotelList_Raw.json
BATCH_SIZE = 500


def _parse_rows(path: Path) -> list[dict]:
    with open(path, encoding="utf-8-sig") as f:
        data = json.load(f)

    rows = []
    for h in data:
        rows.append({
            "hotel_id":       h["HotelID"],
            "name_en":        h.get("HotelName"),
            "name_zh":        h.get("chinese_name"),
            "license_number": h.get("HotelLicenseNumber"),
            "city":           None,
            "address":        h.get("chinese_address"),
            "lat":            h.get("PositionLat"),
            "lng":            h.get("PositionLon"),
            "service_status": 1,
            "hotel_class":    None,
        })
    return rows


def seed(json_path: Path = DEFAULT_JSON) -> None:
    if not json_path.exists():
        print(f"[hotel-seed] 找不到 JSON：{json_path}", file=sys.stderr)
        sys.exit(1)

    init_db()
    engine = get_engine()

    # 已有資料則跳過（冪等快路徑）
    with get_session()() as db:
        if db.query(Hotel).limit(1).count():
            print("[hotel-seed] 資料庫已有旅宿資料，跳過匯入。")
            return

    print(f"[hotel-seed] 讀取 {json_path} ...")
    rows = _parse_rows(json_path)
    print(f"[hotel-seed] 共 {len(rows)} 筆，開始批次匯入...")

    with engine.connect() as conn:
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            stmt = pg_insert(Hotel).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=["hotel_id"],
                set_={
                    col: stmt.excluded[col]
                    for col in batch[0]
                    if col != "hotel_id"
                },
            )
            conn.execute(stmt)
            conn.commit()
            print(f"[hotel-seed]   {min(i + BATCH_SIZE, len(rows))}/{len(rows)}")

    print(f"[hotel-seed] 完成！{len(rows)} 筆旅宿已匯入。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", type=Path, default=DEFAULT_JSON)
    args = parser.parse_args()
    seed(args.path)
