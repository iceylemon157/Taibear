"""
auth_service.py — Authentication and session service for User Profile Manager.

Implements:
- register (create account + profile)
- login (verify password)
- refresh (rotate tokens)
- logout (revoke session)
- me (resolve current user from access token)
"""

from __future__ import annotations

import base64
import hashlib
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone


class AuthService:

    def __init__(
        self,
        repo,
        user_service,
        access_ttl_seconds: int = 60 * 30,
        refresh_ttl_seconds: int = 60 * 60 * 24 * 14,
    ):
        self._repo = repo
        self._user_service = user_service
        self._access_ttl_seconds = access_ttl_seconds
        self._refresh_ttl_seconds = refresh_ttl_seconds

    # ── Public API ────────────────────────────────────────────────────────────

    def register(
        self,
        *,
        user_id: str,
        password: str,
        display_name: str,
        country: str = "",
        preferred_languages: list[str] | None = None,
        age: int = 0,
        preferred_transportation: list[str] | None = None,
        selected_tags: list[str] | None = None,
    ) -> dict:
        user_id = user_id.strip().lower()
        display_name = display_name.strip()

        self._validate_user_id(user_id)
        self._validate_password(password)

        if self._repo.auth_account_exists(user_id):
            raise ValueError(f"User '{user_id}' already exists.")

        now_iso = self._now_iso()
        password_hash = self._hash_password(password)
        self._repo.create_auth_account(user_id, password_hash, now_iso)

        try:
            profile = self._user_service.get_user(user_id)
            if display_name and profile.display_name != display_name:
                profile = self._user_service.update_user(user_id, display_name=display_name)
        except KeyError:
            profile = self._user_service.create_user(
                user_id=user_id,
                display_name=display_name or user_id,
                country=country,
                preferred_languages=preferred_languages or [],
                age=age,
                preferred_transportation=preferred_transportation or [],
                selected_tags=selected_tags or [],
            )

        tokens = self._issue_tokens(user_id)
        return {
            **tokens,
            "user": profile.to_dict(),
        }

    def login(self, *, user_id: str, password: str) -> dict:
        user_id = user_id.strip().lower()
        self._validate_user_id(user_id)

        try:
            stored_hash = self._repo.get_auth_password_hash(user_id)
        except KeyError:
            raise ValueError("Invalid email or password.")

        if not self._verify_password(password, stored_hash):
            raise ValueError("Invalid email or password.")

        profile = self._user_service.get_user(user_id)
        tokens = self._issue_tokens(user_id)
        return {
            **tokens,
            "user": profile.to_dict(),
        }

    def me(self, *, access_token: str) -> dict:
        session = self._validate_access_token(access_token)
        profile = self._user_service.get_user(session["user_id"])
        return profile.to_dict()

    def refresh(self, *, refresh_token: str) -> dict:
        session = self._validate_refresh_token(refresh_token)

        now = datetime.now(timezone.utc)
        now_iso = self._datetime_to_iso(now)

        new_access_token = self._generate_token()
        new_refresh_token = self._generate_token()

        access_expires_at = now + timedelta(seconds=self._access_ttl_seconds)
        refresh_expires_at = now + timedelta(seconds=self._refresh_ttl_seconds)

        self._repo.rotate_auth_session_tokens(
            session_id=session["session_id"],
            access_token_hash=self._hash_token(new_access_token),
            refresh_token_hash=self._hash_token(new_refresh_token),
            access_expires_at=self._datetime_to_iso(access_expires_at),
            refresh_expires_at=self._datetime_to_iso(refresh_expires_at),
            updated_at=now_iso,
        )

        return {
            "access_token": new_access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": self._access_ttl_seconds,
            "refresh_expires_in": self._refresh_ttl_seconds,
        }

    def logout(self, *, access_token: str | None = None, refresh_token: str | None = None) -> bool:
        changed = False
        now_iso = self._now_iso()

        if access_token:
            changed = self._repo.revoke_auth_session_by_access_hash(
                self._hash_token(access_token),
                now_iso,
            ) or changed

        if refresh_token:
            changed = self._repo.revoke_auth_session_by_refresh_hash(
                self._hash_token(refresh_token),
                now_iso,
            ) or changed

        return changed

    # ── Internal helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _validate_user_id(user_id: str) -> None:
        if not user_id:
            raise ValueError("user_id must not be empty.")

    @staticmethod
    def _validate_password(password: str) -> None:
        if len(password) < 6:
            raise ValueError("Password must be at least 6 characters.")

    @staticmethod
    def _datetime_to_iso(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat()

    @staticmethod
    def _iso_to_datetime(value: str) -> datetime:
        return datetime.fromisoformat(value)

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _generate_token() -> str:
        return secrets.token_urlsafe(48)

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @staticmethod
    def _hash_password(password: str) -> str:
        iterations = 210_000
        salt = os.urandom(16)
        digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)

        salt_b64 = base64.urlsafe_b64encode(salt).decode("utf-8")
        digest_b64 = base64.urlsafe_b64encode(digest).decode("utf-8")
        return f"pbkdf2_sha256${iterations}${salt_b64}${digest_b64}"

    @staticmethod
    def _verify_password(password: str, stored_hash: str) -> bool:
        try:
            algorithm, iter_str, salt_b64, digest_b64 = stored_hash.split("$")
            if algorithm != "pbkdf2_sha256":
                return False
            iterations = int(iter_str)
            salt = base64.urlsafe_b64decode(salt_b64.encode("utf-8"))
            expected_digest = base64.urlsafe_b64decode(digest_b64.encode("utf-8"))
        except Exception:
            return False

        actual_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return secrets.compare_digest(actual_digest, expected_digest)

    def _issue_tokens(self, user_id: str) -> dict:
        now = datetime.now(timezone.utc)
        now_iso = self._datetime_to_iso(now)

        session_id = uuid.uuid4().hex
        access_token = self._generate_token()
        refresh_token = self._generate_token()

        access_expires_at = now + timedelta(seconds=self._access_ttl_seconds)
        refresh_expires_at = now + timedelta(seconds=self._refresh_ttl_seconds)

        self._repo.create_auth_session(
            {
                "session_id": session_id,
                "user_id": user_id,
                "access_token_hash": self._hash_token(access_token),
                "refresh_token_hash": self._hash_token(refresh_token),
                "access_expires_at": self._datetime_to_iso(access_expires_at),
                "refresh_expires_at": self._datetime_to_iso(refresh_expires_at),
                "revoked": False,
                "created_at": now_iso,
                "updated_at": now_iso,
            }
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": self._access_ttl_seconds,
            "refresh_expires_in": self._refresh_ttl_seconds,
        }

    def _validate_access_token(self, token: str) -> dict:
        if not token:
            raise ValueError("Missing access token.")

        session = self._repo.get_auth_session_by_access_hash(self._hash_token(token))
        if not session:
            raise ValueError("Invalid access token.")

        if bool(session.get("revoked")):
            raise ValueError("Session has been revoked.")

        expires_at = self._iso_to_datetime(str(session["access_expires_at"]))
        if datetime.now(timezone.utc) >= expires_at.astimezone(timezone.utc):
            raise ValueError("Access token expired.")

        return session

    def _validate_refresh_token(self, token: str) -> dict:
        if not token:
            raise ValueError("Missing refresh token.")

        session = self._repo.get_auth_session_by_refresh_hash(self._hash_token(token))
        if not session:
            raise ValueError("Invalid refresh token.")

        if bool(session.get("revoked")):
            raise ValueError("Session has been revoked.")

        expires_at = self._iso_to_datetime(str(session["refresh_expires_at"]))
        if datetime.now(timezone.utc) >= expires_at.astimezone(timezone.utc):
            raise ValueError("Refresh token expired.")

        return session
