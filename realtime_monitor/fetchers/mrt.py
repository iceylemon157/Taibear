"""
realtime_monitor/fetchers/mrt.py — TRTC MRT live arrival fetcher.

Two-step process:
  1. GET /v2/Rail/Metro/Station/TRTC  (spatial) → nearest stations + StationIDs
  2. GET /v2/Rail/Metro/LiveBoard/TRTC ($filter by StationID) → next train ETAs

Key API notes discovered from testing:
  - LiveBoard must be filtered by StationID (e.g. "BL12"), NOT StationUID ("TRTC-BL12").
  - EstimateTime is in seconds; 0 means the train is at/has just left the station.
  - Multiple entries per station are possible (one per direction/line).
"""

from __future__ import annotations

import math
from typing import Any

import requests

from .base import DataFetcher
from .tdx_auth import TDXAuth
from ..config import TDX_BASE_URL, REQUEST_TIMEOUT_SECS, NEARBY_RADIUS_M, TDX_CLIENT_ID, TDX_CLIENT_SECRET

_MAX_STATIONS = 3  # nearest MRT stations to consider within the radius


def _dist_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    dlat = (lat2 - lat1) * 111_320
    dlng = (lng2 - lng1) * 111_320 * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dlat, dlng)


class MRTFetcher(DataFetcher):

    def __init__(self, auth: TDXAuth | None = None):
        self._auth = auth or TDXAuth(TDX_CLIENT_ID, TDX_CLIENT_SECRET)

    def fetch(self, lat: float, lng: float) -> dict[str, Any]:
        """
        Step 1: find nearest MRT stations spatially.
        Step 2: fetch live board for those station IDs.
        Returns a raw dict with 'stations', 'liveboards', '_lat', '_lng'.
        """
        headers = self._auth.get_headers()

        r1 = requests.get(
            f"{TDX_BASE_URL}/v2/Rail/Metro/Station/TRTC",
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

        liveboards: list[dict] = []
        if stations:
            id_filter = " or ".join(
                f"StationID eq '{s['StationID']}'" for s in stations
            )
            r2 = requests.get(
                f"{TDX_BASE_URL}/v2/Rail/Metro/LiveBoard/TRTC",
                headers=headers,
                params={"$filter": id_filter, "$format": "JSON"},
                timeout=REQUEST_TIMEOUT_SECS,
            )
            r2.raise_for_status()
            liveboards = r2.json()

        return {"stations": stations, "liveboards": liveboards, "_lat": lat, "_lng": lng}

    @staticmethod
    def parse(raw: dict) -> list[dict[str, Any]]:
        """
        Join station positions with live board arrivals.
        Returns a flat list sorted by (distance_m, eta_mins).
        """
        lat, lng = raw["_lat"], raw["_lng"]
        stations: dict[str, dict] = {s["StationID"]: s for s in raw.get("stations", [])}

        results = []
        for entry in raw.get("liveboards", []):
            sid = entry.get("StationID", "")
            station = stations.get(sid, {})
            pos = station.get("StationPosition", {})
            slat = pos.get("PositionLat", lat)
            slng = pos.get("PositionLon", lng)
            eta_secs = entry.get("EstimateTime", 0)
            results.append({
                "station_id":   sid,
                "station_name": entry.get("StationName", {}).get("Zh_tw", ""),
                "line_id":      entry.get("LineID", ""),
                "line_name":    entry.get("LineName", {}).get("Zh_tw", ""),
                "direction":    entry.get("TripHeadSign", ""),
                "destination":  entry.get("DestinationStationName", {}).get("Zh_tw", ""),
                "eta_mins":     round(eta_secs / 60) if eta_secs > 0 else 0,
                "distance_m":   round(_dist_m(lat, lng, slat, slng)),
            })

        results.sort(key=lambda x: (x["distance_m"], x["eta_mins"]))
        return results
