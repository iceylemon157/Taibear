"""
scripts/seed_demo_users.py — Import db/users/*.json into PostgreSQL as demo data.

Runs on every agent-api container start. Idempotent via ON CONFLICT DO NOTHING.
Demo users get synthetic negative integer IDs: -1, -2, ...
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import config
from db.engine import get_engine
from db.models import Base, User, Item, ItemPlace, Place
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert


def seed():
    users_dir = Path(config.USERS_DIR)
    if not users_dir.exists():
        print(f"[seed] No users dir at {users_dir}, skipping.")
        return

    json_files = sorted(users_dir.glob("*.json"))
    if not json_files:
        print("[seed] No user JSON files found, skipping.")
        return

    engine = get_engine()
    Base.metadata.create_all(bind=engine)

    with Session(engine) as db:
        for idx, path in enumerate(json_files):
            demo_id = -(idx + 1)  # -1, -2, ...
            data = json.loads(path.read_text(encoding="utf-8"))

            db.execute(
                pg_insert(User.__table__)
                .values(id=demo_id, username=data.get("display_name") or path.stem)
                .on_conflict_do_nothing()
            )

            for reel in data.get("reels", []):
                url = reel.get("url", "")
                if not url:
                    continue

                result = db.execute(
                    pg_insert(Item.__table__)
                    .values(
                        user_id=demo_id,
                        platform="demo",
                        url=url,
                        title=reel.get("text_content", "")[:200],
                        raw_metadata={},
                    )
                    .on_conflict_do_nothing()
                    .returning(Item.__table__.c.id)
                )
                row = result.fetchone()
                if row is None:
                    continue
                item_id = row[0]

                text = reel.get("text_content", "")
                auto_tags = reel.get("auto_tags", [])

                result2 = db.execute(
                    pg_insert(Place.__table__)
                    .values(
                        store_name=text[:50] if text else "Demo",
                        domain="景點",
                        vibe=auto_tags,
                        description=text[:300] if text else None,
                    )
                    .returning(Place.__table__.c.id)
                )
                place_id = result2.fetchone()[0]

                db.execute(
                    pg_insert(ItemPlace.__table__)
                    .values(item_id=item_id, place_id=place_id)
                    .on_conflict_do_nothing()
                )

        db.commit()
        print(f"[seed] Imported {len(json_files)} demo user(s) from {users_dir}")


if __name__ == "__main__":
    seed()
