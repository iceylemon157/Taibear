"""
realtime_monitor/fetchers/base.py — Abstract base class for data fetchers.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class DataFetcher(ABC):

    @abstractmethod
    def fetch(self, lat: float, lng: float) -> dict[str, Any]:
        """
        Fetch real-time data for a given coordinate.

        Returns a raw dict that the caller (RealtimeClient) will parse into
        a typed model (WeatherData, TrafficData, etc.).
        """
        ...
