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

    # ── Auth account methods ─────────────────────────────────────────────────

    @abstractmethod
    def auth_account_exists(self, user_id: str) -> bool:
        """Return True if an auth account exists for *user_id*."""
        ...

    @abstractmethod
    def create_auth_account(self, user_id: str, password_hash: str, created_at: str) -> None:
        """Create auth account credentials for *user_id*."""
        ...

    @abstractmethod
    def get_auth_password_hash(self, user_id: str) -> str:
        """Return password hash for *user_id*, or raise KeyError if not found."""
        ...

    # ── Auth session methods ─────────────────────────────────────────────────

    @abstractmethod
    def create_auth_session(self, session: dict) -> None:
        """Persist a newly created auth session record."""
        ...

    @abstractmethod
    def get_auth_session_by_access_hash(self, access_token_hash: str) -> dict | None:
        """Return auth session by access token hash or None if not found."""
        ...

    @abstractmethod
    def get_auth_session_by_refresh_hash(self, refresh_token_hash: str) -> dict | None:
        """Return auth session by refresh token hash or None if not found."""
        ...

    @abstractmethod
    def rotate_auth_session_tokens(
        self,
        session_id: str,
        access_token_hash: str,
        refresh_token_hash: str,
        access_expires_at: str,
        refresh_expires_at: str,
        updated_at: str,
    ) -> None:
        """Rotate access/refresh tokens for an existing session."""
        ...

    @abstractmethod
    def revoke_auth_session_by_access_hash(self, access_token_hash: str, updated_at: str) -> bool:
        """Revoke session matched by access token hash. Return True if a row changed."""
        ...

    @abstractmethod
    def revoke_auth_session_by_refresh_hash(self, refresh_token_hash: str, updated_at: str) -> bool:
        """Revoke session matched by refresh token hash. Return True if a row changed."""
        ...
