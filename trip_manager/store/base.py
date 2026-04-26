"""
trip_manager/store/base.py — TripStore abstract base class.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class TripStore(ABC):

    @abstractmethod
    def get(self, trip_id: str):
        """Return a Trip for *trip_id*, or raise KeyError."""
        ...

    @abstractmethod
    def save(self, trip) -> None:
        """Persist *trip*.  Creates if new; overwrites if exists."""
        ...

    @abstractmethod
    def delete(self, trip_id: str) -> None:
        """Remove trip.  Raises KeyError if not found."""
        ...

    @abstractmethod
    def list_all(self) -> list[str]:
        """Return sorted list of all trip_ids."""
        ...

    @abstractmethod
    def list_by_user(self, user_id: str) -> list[str]:
        """Return sorted list of trip_ids belonging to *user_id*."""
        ...
