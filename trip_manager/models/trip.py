"""
trip_manager/models/trip.py — Core data models for a managed trip.

Derived from route_choice_sample.json. A Trip wraps the user's chosen route
and adds stateful fields (status, alerts, timestamps) for lifecycle management.
"""

from __future__ import annotations

import json
import os
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any


# ── Enums ─────────────────────────────────────────────────────────────────────

class TripStatus(str, Enum):
    PLANNED    = "planned"
    ACTIVE     = "active"
    DISRUPTED  = "disrupted"
    REPLANNING = "replanning"
    COMPLETED  = "completed"
    CANCELLED  = "cancelled"


class StopStatus(str, Enum):
    PENDING   = "pending"
    ACTIVE    = "active"
    COMPLETED = "completed"
    SKIPPED   = "skipped"


# ── Value objects ─────────────────────────────────────────────────────────────

@dataclass
class Location:
    lat: float
    lng: float


@dataclass
class TspEvaluation:
    total_transit_time_mins: int
    smoothness_score: float


# ── TripStop ──────────────────────────────────────────────────────────────────

@dataclass
class TripStop:
    stop_id: str
    step_order: int
    name: str
    place_id: str
    location: Location
    suggested_time: str
    reasoning: str
    status: StopStatus = StopStatus.PENDING

    def to_dict(self) -> dict:
        return {
            "stop_id":        self.stop_id,
            "step_order":     self.step_order,
            "name":           self.name,
            "place_id":       self.place_id,
            "location":       {"lat": self.location.lat, "lng": self.location.lng},
            "suggested_time": self.suggested_time,
            "reasoning":      self.reasoning,
            "status":         self.status.value,
        }

    @staticmethod
    def from_dict(d: dict) -> TripStop:
        loc = d.get("location", {})
        return TripStop(
            stop_id=d.get("stop_id", ""),
            step_order=d.get("step_order", 0),
            name=d.get("name", ""),
            place_id=d.get("place_id", ""),
            location=Location(lat=loc.get("lat", 0.0), lng=loc.get("lng", 0.0)),
            suggested_time=d.get("suggested_time", ""),
            reasoning=d.get("reasoning", ""),
            status=StopStatus(d.get("status", "pending")),
        )

    @staticmethod
    def from_waypoint(waypoint: dict, trip_id: str) -> TripStop:
        """Create a TripStop from a route_choice_sample waypoint dict."""
        loc = waypoint.get("location", {})
        return TripStop(
            stop_id=f"{trip_id}_stop_{waypoint['step_order']}",
            step_order=waypoint["step_order"],
            name=waypoint["name"],
            place_id=waypoint.get("place_id", ""),
            location=Location(lat=loc.get("lat", 0.0), lng=loc.get("lng", 0.0)),
            suggested_time=waypoint.get("suggested_time", ""),
            reasoning=waypoint.get("reasoning", ""),
        )


# ── Trip ──────────────────────────────────────────────────────────────────────

@dataclass
class Trip:
    trip_id: str
    user_id: str
    trip_date: str                                   # YYYY-MM-DD
    status: TripStatus = TripStatus.PLANNED
    route_name: str = ""
    theme: str = ""
    tsp_evaluation: TspEvaluation | None = None
    google_maps_url: str = ""
    original_route_id: str = ""
    stops: list[TripStop] = field(default_factory=list)
    active_alerts: list[dict] = field(default_factory=list)  # serialised DisruptionAlerts
    created_at: str = ""
    updated_at: str = ""

    # ── Factory ───────────────────────────────────────────────────────────────

    @staticmethod
    def from_chosen_route(user_id: str, trip_date: str, route: dict) -> Trip:
        """
        Build a Trip from a single route object inside route_choice_sample.json.

        Args:
            user_id:   owner of the trip
            trip_date: YYYY-MM-DD
            route:     one element from recommended_routes[]
        """
        trip_id = uuid.uuid4().hex[:12]
        now = datetime.now(timezone.utc).isoformat()

        tsp_raw = route.get("tsp_evaluation")
        tsp = TspEvaluation(**tsp_raw) if tsp_raw else None

        stops = [
            TripStop.from_waypoint(wp, trip_id)
            for wp in route.get("waypoints", [])
        ]

        return Trip(
            trip_id=trip_id,
            user_id=user_id,
            trip_date=trip_date,
            route_name=route.get("route_name", ""),
            theme=route.get("theme", ""),
            tsp_evaluation=tsp,
            google_maps_url=route.get("google_maps_url", ""),
            original_route_id=route.get("route_id", ""),
            stops=stops,
            created_at=now,
            updated_at=now,
        )

    # ── Derived helpers ───────────────────────────────────────────────────────

    def remaining_stops(self) -> list[TripStop]:
        """Return stops that are still pending or active (not done/skipped)."""
        return [s for s in self.stops if s.status in (StopStatus.PENDING, StopStatus.ACTIVE)]

    def is_all_done(self) -> bool:
        """True when every stop is completed or skipped."""
        return all(s.status in (StopStatus.COMPLETED, StopStatus.SKIPPED) for s in self.stops)

    def touch(self) -> None:
        self.updated_at = datetime.now(timezone.utc).isoformat()

    # ── Serialisation ─────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "trip_id":           self.trip_id,
            "user_id":           self.user_id,
            "trip_date":         self.trip_date,
            "status":            self.status.value,
            "route_name":        self.route_name,
            "theme":             self.theme,
            "tsp_evaluation":    asdict(self.tsp_evaluation) if self.tsp_evaluation else None,
            "google_maps_url":   self.google_maps_url,
            "original_route_id": self.original_route_id,
            "stops":             [s.to_dict() for s in self.stops],
            "active_alerts":     self.active_alerts,
            "created_at":        self.created_at,
            "updated_at":        self.updated_at,
        }

    @staticmethod
    def from_dict(d: dict) -> Trip:
        tsp_raw = d.get("tsp_evaluation")
        tsp = TspEvaluation(**tsp_raw) if tsp_raw else None
        return Trip(
            trip_id=d.get("trip_id", ""),
            user_id=d.get("user_id", ""),
            trip_date=d.get("trip_date", ""),
            status=TripStatus(d.get("status", "planned")),
            route_name=d.get("route_name", ""),
            theme=d.get("theme", ""),
            tsp_evaluation=tsp,
            google_maps_url=d.get("google_maps_url", ""),
            original_route_id=d.get("original_route_id", ""),
            stops=[TripStop.from_dict(s) for s in d.get("stops", [])],
            active_alerts=d.get("active_alerts", []),
            created_at=d.get("created_at", ""),
            updated_at=d.get("updated_at", ""),
        )

    # ── File I/O ──────────────────────────────────────────────────────────────

    @staticmethod
    def load(path: str) -> Trip:
        with open(path, encoding="utf-8") as f:
            return Trip.from_dict(json.load(f))

    def save(self, path: str) -> None:
        self.touch()
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_dict(), f, ensure_ascii=False, indent=2)
