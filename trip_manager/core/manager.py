"""
trip_manager/core/manager.py — Trip Manager orchestrator.

Central class that coordinates:
  - Trip lifecycle (create → activate → complete / cancel)
  - Stop progression (pending → active → completed / skipped)
  - Disruption detection via DetectorDetector + RealtimeClient
  - Replanning via TripPlannerClient (stub)
  - Background polling loop (asyncio)
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from ..config import POLL_INTERVAL_SECS
from ..models.trip import Trip, TripStop, TripStatus, StopStatus
from ..models.disruption import DisruptionAlert, Severity
from ..store.base import TripStore
from ..detectors.disruption_detector import DisruptionDetector
from ..clients.trip_planner_client import TripPlannerClient
from ..clients.task_manager_client import TaskManagerClient

from realtime_monitor.client import RealtimeClient

logger = logging.getLogger(__name__)


class TripManager:

    def __init__(
        self,
        store: TripStore,
        realtime_client: RealtimeClient,
        planner_client: TripPlannerClient,
        task_client: TaskManagerClient,
    ):
        self._store = store
        self._rt = realtime_client
        self._planner = planner_client
        self._task = task_client
        self._detector = DisruptionDetector(realtime_client)
        self._polling_tasks: dict[str, asyncio.Task] = {}

    # ── Trip lifecycle ────────────────────────────────────────────────────────

    def create_trip(self, user_id: str, trip_date: str, chosen_route: dict) -> Trip:
        """
        Create a new Trip from a route chosen by the user.

        Args:
            user_id:      who owns the trip
            trip_date:    YYYY-MM-DD
            chosen_route: one entry from route_choice_sample.json → recommended_routes[]
        """
        trip = Trip.from_chosen_route(user_id, trip_date, chosen_route)
        self._store.save(trip)
        logger.info("Trip %s created for user %s on %s", trip.trip_id, user_id, trip_date)
        return trip

    def get_trip(self, trip_id: str) -> Trip:
        return self._store.get(trip_id)

    def list_trips(self, user_id: str | None = None) -> list[str]:
        if user_id:
            return self._store.list_by_user(user_id)
        return self._store.list_all()

    def activate_trip(self, trip_id: str) -> Trip:
        """Transition trip from PLANNED → ACTIVE and start background polling."""
        trip = self._store.get(trip_id)
        if trip.status != TripStatus.PLANNED:
            raise ValueError(
                f"Cannot activate trip in status '{trip.status.value}'. "
                f"Only PLANNED trips can be activated."
            )
        trip.status = TripStatus.ACTIVE
        # Mark the first pending stop as active
        for stop in trip.stops:
            if stop.status == StopStatus.PENDING:
                stop.status = StopStatus.ACTIVE
                break
        self._store.save(trip)
        logger.info("Trip %s activated", trip_id)
        return trip

    def cancel_trip(self, trip_id: str) -> Trip:
        trip = self._store.get(trip_id)
        if trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED):
            raise ValueError(f"Trip already {trip.status.value}.")
        trip.status = TripStatus.CANCELLED
        self._stop_polling(trip_id)
        self._store.save(trip)
        logger.info("Trip %s cancelled", trip_id)
        return trip

    # ── Stop progression ──────────────────────────────────────────────────────

    def update_stop_status(self, trip_id: str, stop_id: str, new_status: StopStatus) -> Trip:
        """
        Update a stop's status.  Auto-advances the next pending stop to ACTIVE.
        Auto-completes the trip when all stops are done.
        """
        trip = self._store.get(trip_id)

        target = None
        for s in trip.stops:
            if s.stop_id == stop_id:
                target = s
                break
        if target is None:
            raise KeyError(f"Stop '{stop_id}' not found in trip '{trip_id}'.")

        target.status = new_status

        # If a stop was just completed/skipped, activate the next pending one
        if new_status in (StopStatus.COMPLETED, StopStatus.SKIPPED):
            for s in trip.stops:
                if s.status == StopStatus.PENDING:
                    s.status = StopStatus.ACTIVE
                    break

        # Check if trip is now fully done
        if trip.is_all_done():
            trip.status = TripStatus.COMPLETED
            self._stop_polling(trip_id)
            logger.info("Trip %s completed — all stops done", trip_id)

        self._store.save(trip)
        return trip

    # ── Disruption detection ──────────────────────────────────────────────────

    def check_disruptions(self, trip_id: str) -> list[DisruptionAlert]:
        """
        Run all disruption checks against real-time data.
        Updates the trip's active_alerts and status.
        """
        trip = self._store.get(trip_id)

        if trip.status not in (TripStatus.ACTIVE, TripStatus.DISRUPTED):
            return []

        alerts = self._detector.detect_all(trip)

        trip.active_alerts = [a.to_dict() for a in alerts]

        if alerts:
            max_severity = max(a.severity for a in alerts)
            if max_severity in (Severity.MEDIUM, Severity.HIGH):
                trip.status = TripStatus.DISRUPTED
                logger.warning(
                    "Trip %s disrupted — %d alert(s), max severity: %s",
                    trip_id, len(alerts), max_severity.value,
                )
        else:
            # Clear disrupted status if no more alerts
            if trip.status == TripStatus.DISRUPTED:
                trip.status = TripStatus.ACTIVE

        self._store.save(trip)
        return alerts

    # ── Replanning ────────────────────────────────────────────────────────────

    def trigger_replan(self, trip_id: str) -> Trip:
        """
        Request the Trip Planner to replan remaining stops.

        Collects remaining stops from current time, sends to planner,
        and updates the trip with the new route.
        """
        trip = self._store.get(trip_id)

        if trip.status not in (TripStatus.ACTIVE, TripStatus.DISRUPTED):
            raise ValueError(
                f"Cannot replan trip in status '{trip.status.value}'. "
                f"Only ACTIVE or DISRUPTED trips can be replanned."
            )

        trip.status = TripStatus.REPLANNING
        self._store.save(trip)

        remaining = [s.to_dict() for s in trip.remaining_stops()]
        now_str = datetime.now().strftime("%H:%M")

        try:
            new_route = self._planner.replan(
                user_id=trip.user_id,
                trip_date=trip.trip_date,
                remaining_stops=remaining,
                current_time=now_str,
                alerts=trip.active_alerts,
                original_theme=trip.theme,
            )
        except NotImplementedError:
            # Planner not wired yet — revert to DISRUPTED
            trip.status = TripStatus.DISRUPTED
            self._store.save(trip)
            logger.warning("Replan skipped — Trip Planner not implemented yet")
            raise

        # Apply new route: replace remaining stops with planner output
        completed_stops = [s for s in trip.stops if s.status in (StopStatus.COMPLETED, StopStatus.SKIPPED)]
        new_stops = [
            TripStop.from_waypoint(wp, trip.trip_id)
            for wp in new_route.get("waypoints", [])
        ]
        trip.stops = completed_stops + new_stops
        trip.route_name = new_route.get("route_name", trip.route_name)
        trip.theme = new_route.get("theme", trip.theme)
        trip.google_maps_url = new_route.get("google_maps_url", trip.google_maps_url)
        tsp_raw = new_route.get("tsp_evaluation")
        if tsp_raw:
            from ..models.trip import TspEvaluation
            trip.tsp_evaluation = TspEvaluation(**tsp_raw)
        trip.status = TripStatus.ACTIVE
        trip.active_alerts = []
        self._store.save(trip)

        logger.info("Trip %s replanned — %d new stops", trip_id, len(new_stops))
        return trip

    # ── Background polling ────────────────────────────────────────────────────

    async def start_polling(self, trip_id: str) -> None:
        """Start an async background task that polls for disruptions."""
        if trip_id in self._polling_tasks:
            return
        task = asyncio.create_task(self._poll_loop(trip_id))
        self._polling_tasks[trip_id] = task
        logger.info("Polling started for trip %s (every %ds)", trip_id, POLL_INTERVAL_SECS)

    def _stop_polling(self, trip_id: str) -> None:
        task = self._polling_tasks.pop(trip_id, None)
        if task and not task.done():
            task.cancel()
            logger.info("Polling stopped for trip %s", trip_id)

    async def _poll_loop(self, trip_id: str) -> None:
        """Periodic disruption check loop.  Runs until trip is done/cancelled."""
        while True:
            try:
                await asyncio.sleep(POLL_INTERVAL_SECS)
                trip = self._store.get(trip_id)
                if trip.status in (TripStatus.COMPLETED, TripStatus.CANCELLED):
                    break

                alerts = self.check_disruptions(trip_id)

                if alerts:
                    max_sev = max(a.severity for a in alerts)
                    if max_sev == Severity.HIGH:
                        try:
                            self.trigger_replan(trip_id)
                        except NotImplementedError:
                            pass  # planner not ready

            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("Error in poll loop for trip %s", trip_id)
                await asyncio.sleep(POLL_INTERVAL_SECS)
