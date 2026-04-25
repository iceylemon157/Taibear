"""
trip_manager/config.py — centralised configuration.

STORE_BACKEND controls which storage implementation is used:
  "json"  — JsonTripStore  (default, uses local JSON files)
  "db"    — DbTripStore    (future)
"""

import os
import sys

# ── Store backend ─────────────────────────────────────────────────────────────
STORE_BACKEND: str = os.getenv("TRIP_STORE_BACKEND", "json")

# ── Storage paths ─────────────────────────────────────────────────────────────
MODULE_DIR = os.path.dirname(os.path.abspath(__file__))
TRIPS_DIR = os.path.join(MODULE_DIR, "trips")

# ── Polling ───────────────────────────────────────────────────────────────────
POLL_INTERVAL_SECS: int = int(os.getenv("TRIP_POLL_INTERVAL", "300"))   # 5 min
WATCHDOG_INTERVAL_SECS: int = int(os.getenv("TRIP_WATCHDOG_INTERVAL", "60"))  # 1 min

# ── Disruption thresholds ─────────────────────────────────────────────────────
RAIN_TRIGGER_PCT: int = int(os.getenv("RAIN_TRIGGER_PCT", "60"))
HEAVY_RAIN_TRIGGER_PCT: int = int(os.getenv("HEAVY_RAIN_TRIGGER_PCT", "80"))
JAM_SPEED_KMH: int = int(os.getenv("JAM_SPEED_KMH", "10"))

# ── External service URLs ─────────────────────────────────────────────────────
TRIP_PLANNER_URL: str = os.getenv("TRIP_PLANNER_URL", "http://localhost:8001")
TASK_MANAGER_URL: str = os.getenv("TASK_MANAGER_URL", "http://localhost:8002")

# ── Realtime monitor import path ──────────────────────────────────────────────
_PARENT_DIR = os.path.join(MODULE_DIR, "..")
if os.path.abspath(_PARENT_DIR) not in sys.path:
    sys.path.insert(0, os.path.abspath(_PARENT_DIR))
