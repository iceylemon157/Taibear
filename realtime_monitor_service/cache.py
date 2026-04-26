"""
realtime_monitor_service/cache.py — Simple in-process TTL cache.

Keyed by arbitrary hashable keys. Entries expire after `ttl_seconds` (default 60).
Thread-safe via a threading.Lock so it works safely under uvicorn's threaded workers.
"""

from __future__ import annotations

import threading
import time
from typing import Any


class TTLCache:
    """In-memory cache with per-entry TTL expiry."""

    def __init__(self, ttl_seconds: int = 60):
        self._ttl = ttl_seconds
        self._store: dict[Any, tuple[Any, float]] = {}  # key → (value, expires_at)
        self._lock = threading.Lock()

    def get(self, key: Any) -> tuple[bool, Any]:
        """Return (hit, value). hit=False means missing or expired."""
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return False, None
            value, expires_at = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                return False, None
            return True, value

    def set(self, key: Any, value: Any) -> None:
        with self._lock:
            self._store[key] = (value, time.monotonic() + self._ttl)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def stats(self) -> dict:
        """Return current cache size and TTL setting (useful for /health)."""
        with self._lock:
            now = time.monotonic()
            live = sum(1 for _, exp in self._store.values() if exp > now)
        return {"cached_entries": live, "ttl_seconds": self._ttl}
