"""
realtime_monitor/fetchers/ubike.py — YouBike 2.0 station availability fetcher.

Two-step process:
  1. GET /v2/Bike/Station/City/Taipei    (spatial) → nearby stations + metadata
  2. GET /v2/Bike/Availability/City/Taipei ($filter by StationUID) → live availability

Key API notes discovered from testing:
  - $spatialFilter is NOT supported on the Availability endpoint; must filter by UID.
  - Availability returns AvailableRentBikesDetail with GeneralBikes / ElectricBikes breakdown.
  - Station data includes StationPosition (lat/lng), StationAddress (bilingual dict), BikesCapacity.
  - ServiceStatus in availability: 1 = in service, 0 = not in service.
"""

from __future__ import annotations

import math
from typing import Any

import requests

from .base import DataFetcher
from .tdx_auth import TDXAuth
from ..config import TDX_BASE_URL, REQUEST_TIMEOUT_SECS, NEARBY_RADIUS_M, TDX_CLIENT_ID, TDX_CLIENT_SECRET

_MAX_STATIONS = 5  # nearest YouBike stations to consider within the radius


def _dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat = (lat2 - lat1) * 111_320
    dlng = (lng2 - lng1) * 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dlat, dlng)


class UBikeFetcher(DataFetcher):

    def __init__(self, auth: TDXAuth | None = None):
        self._auth = auth or TDXAuth(TDX_CLIENT_ID, TDX_CLIENT_SECRET)

    def fetch(self, lat: float, lng: float) -> dict[str, Any]:
        """
        Step 1: find nearby YouBike stations spatially (includes position, address, capacity).
        Step 2: fetch live availability for those station UIDs.
        Returns a raw dict with 'stations', 'availability', '_lat', '_lng'.
        """
        headers = self._auth.get_headers()

        r1 = requests.get(
            f"{TDX_BASE_URL}/v2/Bike/Station/City/Taipei",
            headers=headers,
            params={
                "$spatialFilter": f"nearby({lat},{lng},{NEARBY_RADIUS_M})",
                "$top": str(_MAX_STATIONS),
                "$format": "JSON",
            },
            timeout=REQUEST_TIMEOUT_SECS,
        )
        r1.raise_for_status()
        stations: list[dict] = r1.json()

        availability: list[dict] = []
        if stations:
            uid_filter = " or ".join(
                f"StationUID eq '{s['StationUID']}'" for s in stations
            )
            r2 = requests.get(
                f"{TDX_BASE_URL}/v2/Bike/Availability/City/Taipei",
                headers=headers,
                params={"$filter": uid_filter, "$format": "JSON"},
                timeout=REQUEST_TIMEOUT_SECS,
            )
            r2.raise_for_status()
            availability = r2.json()

        return {
            "stations": stations,
            "availability": availability,
            "_lat": lat,
            "_lng": lng,
        }

    @staticmethod
    def parse(raw: dict) -> list[dict[str, Any]]:
        """
        Merge station metadata with live availability.
        Returns a flat list sorted by distance_m ascending.
        """
        lat, lng = raw["_lat"], raw["_lng"]
        avail_map: dict[str, dict] = {
            a["StationUID"]: a for a in raw.get("availability", [])
        }

        results = []
        for s in raw.get("stations", []):
            uid = s.get("StationUID", "")
            pos = s.get("StationPosition", {})
            slat = pos.get("PositionLat", lat)
            slng = pos.get("PositionLon", lng)
            av = avail_map.get(uid, {})
            detail = av.get("AvailableRentBikesDetail", {})

            addr_raw = s.get("StationAddress", {})
            addr = addr_raw.get("Zh_tw", "") if isinstance(addr_raw, dict) else str(addr_raw)

            name_raw = s.get("StationName", {})
            name = name_raw.get("Zh_tw", "") if isinstance(name_raw, dict) else str(name_raw)

            results.append({
                "station_uid":              uid,
                "station_name":             name,
                "lat":                      slat,
                "lng":                      slng,
                "address":                  addr,
                "maps_url":                 f"https://www.google.com/maps?q={slat},{slng}",
                "distance_m":               round(_dist_m(lat, lng, slat, slng)),
                "available_bikes":          av.get("AvailableRentBikes", 0),
                "available_electric_bikes": detail.get("ElectricBikes", 0),
                "available_docks":          av.get("AvailableReturnBikes", 0),
                "capacity":                 s.get("BikesCapacity", 0),
                "service_status":           av.get("ServiceStatus", -1),
            })

        results.sort(key=lambda x: x["distance_m"])
        return results
