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
class TrafficData:
    """Parsed traffic conditions for a road segment near a location."""
    road_name: str = ""
    avg_speed_kmh: float = 0.0
    congestion_level: str = ""       # "smooth" | "slow" | "congested"
    travel_time_mins: float = 0.0
    raw: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "road_name":        self.road_name,
            "avg_speed_kmh":    self.avg_speed_kmh,
            "congestion_level": self.congestion_level,
            "travel_time_mins": self.travel_time_mins,
        }
