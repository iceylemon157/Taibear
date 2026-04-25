"""
realtime_monitor/models.py — Data models for real-time fetcher results.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class WeatherData:
    """Parsed weather forecast for a location/district."""
    district: str = ""               # e.g. "中山區"
    rain_prob_pct: int = 0           # 0-100 probability of rain
    description: str = ""            # e.g. "陰短暫陣雨"
    temperature_low: int = 0         # °C
    temperature_high: int = 0        # °C
    comfort: str = ""                # e.g. "悶熱"
    forecast_start: str = ""         # ISO timestamp of forecast period start
    forecast_end: str = ""           # ISO timestamp of forecast period end
    raw: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "district":         self.district,
            "rain_prob_pct":    self.rain_prob_pct,
            "description":      self.description,
            "temperature_low":  self.temperature_low,
            "temperature_high": self.temperature_high,
            "comfort":          self.comfort,
            "forecast_start":   self.forecast_start,
            "forecast_end":     self.forecast_end,
        }


@dataclass
class MRTData:
    """Next MRT arrival at a station near the queried location."""
    station_name: str = ""           # e.g. "台北車站"
    line_id: str = ""                # e.g. "BL"
    line_name: str = ""              # e.g. "板南線"
    direction: str = ""              # TripHeadSign e.g. "往南港展覽館"
    destination: str = ""            # DestinationStationName e.g. "南港展覽館"
    eta_mins: int = 0                # 0 = train at/just left station
    distance_m: float = 0.0         # approx metres from queried coordinate
    raw: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "station_name": self.station_name,
            "line_id":      self.line_id,
            "line_name":    self.line_name,
            "direction":    self.direction,
            "destination":  self.destination,
            "eta_mins":     self.eta_mins,
            "distance_m":   self.distance_m,
        }


@dataclass
class BusData:
    """Upcoming bus arrival at a stop near the queried location."""
    stop_name: str = ""              # e.g. "臺北車站(忠孝)"
    route_name: str = ""             # e.g. "299"
    direction: int = 0               # 0 = outbound, 1 = inbound
    eta_mins: int = -1               # -1 = no data available
    stop_status: int = 0             # 0=normal, 1=not-departed, 2=no-data, 3=terminal, 4=detour
    distance_m: float = 0.0         # approx metres from queried coordinate
    raw: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "stop_name":   self.stop_name,
            "route_name":  self.route_name,
            "direction":   self.direction,
            "eta_mins":    self.eta_mins,
            "stop_status": self.stop_status,
            "distance_m":  self.distance_m,
        }


@dataclass
class UBikeData:
    """YouBike 2.0 station with real-time availability near the queried location."""
    station_uid: str = ""            # e.g. "TPE500103037"
    station_name: str = ""           # e.g. "YouBike2.0_太原廣場"
    lat: float = 0.0
    lng: float = 0.0
    address: str = ""                # e.g. "鄭州路23號(旁)"
    maps_url: str = ""               # Google Maps link to station coordinates
    distance_m: float = 0.0         # approx metres from queried coordinate
    available_bikes: int = 0         # total rentable bikes (general + electric)
    available_electric_bikes: int = 0
    available_docks: int = 0         # empty return slots
    capacity: int = 0                # total dock capacity
    service_status: int = -1         # 1 = in service, 0 = not in service
    raw: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "station_uid":              self.station_uid,
            "station_name":             self.station_name,
            "lat":                      self.lat,
            "lng":                      self.lng,
            "address":                  self.address,
            "maps_url":                 self.maps_url,
            "distance_m":               self.distance_m,
            "available_bikes":          self.available_bikes,
            "available_electric_bikes": self.available_electric_bikes,
            "available_docks":          self.available_docks,
            "capacity":                 self.capacity,
            "service_status":           self.service_status,
        }
