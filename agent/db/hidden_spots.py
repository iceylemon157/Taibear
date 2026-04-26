"""
db/hidden_spots.py — CRUD helpers for hidden_spots, hidden_spot_photos, hidden_spot_comments.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from .models import HiddenSpot, HiddenSpotComment, HiddenSpotPhoto


def get_spot_by_place_id(db: Session, google_place_id: str) -> HiddenSpot | None:
    return db.query(HiddenSpot).filter_by(google_place_id=google_place_id).first()


def create_hidden_spot(
    db: Session,
    *,
    google_place_id: str,
    name: str,
    address: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    description: str | None = None,
    category: str | None = None,
    vibes: list[str] | None = None,
    submitted_by: int | None = None,
) -> HiddenSpot:
    spot = HiddenSpot(
        google_place_id=google_place_id,
        name=name,
        address=address,
        lat=lat,
        lng=lng,
        description=description,
        category=category,
        vibes=vibes or [],
        submitted_by=submitted_by,
    )
    db.add(spot)
    db.commit()
    db.refresh(spot)
    return spot


def add_comment(
    db: Session,
    spot_id: int,
    content: str,
    user_id: int | None = None,
    rating: int | None = None,
) -> HiddenSpotComment:
    comment = HiddenSpotComment(
        spot_id=spot_id,
        user_id=user_id,
        content=content,
        rating=rating,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


def add_photo(
    db: Session,
    spot_id: int,
    file_path: str,
    uploaded_by: int | None = None,
) -> HiddenSpotPhoto:
    photo = HiddenSpotPhoto(
        spot_id=spot_id,
        file_path=file_path,
        uploaded_by=uploaded_by,
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return photo


def get_all_spots(db: Session) -> list[HiddenSpot]:
    return db.query(HiddenSpot).order_by(HiddenSpot.id).all()


def serialize_spot(spot: HiddenSpot) -> dict:
    return {
        "id": spot.id,
        "google_place_id": spot.google_place_id,
        "name": spot.name,
        "address": spot.address,
        "lat": spot.lat,
        "lng": spot.lng,
        "description": spot.description,
        "category": spot.category,
        "vibes": spot.vibes or [],
        "submitted_by": spot.submitted_by,
        "created_at": spot.created_at.isoformat() if spot.created_at else None,
        "photos": [
            {
                "id": p.id,
                "file_path": p.file_path,
                "uploaded_by": p.uploaded_by,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in spot.photos
        ],
        "comments": [
            {
                "id": c.id,
                "user_id": c.user_id,
                "content": c.content,
                "rating": c.rating,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in spot.comments
        ],
    }
