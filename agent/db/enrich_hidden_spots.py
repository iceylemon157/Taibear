"""
db/enrich_hidden_spots.py — 對 DB 內所有隱藏景點抓取 Google Maps 評論與照片。

執行方式：
    cd agent && DATABASE_URL=postgresql://ytp:changeme@localhost:5432/ytp \
        uv run python -m db.enrich_hidden_spots
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from pathlib import Path

import config
from agent.enricher import _download_photo, _fetch_photo_references, _fetch_reviews
from db.engine import get_session, init_db
from db.hidden_spots import add_comment, add_photo, get_all_spots
from db.models import HiddenSpot, HiddenSpotComment, HiddenSpotPhoto


def _already_enriched(db, spot: HiddenSpot) -> bool:
    """已有評論或照片就跳過，避免重複抓取。"""
    has_comments = db.query(HiddenSpotComment).filter_by(spot_id=spot.id).first() is not None
    has_photos = db.query(HiddenSpotPhoto).filter_by(spot_id=spot.id).first() is not None
    return has_comments or has_photos


def enrich_spot(db, spot: HiddenSpot) -> dict:
    """
    對單一隱藏景點：
    1. 抓最新 5 則 + 最熱門 5 則 Google 評論 → 存入 hidden_spot_comments
    2. 下載最多 10 張照片 → data/hidden_spots/{google_place_id}/ → 存入 hidden_spot_photos
    """
    place_id = spot.google_place_id
    print(f"\n[Enrich] 📍 {spot.name} ({place_id})")

    # ── 評論 ──────────────────────────────────────────────────────────────────
    newest = _fetch_reviews(place_id, sort="newest")
    relevant = _fetch_reviews(place_id, sort="most_relevant")

    # 合併去重（以 author + text 前 50 字為 key）
    seen: set[str] = set()
    all_reviews = newest + relevant
    added_comments = 0
    for r in all_reviews:
        key = f"{r.get('author', '')}:{r.get('text', '')[:50]}"
        if key in seen:
            continue
        seen.add(key)
        content = r.get("text", "").strip()
        if not content:
            continue
        add_comment(
            db,
            spot_id=spot.id,
            content=content,
            user_id=None,
            rating=r.get("rating"),
        )
        added_comments += 1

    print(f"[Enrich]   評論：新增 {added_comments} 則")

    # ── 照片 ──────────────────────────────────────────────────────────────────
    spot_dir = config.HIDDEN_SPOTS_DIR / place_id
    spot_dir.mkdir(parents=True, exist_ok=True)

    photo_refs = _fetch_photo_references(place_id, max_photos=10)
    added_photos = 0
    for i, ref in enumerate(photo_refs, start=1):
        filename = f"photo_{i:02d}.jpg"
        save_path = spot_dir / filename
        if save_path.exists():
            continue
        if _download_photo(ref, save_path):
            add_photo(db, spot_id=spot.id, file_path=str(save_path), uploaded_by=None)
            added_photos += 1

    print(f"[Enrich]   照片：下載 {added_photos}/{len(photo_refs)} 張")
    return {"comments": added_comments, "photos": added_photos}


def main():
    init_db()
    SessionLocal = get_session()

    total_comments = 0
    total_photos = 0

    with SessionLocal() as db:
        spots = get_all_spots(db)
        if not spots:
            print("[Enrich] 資料庫中沒有隱藏景點，請先執行 seed_hidden_spots.py")
            return

        print(f"[Enrich] 找到 {len(spots)} 個隱藏景點，開始抓取...")

        for spot in spots:
            if _already_enriched(db, spot):
                print(f"[Enrich] ↩ 已有資料，跳過：{spot.name}")
                continue
            if not spot.google_place_id:
                print(f"[Enrich] ⚠ 缺少 place_id，跳過：{spot.name}")
                continue
            result = enrich_spot(db, spot)
            total_comments += result["comments"]
            total_photos += result["photos"]

    print(f"\n[Enrich] ✅ 完成！共新增評論 {total_comments} 則，照片 {total_photos} 張")
    print(f"[Enrich] 📁 照片存放於：{config.HIDDEN_SPOTS_DIR}")


if __name__ == "__main__":
    main()
