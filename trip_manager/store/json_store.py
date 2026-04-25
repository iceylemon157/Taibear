"""
trip_manager/store/json_store.py — JSON-file-backed TripStore.

Each trip is stored as <trips_dir>/<trip_id>.json.
"""

from __future__ import annotations

import json
import os

from .base import TripStore
from ..models.trip import Trip


class JsonTripStore(TripStore):

    def __init__(self, trips_dir: str):
        self._trips_dir = trips_dir
        os.makedirs(trips_dir, exist_ok=True)

    def _path(self, trip_id: str) -> str:
        return os.path.join(self._trips_dir, f"{trip_id}.json")

    def get(self, trip_id: str) -> Trip:
        path = self._path(trip_id)
        if not os.path.exists(path):
            raise KeyError(f"Trip '{trip_id}' not found.")
        return Trip.load(path)

    def save(self, trip: Trip) -> None:
        trip.save(self._path(trip.trip_id))

    def delete(self, trip_id: str) -> None:
        path = self._path(trip_id)
        if not os.path.exists(path):
            raise KeyError(f"Trip '{trip_id}' not found.")
        os.remove(path)

    def list_all(self) -> list[str]:
        if not os.path.isdir(self._trips_dir):
            return []
        return sorted(
            f[:-5]
            for f in os.listdir(self._trips_dir)
            if f.endswith(".json")
        )

    def list_by_user(self, user_id: str) -> list[str]:
        result = []
        for trip_id in self.list_all():
            try:
                trip = self.get(trip_id)
                if trip.user_id == user_id:
                    result.append(trip_id)
            except (KeyError, json.JSONDecodeError):
                continue
        return result
