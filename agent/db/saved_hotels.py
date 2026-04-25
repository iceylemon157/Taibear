"""
db/saved_hotels.py — CRUD helpers for saved_hotels.

使用者透過 Chrome extension 收藏旅宿時呼叫。
不與 Telegram user 綁定（extension 無 login）。
"""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import SavedHotel


def upsert_saved_hotel(
    db: Session,
    *,
    display_name: str,
    address: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    license_number: str | None = None,
    source: str = "booking",
    source_url: str | None = None,
    hotel_id: str | None = None,
) -> tuple[SavedHotel, bool]:
    """
    Insert or update a saved hotel entry.

    Uniqueness is keyed on (source, source_url).  If a row already exists,
    saved_at is refreshed to now() and other fields are updated in place.

    Returns (SavedHotel, created: bool).
    """
    existing: SavedHotel | None = None
    if source and source_url:
        existing = (
            db.query(SavedHotel)
            .filter_by(source=source, source_url=source_url)
            .first()
        )

    if existing:
        existing.display_name   = display_name
        existing.address        = address
        existing.lat            = lat
        existing.lng            = lng
        existing.license_number = license_number
        existing.hotel_id       = hotel_id
        existing.saved_at       = func.now()
        db.commit()
        db.refresh(existing)
        return existing, False

    row = SavedHotel(
        display_name=display_name,
        address=address,
        lat=lat,
        lng=lng,
        license_number=license_number,
        source=source,
        source_url=source_url,
        hotel_id=hotel_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, True


def list_saved_hotels(db: Session) -> list[SavedHotel]:
    """Return all saved hotels, newest first."""
    return db.query(SavedHotel).order_by(SavedHotel.saved_at.desc()).all()
