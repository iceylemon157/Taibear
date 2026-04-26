"""
trip_manager/clients/trip_planner_client.py — Client for the Trip Planning Agent.

Calls the Trip Planning Agent (POST /plan) to generate replacement routes
when the Trip Manager detects a disruption and needs to replan.

The Trip Planning Agent expects a SpotResult (output of /search) and returns
a PlanResponse with recommended_routes[].  This client builds a synthetic
SpotResult from the remaining stops so the planner can optimise a new route.
"""

from __future__ import annotations

import logging
import os
from typing import Any

import requests

from ..config import TRIP_PLANNER_URL

logger = logging.getLogger(__name__)

# API key for the Trip Planning Agent (X-API-Key header)
_PLANNER_API_KEY: str = os.getenv("TRIP_PLANNER_API_KEY", "")


class TripPlannerClient:

    def __init__(self, base_url: str = ""):
        self._base_url = (base_url or TRIP_PLANNER_URL).rstrip("/")

    # ── helpers ───────────────────────────────────────────────────────────────

    def _headers(self) -> dict[str, str]:
        h: dict[str, str] = {"Content-Type": "application/json"}
        if _PLANNER_API_KEY:
            h["X-API-Key"] = _PLANNER_API_KEY
        return h

    def _stops_to_spot_result(
        self,
        remaining_stops: list[dict],
        original_theme: str,
        alerts: list[dict],
    ) -> dict:
        """
        Build a SpotResult-shaped payload from remaining stops so the
        Trip Planning Agent's /plan endpoint can produce new routes.
        """
        # Build top_results from remaining stops
        top_results = []
        for i, stop in enumerate(remaining_stops):
            top_results.append({
                "rank": i + 1,
                "title": stop.get("name", ""),
                "url": "",
                "relevance_score": 1.0,
                "summary": stop.get("reasoning", ""),
                "extracted_places": [
                    {"name": stop.get("name", ""), "context": stop.get("reasoning", "")}
                ],
                "tags": [],
            })

        # Build alert context string
        alert_text = ""
        if alerts:
            parts = [a.get("message", a.get("description", str(a))) for a in alerts]
            alert_text = " | Disruption alerts: " + "; ".join(parts)

        return {
            "query": f"replan: {original_theme}{alert_text}",
            "user_preference": {"selected_tags": [], "reels": []},
            "top_results": top_results,
        }

    # ── public API ────────────────────────────────────────────────────────────

    def replan(
        self,
        user_id: str,
        trip_date: str,
        remaining_stops: list[dict],
        current_time: str,
        alerts: list[dict],
        original_theme: str = "",
    ) -> dict[str, Any]:
        """
        Request the Trip Planning Agent to generate a new route.

        Converts the remaining-stops + alerts into a SpotResult and POSTs
        to /plan.  Returns the first recommended route dict.
        """
        payload = self._stops_to_spot_result(remaining_stops, original_theme, alerts)

        url = f"{self._base_url}/plan"
        logger.info("Calling Trip Planning Agent: POST %s", url)

        resp = requests.post(url, json=payload, headers=self._headers(), timeout=60)
        resp.raise_for_status()

        data = resp.json()
        routes = data.get("recommended_routes", [])
        if not routes:
            raise RuntimeError("Trip Planning Agent returned no routes")

        return routes[0]

    def health(self) -> bool:
        """Check whether the Trip Planning Agent is reachable."""
        try:
            resp = requests.get(f"{self._base_url}/health", timeout=5)
            return resp.status_code == 200
        except requests.RequestException:
            return False
