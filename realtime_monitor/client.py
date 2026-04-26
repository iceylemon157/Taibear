"""
realtime_monitor/client.py — Facade for all real-time data fetchers.

Usage:
    from realtime_monitor.client import RealtimeClient

    client = RealtimeClient()
    weather = client.get_weather(lat=25.06, lng=121.52)
    mrt     = client.get_mrt(lat=25.06, lng=121.52)
    bus     = client.get_bus(lat=25.06, lng=121.52)
    ubike   = client.get_ubike(lat=25.06, lng=121.52)
"""

from __future__ import annotations

from datetime import datetime

from .config import CWA_API_KEY, TDX_CLIENT_ID, TDX_CLIENT_SECRET
from .fetchers.tdx_auth import TDXAuth
from .fetchers.weather import WeatherFetcher
from .fetchers.mrt import MRTFetcher
from .fetchers.bus import BusFetcher
from .fetchers.ubike import UBikeFetcher
from .models import WeatherData, MRTData, BusData, UBikeData


class RealtimeClient:

    def __init__(self):
        self._weather = WeatherFetcher(api_key=CWA_API_KEY)
        # Share one TDXAuth instance across all TDX fetchers to minimise token requests.
        _tdx = TDXAuth(TDX_CLIENT_ID, TDX_CLIENT_SECRET)
        self._mrt = MRTFetcher(auth=_tdx)
        self._bus = BusFetcher(auth=_tdx)
        self._ubike = UBikeFetcher(auth=_tdx)

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

    def get_mrt(self, lat: float, lng: float) -> list[MRTData]:
        """
        Fetch next MRT arrivals at TRTC stations within the configured radius.
        Returns a list sorted by (distance_m, eta_mins).
        """
        raw = self._mrt.fetch(lat, lng)
        return [
            MRTData(
                station_name=p["station_name"],
                line_id=p["line_id"],
                line_name=p["line_name"],
                direction=p["direction"],
                destination=p["destination"],
                eta_mins=p["eta_mins"],
                distance_m=p["distance_m"],
                raw=p,
            )
            for p in MRTFetcher.parse(raw)
        ]

    def get_bus(self, lat: float, lng: float) -> list[BusData]:
        """
        Fetch upcoming bus arrivals at stops within the configured radius.
        Returns a list sorted by (distance_m, eta_mins).
        """
        raw = self._bus.fetch(lat, lng)
        return [
            BusData(
                stop_name=p["stop_name"],
                route_name=p["route_name"],
                direction=p["direction"],
                eta_mins=p["eta_mins"],
                stop_status=p["stop_status"],
                distance_m=p["distance_m"],
                raw=p,
            )
            for p in BusFetcher.parse(raw)
        ]

    def get_ubike(self, lat: float, lng: float) -> list[UBikeData]:
        """
        Fetch nearby YouBike station availability within the configured radius.
        Returns a list sorted by distance_m ascending.
        """
        raw = self._ubike.fetch(lat, lng)
        return [
            UBikeData(
                station_uid=p["station_uid"],
                station_name=p["station_name"],
                lat=p["lat"],
                lng=p["lng"],
                address=p["address"],
                maps_url=p["maps_url"],
                distance_m=p["distance_m"],
                available_bikes=p["available_bikes"],
                available_electric_bikes=p["available_electric_bikes"],
                available_docks=p["available_docks"],
                capacity=p["capacity"],
                service_status=p["service_status"],
                raw=p,
            )
            for p in UBikeFetcher.parse(raw)
        ]
