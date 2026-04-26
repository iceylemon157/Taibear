"""
realtime_monitor/fetchers/bus.py — Taipei city bus ETA fetcher.

Two-step process:
  1. GET /v2/Bus/Stop/City/Taipei    (spatial) → nearby stop UIDs + positions
  2. GET /v2/Bus/EstimatedTimeOfArrival/City/Taipei ($filter by StopUID) → ETAs

Key API notes discovered from testing:
  - $spatialFilter is NOT supported on the ETA endpoint; must filter by StopUID.
  - EstimateTime is in seconds. StopStatus values:
      0 = normal, 1 = not yet departed from origin, 2 = no data,
      3 = terminal stop, 4 = detour (not serving this stop).
  - A single StopUID can have multiple ETA rows (one per route).
"""

from __future__ import annotations

import math
from typing import Any

import requests

from .base import DataFetcher
from .tdx_auth import TDXAuth
from ..config import TDX_BASE_URL, REQUEST_TIMEOUT_SECS, NEARBY_RADIUS_M, TDX_CLIENT_ID, TDX_CLIENT_SECRET

_MAX_STOPS = 5  # nearest bus stops to consider within the radius


def _dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat = (lat2 - lat1) * 111_320
    dlng = (lng2 - lng1) * 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dlat, dlng)


class BusFetcher(DataFetcher):

    def __init__(self, auth: TDXAuth | None = None):
        self._auth = auth or TDXAuth(TDX_CLIENT_ID, TDX_CLIENT_SECRET)

    def fetch(self, lat: float, lng: float) -> dict[str, Any]:
        """
        Step 1: find nearest bus stops spatially.
        Step 2: fetch ETAs for those stop UIDs.
        Returns a raw dict with 'stops', 'etas', '_lat', '_lng'.
        """
        headers = self._auth.get_headers()

        r1 = requests.get(
            f"{TDX_BASE_URL}/v2/Bus/Stop/City/Taipei",
            headers=headers,
            params={
                "$spatialFilter": f"nearby({lat},{lng},{NEARBY_RADIUS_M})",
                "$top": str(_MAX_STOPS),
                "$format": "JSON",
            },
            timeout=REQUEST_TIMEOUT_SECS,
        )
        r1.raise_for_status()
        stops: list[dict] = r1.json()

        etas: list[dict] = []
        if stops:
            uid_filter = " or ".join(
                f"StopUID eq '{s['StopUID']}'" for s in stops
            )
            r2 = requests.get(
                f"{TDX_BASE_URL}/v2/Bus/EstimatedTimeOfArrival/City/Taipei",
                headers=headers,
                params={"$filter": uid_filter, "$format": "JSON"},
                timeout=REQUEST_TIMEOUT_SECS,
            )
            r2.raise_for_status()
            etas = r2.json()

        return {"stops": stops, "etas": etas, "_lat": lat, "_lng": lng}

    @staticmethod
    def parse(raw: dict) -> list[dict[str, Any]]:
        """
        Join stop positions with ETA rows.
        Returns a flat list sorted by (distance_m, eta_mins).
        eta_mins is -1 when EstimateTime is unavailable.
        """
        lat, lng = raw["_lat"], raw["_lng"]
        stops: dict[str, dict] = {s["StopUID"]: s for s in raw.get("stops", [])}

        results = []
        for entry in raw.get("etas", []):
            uid = entry.get("StopUID", "")
            stop = stops.get(uid, {})
            pos = stop.get("StopPosition", {})
            slat = pos.get("PositionLat", lat)
            slng = pos.get("PositionLon", lng)
            eta_secs = entry.get("EstimateTime", -1)
            results.append({
                "stop_uid":    uid,
                "stop_name":   entry.get("StopName", {}).get("Zh_tw", ""),
                "route_name":  entry.get("RouteName", {}).get("Zh_tw", ""),
                "direction":   entry.get("Direction", 0),
                "eta_mins":    round(eta_secs / 60) if eta_secs >= 0 else -1,
                "stop_status": entry.get("StopStatus", 2),
                "distance_m":  round(_dist_m(lat, lng, slat, slng)),
            })

        results.sort(key=lambda x: (x["distance_m"], x["eta_mins"] if x["eta_mins"] >= 0 else 9999))
        return results
