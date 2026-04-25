from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from .models import User, Item, Place, ItemPlace


def get_or_create_user(db: Session, telegram_id: int, username: str) -> User:
    user = db.get(User, telegram_id)
    if not user:
        user = User(id=telegram_id, username=username)
        db.add(user)
        db.commit()
    return user


def get_item_by_url(db: Session, url: str) -> Item | None:
    return db.query(Item).filter(Item.url == url).first()


def create_item_with_places(
    db: Session,
    user_id: int,
    platform: str,
    url: str,
    title: str,
    raw_metadata: dict,
    locations: list[dict],
) -> Item:
    item = Item(
        user_id=user_id,
        platform=platform,
        url=url,
        title=title,
        raw_metadata=raw_metadata,
    )
    db.add(item)
    db.flush()  # get item.id before committing

    for loc in locations:
        if loc.get("domain") == "其他":
            continue  # 不寫入 places，只保留影片紀錄
        place = Place(
            store_name=loc.get("store_name"),
            domain=loc.get("domain"),
            location=loc.get("location"),
            category=loc.get("category"),
            vibe=loc.get("vibe") or [],
            address=loc.get("address"),
            description=loc.get("description"),
        )
        db.add(place)
        db.flush()
        db.add(ItemPlace(item_id=item.id, place_id=place.id))

    db.commit()
    return item


def get_domains(db: Session, user_id: int) -> list[str]:
    """Return distinct domains the user has saved."""
    rows = (
        db.query(Place.domain)
        .join(ItemPlace, ItemPlace.place_id == Place.id)
        .join(Item, Item.id == ItemPlace.item_id)
        .filter(Item.user_id == user_id, Place.domain.isnot(None))
        .distinct()
        .all()
    )
    return [r.domain for r in rows]


def get_locations_by_domain(db: Session, user_id: int, domain: str) -> list[str]:
    """Return distinct location values for a given domain."""
    rows = (
        db.query(Place.location)
        .join(ItemPlace, ItemPlace.place_id == Place.id)
        .join(Item, Item.id == ItemPlace.item_id)
        .filter(Item.user_id == user_id, Place.domain == domain, Place.location.isnot(None))
        .distinct()
        .all()
    )
    return [r.location for r in rows]


def get_places(db: Session, user_id: int, domain: str, location: str) -> list[dict]:
    """Return all places matching domain + location for a user."""
    rows = (
        db.query(Place, Item.url)
        .join(ItemPlace, ItemPlace.place_id == Place.id)
        .join(Item, Item.id == ItemPlace.item_id)
        .filter(
            Item.user_id == user_id,
            Place.domain == domain,
            Place.location == location,
        )
        .all()
    )
    return [
        {
            "store_name": p.store_name,
            "domain": p.domain,
            "location": p.location,
            "category": p.category,
            "vibe": p.vibe,
            "address": p.address,
            "url": url,
        }
        for p, url in rows
    ]
