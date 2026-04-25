"""
realtime_monitor_service/routes.py — FastAPI router for the Realtime Monitor service.

Endpoints:
    GET /weather?lat=&lng=
    GET /mrt?lat=&lng=
    GET /bus?lat=&lng=
    GET /ubike?lat=&lng=
    GET /health
    GET /cache/stats
    DELETE /cache  (admin: flush the cache)

All data endpoints cache responses for CACHE_TTL_SECS (default 60 s).
Cache key is (endpoint, rounded_lat, rounded_lng) where coordinates are
rounded to 3 decimal places (~111 m grid) so nearby repeated calls still hit
the same cache bucket.
"""

from __future__ import annotations

import os
import sys
from typing import Any

from fastapi import APIRouter, HTTPException, Query

# ── Inject repo root so realtime_monitor is importable ───────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from realtime_monitor.client import RealtimeClient  # noqa: E402
from .cache import TTLCache                          # noqa: E402

# ── Singletons (wired in main.py via set_deps) ────────────────────────────────
_client: RealtimeClient | None = None
_cache: TTLCache | None = None

router = APIRouter()


def set_deps(client: RealtimeClient, cache: TTLCache) -> None:
    global _client, _cache
    _client = client
    _cache = cache


def _get_client() -> RealtimeClient:
    if _client is None:
        raise HTTPException(status_code=503, detail="RealtimeClient not initialised")
    return _client


def _get_cache() -> TTLCache:
    if _cache is None:
        raise HTTPException(status_code=503, detail="Cache not initialised")
    return _cache


def _cache_key(endpoint: str, lat: float, lng: float) -> tuple:
    """Round coords to 3 dp (~111 m) so nearby queries share a cache bucket."""
    return (endpoint, round(lat, 3), round(lng, 3))


# ── Data endpoints ────────────────────────────────────────────────────────────

@router.get("/weather")
async def get_weather(
    lat: float = Query(..., description="Latitude (WGS84)"),
    lng: float = Query(..., description="Longitude (WGS84)"),
) -> dict[str, Any]:
    """
    Current weather forecast for the Taipei district nearest to (lat, lng).
    Cached for 60 s.
    """
    key = _cache_key("weather", lat, lng)
    hit, cached = _get_cache().get(key)
    if hit:
        return {**cached, "cached": True}

    data = _get_client().get_weather(lat=lat, lng=lng).to_dict()
    _get_cache().set(key, data)
    return {**data, "cached": False}


@router.get("/mrt")
async def get_mrt(
    lat: float = Query(..., description="Latitude (WGS84)"),
    lng: float = Query(..., description="Longitude (WGS84)"),
) -> dict[str, Any]:
    """
    Next MRT arrivals at TRTC stations within search radius of (lat, lng).
    Cached for 60 s.
    """
    key = _cache_key("mrt", lat, lng)
    hit, cached = _get_cache().get(key)
    if hit:
        return {"arrivals": cached, "count": len(cached), "cached": True}

    arrivals = [item.to_dict() for item in _get_client().get_mrt(lat=lat, lng=lng)]
    _get_cache().set(key, arrivals)
    return {"arrivals": arrivals, "count": len(arrivals), "cached": False}


@router.get("/bus")
async def get_bus(
    lat: float = Query(..., description="Latitude (WGS84)"),
    lng: float = Query(..., description="Longitude (WGS84)"),
) -> dict[str, Any]:
    """
    Upcoming Taipei city bus arrivals at stops within search radius of (lat, lng).
    Cached for 60 s.
    """
    key = _cache_key("bus", lat, lng)
    hit, cached = _get_cache().get(key)
    if hit:
        return {"arrivals": cached, "count": len(cached), "cached": True}

    arrivals = [item.to_dict() for item in _get_client().get_bus(lat=lat, lng=lng)]
    _get_cache().set(key, arrivals)
    return {"arrivals": arrivals, "count": len(arrivals), "cached": False}


@router.get("/ubike")
async def get_ubike(
    lat: float = Query(..., description="Latitude (WGS84)"),
    lng: float = Query(..., description="Longitude (WGS84)"),
) -> dict[str, Any]:
    """
    Nearby YouBike 2.0 station availability within search radius of (lat, lng).
    Includes coordinates and Google Maps link per station.
    Cached for 60 s.
    """
    key = _cache_key("ubike", lat, lng)
    hit, cached = _get_cache().get(key)
    if hit:
        return {"stations": cached, "count": len(cached), "cached": True}

    stations = [item.to_dict() for item in _get_client().get_ubike(lat=lat, lng=lng)]
    _get_cache().set(key, stations)
    return {"stations": stations, "count": len(stations), "cached": False}


# ── Admin / observability ─────────────────────────────────────────────────────

@router.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "realtime_monitor",
        **_get_cache().stats(),
    }


@router.get("/cache/stats")
async def cache_stats() -> dict[str, Any]:
    return _get_cache().stats()


@router.delete("/cache")
async def flush_cache() -> dict[str, str]:
    """Flush all cached entries (admin use only)."""
    _get_cache().clear()
    return {"status": "flushed"}
