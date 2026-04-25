"""
realtime_monitor/client.py — Facade for all real-time data fetchers.

Usage:
    from realtime_monitor.client import RealtimeClient

    client = RealtimeClient()
    weather = client.get_weather(lat=25.06, lng=121.52)
    traffic = client.get_traffic(lat=25.06, lng=121.52)  # raises until TDX is implemented
"""

from __future__ import annotations

from datetime import datetime

from .config import CWA_API_KEY, TDX_CLIENT_ID, TDX_CLIENT_SECRET
from .fetchers.weather import WeatherFetcher
from .fetchers.traffic import TrafficFetcher
from .models import WeatherData, TrafficData


class RealtimeClient:

    def __init__(self):
        self._weather = WeatherFetcher(api_key=CWA_API_KEY)
        self._traffic = TrafficFetcher(
            client_id=TDX_CLIENT_ID,
            client_secret=TDX_CLIENT_SECRET,
        )

    def get_weather(self, lat: float, lng: float) -> WeatherData:
        """
        Fetch weather forecast for the district closest to (lat, lng).

        Returns the forecast period that covers the current time (or the
        nearest upcoming period if none covers "now").
        """
        raw = self._weather.fetch(lat, lng)
        periods = WeatherFetcher.parse(raw)

        if not periods:
            return WeatherData(raw=raw)

        # Pick the period whose time range covers "now", or the first one
        now = datetime.now().isoformat()
        best = periods[0]
        for p in periods:
            if p.get("forecast_start", "") <= now <= p.get("forecast_end", ""):
                best = p
                break

        return WeatherData(
            district=best.get("district", ""),
            rain_prob_pct=best.get("rain_prob_pct", 0),
            description=best.get("description", ""),
            temperature_low=best.get("temperature_low", 0),
            temperature_high=best.get("temperature_high", 0),
            comfort=best.get("comfort", ""),
            forecast_start=best.get("forecast_start", ""),
            forecast_end=best.get("forecast_end", ""),
            raw=raw,
        )

    def get_traffic(self, lat: float, lng: float) -> TrafficData:
        """
        Fetch traffic data near (lat, lng).
        Currently raises NotImplementedError until TDX is wired up.
        """
        raw = self._traffic.fetch(lat, lng)
        # TODO: parse raw TDX response into TrafficData
        return TrafficData(raw=raw)
