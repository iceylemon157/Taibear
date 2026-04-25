"""
repository/base.py — UserRepository abstract base class.

All storage implementations (JSON, DB, etc.) must subclass this.
The service layer depends only on this interface, never on a concrete class.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class UserRepository(ABC):

    @abstractmethod
    def get(self, user_id: str):
        """Return a UserPreference for *user_id*, or raise KeyError if not found."""
        ...

    @abstractmethod
    def save(self, pref) -> None:
        """
        Persist *pref* (UserPreference).
        Creates the record if it does not exist; overwrites if it does.
        """
        ...

    @abstractmethod
    def delete(self, user_id: str) -> None:
        """Remove the record for *user_id*.  Raises KeyError if not found."""
        ...

    @abstractmethod
    def list_all(self) -> list[str]:
        """Return a sorted list of all stored user_ids."""
        ...
