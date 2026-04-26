"""
trip_manager/main.py — Entry point for the Trip Manager service.

Usage:
    python -m trip_manager.main
    # or from the repo root:
    python trip_manager/main.py

Starts a FastAPI server on port 8003 (configurable via --port).
"""

import argparse
import sys
import os

# Ensure parent dir is on path so `realtime_monitor` is importable
_MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
_PARENT_DIR = os.path.join(_MODULE_DIR, "..")
if os.path.abspath(_PARENT_DIR) not in sys.path:
    sys.path.insert(0, os.path.abspath(_PARENT_DIR))
if _MODULE_DIR not in sys.path:
    sys.path.insert(0, _MODULE_DIR)

from trip_manager.config import TRIPS_DIR                        # noqa: E402
from trip_manager.store.json_store import JsonTripStore           # noqa: E402
from trip_manager.clients.trip_planner_client import TripPlannerClient  # noqa: E402
from trip_manager.clients.task_manager_client import TaskManagerClient  # noqa: E402
from trip_manager.core.manager import TripManager                 # noqa: E402
from trip_manager.api.routes import router, set_manager           # noqa: E402

from realtime_monitor.client import RealtimeClient                # noqa: E402

from fastapi import FastAPI                                       # noqa: E402
import uvicorn                                                    # noqa: E402


def build_app() -> FastAPI:
    store = JsonTripStore(trips_dir=TRIPS_DIR)
    rt_client = RealtimeClient()
    planner = TripPlannerClient()
    task_client = TaskManagerClient()

    manager = TripManager(
        store=store,
        realtime_client=rt_client,
        planner_client=planner,
        task_client=task_client,
    )
    set_manager(manager)

    app = FastAPI(
        title="Trip Manager",
        description="Stateful trip lifecycle manager with real-time disruption monitoring",
        version="0.1.0",
    )
    app.include_router(router)

    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "trip_manager"}

    return app


app = build_app()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Trip Manager Service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8003)
    args = parser.parse_args()

    uvicorn.run("trip_manager.main:app", host=args.host, port=args.port, reload=True)
