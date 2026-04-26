"""
repository/json_repo.py — JSON-file-backed implementation of UserRepository.

Each user is stored as <USERS_DIR>/<user_id>.json using the serialisation
defined in UserPreference.save() / UserPreference.load().
"""

from __future__ import annotations

import json
import os

from .base import UserRepository


class JsonUserRepository(UserRepository):

    def __init__(self, users_dir: str):
        self._users_dir = users_dir
        os.makedirs(users_dir, exist_ok=True)

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _path(self, user_id: str) -> str:
        return os.path.join(self._users_dir, f"{user_id}.json")

    def _auth_accounts_path(self) -> str:
        return os.path.join(self._users_dir, "_auth_accounts.json")

    def _auth_sessions_path(self) -> str:
        return os.path.join(self._users_dir, "_auth_sessions.json")

    @staticmethod
    def _load_json(path: str, default: dict) -> dict:
        if not os.path.exists(path):
            return default.copy()
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return data
        return default.copy()

    @staticmethod
    def _save_json(path: str, data: dict) -> None:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

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

    # ── Auth account methods ─────────────────────────────────────────────────

    def auth_account_exists(self, user_id: str) -> bool:
        accounts = self._load_json(self._auth_accounts_path(), {})
        return user_id in accounts

    def create_auth_account(self, user_id: str, password_hash: str, created_at: str) -> None:
        accounts = self._load_json(self._auth_accounts_path(), {})
        if user_id in accounts:
            raise ValueError(f"Auth account '{user_id}' already exists.")

        accounts[user_id] = {
            "password_hash": password_hash,
            "created_at": created_at,
            "updated_at": created_at,
        }
        self._save_json(self._auth_accounts_path(), accounts)

    def get_auth_password_hash(self, user_id: str) -> str:
        accounts = self._load_json(self._auth_accounts_path(), {})
        row = accounts.get(user_id)
        if not row:
            raise KeyError(f"Auth account '{user_id}' not found.")
        return str(row.get("password_hash", ""))

    # ── Auth session methods ─────────────────────────────────────────────────

    def create_auth_session(self, session: dict) -> None:
        sessions = self._load_json(self._auth_sessions_path(), {})
        session_id = str(session["session_id"])
        sessions[session_id] = session
        self._save_json(self._auth_sessions_path(), sessions)

    def get_auth_session_by_access_hash(self, access_token_hash: str) -> dict | None:
        sessions = self._load_json(self._auth_sessions_path(), {})
        for row in sessions.values():
            if row.get("access_token_hash") == access_token_hash:
                return dict(row)
        return None

    def get_auth_session_by_refresh_hash(self, refresh_token_hash: str) -> dict | None:
        sessions = self._load_json(self._auth_sessions_path(), {})
        for row in sessions.values():
            if row.get("refresh_token_hash") == refresh_token_hash:
                return dict(row)
        return None

    def rotate_auth_session_tokens(
        self,
        session_id: str,
        access_token_hash: str,
        refresh_token_hash: str,
        access_expires_at: str,
        refresh_expires_at: str,
        updated_at: str,
    ) -> None:
        sessions = self._load_json(self._auth_sessions_path(), {})
        row = sessions.get(session_id)
        if not row:
            raise KeyError(f"Session '{session_id}' not found.")

        row.update(
            {
                "access_token_hash": access_token_hash,
                "refresh_token_hash": refresh_token_hash,
                "access_expires_at": access_expires_at,
                "refresh_expires_at": refresh_expires_at,
                "updated_at": updated_at,
                "revoked": False,
            }
        )
        sessions[session_id] = row
        self._save_json(self._auth_sessions_path(), sessions)

    def revoke_auth_session_by_access_hash(self, access_token_hash: str, updated_at: str) -> bool:
        sessions = self._load_json(self._auth_sessions_path(), {})
        changed = False
        for session_id, row in sessions.items():
            if row.get("access_token_hash") == access_token_hash:
                row["revoked"] = True
                row["updated_at"] = updated_at
                sessions[session_id] = row
                changed = True
        if changed:
            self._save_json(self._auth_sessions_path(), sessions)
        return changed

    def revoke_auth_session_by_refresh_hash(self, refresh_token_hash: str, updated_at: str) -> bool:
        sessions = self._load_json(self._auth_sessions_path(), {})
        changed = False
        for session_id, row in sessions.items():
            if row.get("refresh_token_hash") == refresh_token_hash:
                row["revoked"] = True
                row["updated_at"] = updated_at
                sessions[session_id] = row
                changed = True
        if changed:
            self._save_json(self._auth_sessions_path(), sessions)
        return changed
