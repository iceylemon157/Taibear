"""
trip_manager/detectors/disruption_detector.py — Rule engine for disruption detection.

Pure logic — no network calls.  Takes a Trip + real-time data and returns
a list of DisruptionAlerts for any stops that are affected.

Thresholds are read from trip_manager.config.
"""

from __future__ import annotations

from datetime import datetime

from ..config import RAIN_TRIGGER_PCT, HEAVY_RAIN_TRIGGER_PCT, JAM_SPEED_KMH
from ..models.trip import Trip, TripStop, StopStatus
from ..models.disruption import DisruptionAlert, AlertType, Severity

from realtime_monitor.client import RealtimeClient
from realtime_monitor.models import WeatherData


class DisruptionDetector:

    def __init__(self, realtime_client: RealtimeClient):
        self._rt = realtime_client

    # ── Individual checks ─────────────────────────────────────────────────────

    def check_weather(self, trip: Trip, weather: WeatherData | None = None) -> list[DisruptionAlert]:
        """
        Check whether weather at upcoming stops triggers a rain alert.

        If *weather* is None, fetches it from the first remaining stop's location.
        All remaining stops in the same district share the same forecast.
        """
        remaining = trip.remaining_stops()
        if not remaining:
            return []

        if weather is None:
            first = remaining[0]
            try:
                weather = self._rt.get_weather(first.location.lat, first.location.lng)
            except Exception:
                return []

        alerts: list[DisruptionAlert] = []
        affected_ids = [s.stop_id for s in remaining]

        if weather.rain_prob_pct >= HEAVY_RAIN_TRIGGER_PCT:
            alerts.append(DisruptionAlert(
                alert_type=AlertType.HEAVY_RAIN,
                severity=Severity.HIGH,
                affected_stop_ids=affected_ids,
                message=(
                    f"{weather.district} 降雨機率 {weather.rain_prob_pct}%，"
                    f"天氣狀況：{weather.description}。建議改為室內行程。"
                ),
                raw_data=weather.to_dict(),
            ))
        elif weather.rain_prob_pct >= RAIN_TRIGGER_PCT:
            alerts.append(DisruptionAlert(
                alert_type=AlertType.RAIN,
                severity=Severity.MEDIUM,
                affected_stop_ids=affected_ids,
                message=(
                    f"{weather.district} 降雨機率 {weather.rain_prob_pct}%，"
                    f"天氣狀況：{weather.description}。請留意天氣變化。"
                ),
                raw_data=weather.to_dict(),
            ))

        return alerts

    def check_traffic(self, trip: Trip, traffic: None = None) -> list[DisruptionAlert]:
        """
        Check whether traffic near upcoming stops is congested.

        Currently a stub — returns empty until TDX is wired.
        """
        remaining = trip.remaining_stops()
        if not remaining:
            return []

        if traffic is None:
            first = remaining[0]
            try:
                traffic = self._rt.get_traffic(first.location.lat, first.location.lng)
            except NotImplementedError:
                return []  # TDX not ready yet
            except Exception:
                return []

        alerts: list[DisruptionAlert] = []

        if traffic.avg_speed_kmh > 0 and traffic.avg_speed_kmh < JAM_SPEED_KMH:
            affected_ids = [s.stop_id for s in remaining[:2]]  # next 2 stops
            alerts.append(DisruptionAlert(
                alert_type=AlertType.CONGESTION,
                severity=Severity.MEDIUM,
                affected_stop_ids=affected_ids,
                message=(
                    f"{traffic.road_name} 平均車速 {traffic.avg_speed_kmh:.0f} km/h，"
                    f"交通壅塞。建議調整交通方式或延後出發。"
                ),
                raw_data=traffic.to_dict(),
            ))

        return alerts

    # ── Combined check ────────────────────────────────────────────────────────

    def detect_all(self, trip: Trip) -> list[DisruptionAlert]:
        """Run all disruption checks and return a combined alert list."""
        alerts: list[DisruptionAlert] = []
        alerts.extend(self.check_weather(trip))
        alerts.extend(self.check_traffic(trip))
        return alerts
