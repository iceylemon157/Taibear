"""
repository/json_repo.py — JSON-file-backed implementation of UserRepository.

Each user is stored as <USERS_DIR>/<user_id>.json using the serialisation
defined in UserPreference.save() / UserPreference.load().
"""

from __future__ import annotations

import os

from .base import UserRepository


class JsonUserRepository(UserRepository):

    def __init__(self, users_dir: str):
        self._users_dir = users_dir
        os.makedirs(users_dir, exist_ok=True)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _path(self, user_id: str) -> str:
        return os.path.join(self._users_dir, f"{user_id}.json")

    # ── UserRepository interface ──────────────────────────────────────────────

    def get(self, user_id: str):
        from models import UserPreference  # noqa: PLC0415

        path = self._path(user_id)
        if not os.path.exists(path):
            raise KeyError(f"User '{user_id}' not found.")
        return UserPreference.load(path)

    def save(self, pref) -> None:
        pref.save(self._path(pref.user_id))

    def delete(self, user_id: str) -> None:
        path = self._path(user_id)
        if not os.path.exists(path):
            raise KeyError(f"User '{user_id}' not found.")
        os.remove(path)

    def list_all(self) -> list[str]:
        if not os.path.isdir(self._users_dir):
            return []
        return sorted(
            f[:-5]
            for f in os.listdir(self._users_dir)
            if f.endswith(".json") and not f.startswith("_")
        )
