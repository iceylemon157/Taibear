"""
realtime_monitor/fetchers/tdx_auth.py — TDX OAuth2 client credentials with in-memory token caching.

All TDX-backed fetchers share one TDXAuth instance (created in RealtimeClient)
so only one token request is made per expiry window.
"""

from __future__ import annotations

import time

import requests

from ..config import TDX_AUTH_URL, REQUEST_TIMEOUT_SECS


class TDXAuth:
    """Fetches and caches a TDX Bearer token for the lifetime of the token."""

    def __init__(self, client_id: str, client_secret: str):
        self._client_id = client_id
        self._client_secret = client_secret
        self._token: str = ""
        self._expires_at: float = 0.0

    def get_headers(self) -> dict[str, str]:
        """Return Authorization + Accept headers, refreshing the token if needed."""
        if time.time() >= self._expires_at - 30:
            self._refresh()
        return {
            "Authorization": f"Bearer {self._token}",
            "Accept": "application/json",
        }

    def _refresh(self) -> None:
        resp = requests.post(
            TDX_AUTH_URL,
            data={
                "grant_type": "client_credentials",
                "client_id": self._client_id,
                "client_secret": self._client_secret,
            },
            timeout=REQUEST_TIMEOUT_SECS,
        )
        resp.raise_for_status()
        body = resp.json()
        self._token = body["access_token"]
        self._expires_at = time.time() + body.get("expires_in", 3600)
