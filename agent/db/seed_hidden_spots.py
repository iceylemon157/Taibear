"""
db/seed_hidden_spots.py — 預載台北精選隱藏景點。

冪等：以 google_place_id 去重，重複執行不會新增重複資料。
執行方式：
    cd agent && python -m db.seed_hidden_spots
"""

from __future__ import annotations

import os
import sys

# 確保 agent/ 目錄在 path 上
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv

load_dotenv()

from agent.tools import _text_search
from db.engine import get_session, init_db
from db.models import HiddenSpot

SEED_SPOTS = [
    {
        "name": "寶藏巖國際藝術村",
        "description": "隱身公館山丘上的眷村藝術聚落，彩繪牆面與裝置藝術交錯，是台北最具人文氣息的秘境之一。",
        "category": "藝術村",
        "vibes": ["文青", "復古", "秘境", "藝術"],
    },
    {
        "name": "銀河洞瀑布",
        "description": "隱藏在木柵山林中的小瀑布古廟，全程步行約30分鐘，涼爽幽靜，少有觀光客知曉。",
        "category": "自然景觀",
        "vibes": ["秘境", "自然", "IG", "健行"],
    },
    {
        "name": "南機場夜市",
        "description": "在地人才知道的老牌夜市，無排隊人潮卻有超高CP值小吃，台北居民的日常飲食場所。",
        "category": "夜市",
        "vibes": ["在地", "美食", "庶民", "平價"],
    },
    {
        "name": "大稻埕碼頭",
        "description": "淡水河畔的老碼頭廣場，黃昏時夕陽染紅水面，是攝影愛好者與情侶的秘密約會地點。",
        "category": "河濱景點",
        "vibes": ["夕陽", "浪漫", "IG", "歷史"],
    },
    {
        "name": "星巴克保安門市",
        "description": "百年閩南式四合院建築改建的星巴克，保留原有木樑與庭院，喝咖啡像穿越時空。",
        "category": "咖啡廳",
        "vibes": ["文青", "建築", "打卡", "特色"],
    },
    {
        "name": "新生公園玫瑰園",
        "description": "春季盛開的免費玫瑰花圃，品種超過百種，是台北市區難得一見的浪漫秘境。",
        "category": "公園",
        "vibes": ["浪漫", "自然", "IG", "免費"],
    },
]


def seed():
    init_db()
    SessionLocal = get_session()

    seeded = 0
    skipped = 0

    with SessionLocal() as db:
        for data in SEED_SPOTS:
            name = data["name"]
            print(f"[Seed] 🔍 查詢 place_id：{name} ...")
            geo = _text_search(name)

            if not geo.get("place_id"):
                print(f"[Seed]   ⚠ 找不到 place_id，跳過 {name}")
                skipped += 1
                continue

            place_id = geo["place_id"]
            existing = db.query(HiddenSpot).filter_by(google_place_id=place_id).first()
            if existing:
                print(f"[Seed]   ↩ 已存在，跳過：{name} ({place_id})")
                skipped += 1
                continue

            spot = HiddenSpot(
                google_place_id=place_id,
                name=name,
                lat=geo.get("lat"),
                lng=geo.get("lng"),
                description=data["description"],
                category=data["category"],
                vibes=data["vibes"],
                submitted_by=None,
            )
            db.add(spot)
            db.commit()
            print(f"[Seed]   ✅ 已新增：{name} ({place_id})")
            seeded += 1

    print(f"\n[Seed] 完成！新增 {seeded} 筆，跳過 {skipped} 筆。")


if __name__ == "__main__":
    seed()
