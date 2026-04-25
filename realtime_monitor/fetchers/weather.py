"""
realtime_monitor/fetchers/weather.py — CWA (Central Weather Administration) weather fetcher.

Hits the CWA Open Data API to get township-level weather forecasts for Taipei.
Dataset: F-D0047-061 (臺北市未來2天天氣預報)

Elements (Chinese API names → English value keys):
  - 3小時降雨機率  → ProbabilityOfPrecipitation (%)
  - 天氣現象       → Weather (description string) + WeatherCode
  - 溫度           → Temperature (°C)
  - 體感溫度       → ApparentTemperature (°C)
  - 舒適度指數     → ComfortIndex + ComfortIndexDescription
"""

from __future__ import annotations

import math
from typing import Any

import requests

from .base import DataFetcher
from ..config import CWA_API_KEY, CWA_BASE_URL, CWA_FORECAST_DATASET, REQUEST_TIMEOUT_SECS

# ── Taipei district ↔ rough bounding boxes ────────────────────────────────────
# Used to map a lat/lng to the closest CWA district name.
# Centre-of-district coordinates (approximate).
_TAIPEI_DISTRICTS: dict[str, tuple[float, float]] = {
    "中正區": (25.0320, 121.5180),
    "大同區": (25.0630, 121.5130),
    "中山區": (25.0690, 121.5370),
    "松山區": (25.0500, 121.5580),
    "大安區": (25.0260, 121.5430),
    "萬華區": (25.0300, 121.4980),
    "信義區": (25.0300, 121.5710),
    "士林區": (25.0930, 121.5250),
    "北投區": (25.1320, 121.5060),
    "內湖區": (25.0690, 121.5880),
    "南港區": (25.0420, 121.6060),
    "文山區": (24.9890, 121.5710),
}


def _closest_district(lat: float, lng: float) -> str:
    """Return the Taipei district name closest to the given coordinates."""
    best, best_dist = "中山區", float("inf")
    for name, (d_lat, d_lng) in _TAIPEI_DISTRICTS.items():
        dist = math.hypot(lat - d_lat, lng - d_lng)
        if dist < best_dist:
            best, best_dist = name, dist
    return best


class WeatherFetcher(DataFetcher):

    def __init__(self, api_key: str = ""):
        self._api_key = api_key or CWA_API_KEY

    def fetch(self, lat: float, lng: float) -> dict[str, Any]:
        """
        Fetch CWA forecast for the Taipei district nearest to (lat, lng).

        Returns raw API response dict.  The RealtimeClient parses it.
        """
        if not self._api_key:
            raise RuntimeError("CWA API key not configured. Set CWA_API_KEY or populate weather_auth_code.")

        district = _closest_district(lat, lng)

        url = (
            f"{CWA_BASE_URL}/v1/rest/datastore/{CWA_FORECAST_DATASET}"
            f"?Authorization={self._api_key}"
            f"&LocationName={district}"
        )

        resp = requests.get(url, timeout=REQUEST_TIMEOUT_SECS)
        resp.raise_for_status()
        data = resp.json()

        # Attach the resolved district so the caller knows which area it got
        data["_resolved_district"] = district
        return data

    @staticmethod
    def parse(raw: dict) -> list[dict[str, Any]]:
        """
        Parse the CWA response into a flat list of forecast periods.

        Each item: {district, rain_prob_pct, description, temperature,
                    apparent_temp, comfort, forecast_start, forecast_end}
        """
        district = raw.get("_resolved_district", "")
        records = raw.get("records", {})
        locations = records.get("Locations", [{}])

        if not locations:
            return []

        loc_data = locations[0].get("Location", [])
        if not loc_data:
            return []

        # Build a map: element_name → list of time entries
        elements: dict[str, list[dict]] = {}
        for elem in loc_data[0].get("WeatherElement", []):
            name = elem.get("ElementName", "")
            elements[name] = elem.get("Time", [])

        # Use rain probability as the base timeline (3-hour slots)
        rain_times = elements.get("3小時降雨機率", [])
        wx_times = elements.get("天氣現象", [])
        temp_times = elements.get("溫度", [])
        at_times = elements.get("體感溫度", [])
        ci_times = elements.get("舒適度指數", [])

        results = []
        for i, rain_entry in enumerate(rain_times):
            ev = rain_entry.get("ElementValue", [{}])[0]
            rain_val = ev.get("ProbabilityOfPrecipitation", "0")

            wx_desc = ""
            if i < len(wx_times):
                wx_ev = wx_times[i].get("ElementValue", [{}])[0]
                wx_desc = wx_ev.get("Weather", "")

            temp = ""
            if i < len(temp_times):
                t_ev = temp_times[i].get("ElementValue", [{}])[0]
                temp = t_ev.get("Temperature", "")

            apparent = ""
            if i < len(at_times):
                at_ev = at_times[i].get("ElementValue", [{}])[0]
                apparent = at_ev.get("ApparentTemperature", "")

            comfort = ""
            if i < len(ci_times):
                ci_ev = ci_times[i].get("ElementValue", [{}])[0]
                comfort = ci_ev.get("ComfortIndexDescription", "")

            results.append({
                "district":         district,
                "rain_prob_pct":    int(rain_val) if rain_val.isdigit() else 0,
                "description":      wx_desc,
                "temperature_low":  int(temp) if temp.lstrip("-").isdigit() else 0,
                "temperature_high": int(apparent) if apparent.lstrip("-").isdigit() else 0,
                "comfort":          comfort,
                "forecast_start":   rain_entry.get("StartTime", ""),
                "forecast_end":     rain_entry.get("EndTime", ""),
            })

        return results
