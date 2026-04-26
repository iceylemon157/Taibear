"""
realtime_monitor_service/main.py — Entry point for the Realtime Monitor service.

Usage:
    # From Taibear-full/
    python -m realtime_monitor_service.main

    # Or directly:
    python realtime_monitor_service/main.py

    # With custom port or TTL:
    REALTIME_MONITOR_PORT=8005 CACHE_TTL_SECS=120 python -m realtime_monitor_service.main

Starts a FastAPI server on port 8005 (configurable via REALTIME_MONITOR_PORT env var).
All four data endpoints cache responses for CACHE_TTL_SECS (default 60 s).
"""

from __future__ import annotations

import os
import sys

# Ensure the repo root is on sys.path so realtime_monitor is importable
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from dotenv import load_dotenv
load_dotenv(os.path.join(_ROOT, ".env"))

from fastapi import FastAPI                          # noqa: E402
import uvicorn                                       # noqa: E402

from realtime_monitor.client import RealtimeClient   # noqa: E402
from .cache import TTLCache                          # noqa: E402
from .routes import router, set_deps                 # noqa: E402

_PORT = int(os.getenv("REALTIME_MONITOR_PORT", "8005"))
_TTL  = int(os.getenv("CACHE_TTL_SECS", "60"))


def build_app() -> FastAPI:
    client = RealtimeClient()
    cache  = TTLCache(ttl_seconds=_TTL)
    set_deps(client, cache)

    app = FastAPI(
        title="Realtime Monitor",
        description=(
            "Real-time weather, MRT, bus, and YouBike data for Taipei. "
            f"Responses are cached for {_TTL} s."
        ),
        version="0.1.0",
    )
    app.include_router(router)
    return app


app = build_app()


if __name__ == "__main__":
    uvicorn.run(
        "realtime_monitor_service.main:app",
        host="0.0.0.0",
        port=_PORT,
        reload=False,
    )
