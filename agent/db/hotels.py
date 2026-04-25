"""
db/hotels.py — Hotel lookup helpers for /api/check-hotel.

Match priority:
  1. license_number exact match (any source)
  2. GPS bounding-box + haversine ≤ 150 m (booking.com only — GPS is trustworthy)
  3. Chinese name fuzzy containment (≥ 4 chars)
  4. English name fuzzy containment (≥ 4 chars)
"""

from __future__ import annotations

import math

from sqlalchemy import and_
from sqlalchemy.orm import Session

from .models import Hotel

GPS_RADIUS_KM = 0.15          # 150 m
GPS_BOX_DEG   = 0.0015        # ≈ 167 m bounding box half-side


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _normalize(text: str) -> str:
    return text.strip().lower().replace(" ", "").replace("　", "") if text else ""


def check_hotel(
    db: Session,
    *,
    name: str = "",
    license_number: str = "",
    lat: float = 0.0,
    lng: float = 0.0,
    source: str = "booking",
) -> dict:
    hotel: Hotel | None = None
    matched_by: str | None = None

    # 1. License number exact match
    if license_number:
        hotel = db.query(Hotel).filter(Hotel.license_number == license_number.strip()).first()
        if hotel:
            matched_by = "license"

    # 2. GPS match — booking only (GPS is real address)
    if not hotel and lat and lng and source == "booking":
        candidates = db.query(Hotel).filter(
            and_(
                Hotel.lat.isnot(None),
                Hotel.lng.isnot(None),
                Hotel.lat.between(lat - GPS_BOX_DEG, lat + GPS_BOX_DEG),
                Hotel.lng.between(lng - GPS_BOX_DEG, lng + GPS_BOX_DEG),
            )
        ).all()
        best, best_km = None, GPS_RADIUS_KM
        for h in candidates:
            km = _haversine_km(lat, lng, h.lat, h.lng)
            if km < best_km:
                best, best_km = h, km
        if best:
            hotel, matched_by = best, "gps"

    # 3 & 4. Name fuzzy match (zh then en)
    if not hotel and name:
        norm = _normalize(name)
        if len(norm) >= 4:
            for field, label in ((Hotel.name_zh, "name_zh"), (Hotel.name_en, "name_en")):
                all_hotels = db.query(Hotel).filter(field.isnot(None)).all()
                for h in all_hotels:
                    db_norm = _normalize(getattr(h, field.key))
                    if len(db_norm) >= 4 and (norm in db_norm or db_norm in norm):
                        hotel, matched_by = h, label
                        break
                if hotel:
                    break

    if hotel:
        return {
            "legal": True,
            "matchedBy": matched_by,
            "hotel": {
                "name":          hotel.name_zh or hotel.name_en,
                "licenseNumber": hotel.license_number,
                "address":       hotel.address,
                "lat":           hotel.lat,
                "lng":           hotel.lng,
                "hotelClass":    hotel.hotel_class,
            },
        }

    return {
        "legal": False,
        "matchedBy": None,
        "hotel": None,
        "warning": "此房源未列於觀光署合法旅宿名冊，請謹慎評估。",
    }
