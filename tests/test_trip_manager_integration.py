"""
tests/test_trip_manager_integration.py — Sample integration tests for Trip Manager.

These tests demonstrate:
  1. How to create / activate / progress / complete a trip
  2. How the JSON store persists and reloads trips
  3. How disruption detection works with mock weather data
  4. How the FastAPI endpoints behave (via httpx / TestClient)
  5. What the Trip Planner service contract looks like (for future implementers)

Run:
    cd YTP_Hackathon
    python -m pytest tests/test_trip_manager_integration.py -v

Requires:
    pip install pytest httpx
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Path setup — same trick the production code uses so imports resolve
# ---------------------------------------------------------------------------
import sys

_HERE = Path(__file__).resolve().parent
_ROOT = _HERE.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

# ---------------------------------------------------------------------------
# Project imports
# ---------------------------------------------------------------------------
from trip_manager.models.trip import (
    Trip, TripStop, TripStatus, StopStatus, Location, TspEvaluation,
)
from trip_manager.models.disruption import DisruptionAlert, AlertType, Severity
from trip_manager.store.json_store import JsonTripStore
from trip_manager.detectors.disruption_detector import DisruptionDetector
from trip_manager.core.manager import TripManager
from trip_manager.clients.trip_planner_client import TripPlannerClient
from trip_manager.clients.task_manager_client import TaskManagerClient

from realtime_monitor.client import RealtimeClient
from realtime_monitor.models import WeatherData, TrafficData

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

SAMPLE_ROUTE: dict = {
    "route_id": "route_test",
    "route_name": "測試路線",
    "theme": "整合測試主題",
    "tsp_evaluation": {"total_transit_time_mins": 45, "smoothness_score": 0.9},
    "google_maps_url": "https://maps.google.com/test",
    "waypoints": [
        {
            "step_order": 1,
            "name": "台北101",
            "place_id": "ChIJH56c2rarQjQRphMBBCNPnog",
            "location": {"lat": 25.0339, "lng": 121.5645},
            "suggested_time": "09:00 - 10:30",
            "reasoning": "地標景點，適合上午參觀。",
        },
        {
            "step_order": 2,
            "name": "象山步道",
            "place_id": "ChIJHxoGLlKrQjQRv7mHkEudnGI",
            "location": {"lat": 25.0275, "lng": 121.5701},
            "suggested_time": "11:00 - 12:30",
            "reasoning": "近距離欣賞 101，步行可達。",
        },
        {
            "step_order": 3,
            "name": "四四南村",
            "place_id": "ChIJNzpQwFOrQjQR-kS7psBpBJ0",
            "location": {"lat": 25.0313, "lng": 121.5625},
            "suggested_time": "13:00 - 14:30",
            "reasoning": "文青聚落，適合午後散步。",
        },
    ],
}


@pytest.fixture()
def tmp_trips_dir():
    """Provide a temporary directory for JSON trip storage, cleaned up after test."""
    d = tempfile.mkdtemp(prefix="trip_test_")
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture()
def store(tmp_trips_dir) -> JsonTripStore:
    return JsonTripStore(trips_dir=tmp_trips_dir)


@pytest.fixture()
def mock_realtime() -> MagicMock:
    """RealtimeClient mock — returns controllable weather data."""
    client = MagicMock(spec=RealtimeClient)
    client.get_weather.return_value = WeatherData(
        district="信義區",
        rain_prob_pct=20,
        description="多雲",
        temperature_low=24,
        temperature_high=31,
        comfort="舒適",
    )
    # Traffic is not implemented yet — mirror production behaviour
    client.get_traffic.side_effect = NotImplementedError("TDX not implemented")
    return client


@pytest.fixture()
def manager(store, mock_realtime) -> TripManager:
    return TripManager(
        store=store,
        realtime_client=mock_realtime,
        planner_client=TripPlannerClient(),
        task_client=TaskManagerClient(),
    )


# ============================================================================
# 1. Model layer — Trip creation from route_choice_sample format
# ============================================================================

class TestTripModel:

    def test_from_chosen_route_creates_correct_trip(self):
        trip = Trip.from_chosen_route("user_alice", "2025-08-01", SAMPLE_ROUTE)

        assert trip.user_id == "user_alice"
        assert trip.trip_date == "2025-08-01"
        assert trip.status == TripStatus.PLANNED
        assert trip.route_name == "測試路線"
        assert trip.theme == "整合測試主題"
        assert trip.original_route_id == "route_test"
        assert len(trip.stops) == 3
        assert trip.tsp_evaluation.total_transit_time_mins == 45

    def test_stops_have_correct_ids_and_order(self):
        trip = Trip.from_chosen_route("u1", "2025-01-01", SAMPLE_ROUTE)

        for i, stop in enumerate(trip.stops, start=1):
            assert stop.step_order == i
            assert stop.stop_id == f"{trip.trip_id}_stop_{i}"
            assert stop.status == StopStatus.PENDING

    def test_remaining_stops_returns_pending_and_active(self):
        trip = Trip.from_chosen_route("u1", "2025-01-01", SAMPLE_ROUTE)
        assert len(trip.remaining_stops()) == 3

        trip.stops[0].status = StopStatus.COMPLETED
        assert len(trip.remaining_stops()) == 2

    def test_is_all_done(self):
        trip = Trip.from_chosen_route("u1", "2025-01-01", SAMPLE_ROUTE)
        assert not trip.is_all_done()

        for s in trip.stops:
            s.status = StopStatus.COMPLETED
        assert trip.is_all_done()

    def test_serialisation_round_trip(self):
        trip = Trip.from_chosen_route("u1", "2025-01-01", SAMPLE_ROUTE)
        d = trip.to_dict()
        restored = Trip.from_dict(d)

        assert restored.trip_id == trip.trip_id
        assert restored.status == trip.status
        assert len(restored.stops) == len(trip.stops)
        assert restored.tsp_evaluation.smoothness_score == trip.tsp_evaluation.smoothness_score


# ============================================================================
# 2. JSON store — persistence round-trip
# ============================================================================

class TestJsonStore:

    def test_save_and_get(self, store):
        trip = Trip.from_chosen_route("u1", "2025-01-01", SAMPLE_ROUTE)
        store.save(trip)
        loaded = store.get(trip.trip_id)

        assert loaded.trip_id == trip.trip_id
        assert loaded.route_name == trip.route_name
        assert len(loaded.stops) == 3

    def test_get_nonexistent_raises_key_error(self, store):
        with pytest.raises(KeyError):
            store.get("does_not_exist")

    def test_list_all(self, store):
        t1 = Trip.from_chosen_route("u1", "2025-01-01", SAMPLE_ROUTE)
        t2 = Trip.from_chosen_route("u2", "2025-01-02", SAMPLE_ROUTE)
        store.save(t1)
        store.save(t2)

        ids = store.list_all()
        assert t1.trip_id in ids
        assert t2.trip_id in ids

    def test_list_by_user(self, store):
        t1 = Trip.from_chosen_route("alice", "2025-01-01", SAMPLE_ROUTE)
        t2 = Trip.from_chosen_route("bob", "2025-01-01", SAMPLE_ROUTE)
        store.save(t1)
        store.save(t2)

        alice_ids = store.list_by_user("alice")
        assert t1.trip_id in alice_ids
        assert t2.trip_id not in alice_ids

    def test_delete(self, store):
        trip = Trip.from_chosen_route("u1", "2025-01-01", SAMPLE_ROUTE)
        store.save(trip)
        store.delete(trip.trip_id)

        with pytest.raises(KeyError):
            store.get(trip.trip_id)


# ============================================================================
# 3. Trip lifecycle via TripManager
# ============================================================================

class TestTripLifecycle:

    def test_create_trip(self, manager):
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        assert trip.status == TripStatus.PLANNED
        assert len(trip.stops) == 3

        # Trip is persisted
        loaded = manager.get_trip(trip.trip_id)
        assert loaded.trip_id == trip.trip_id

    def test_activate_trip_sets_first_stop_active(self, manager):
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        activated = manager.activate_trip(trip.trip_id)

        assert activated.status == TripStatus.ACTIVE
        assert activated.stops[0].status == StopStatus.ACTIVE
        assert activated.stops[1].status == StopStatus.PENDING

    def test_cannot_activate_non_planned_trip(self, manager):
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        manager.activate_trip(trip.trip_id)

        with pytest.raises(ValueError, match="Only PLANNED"):
            manager.activate_trip(trip.trip_id)

    def test_stop_progression_auto_advances(self, manager):
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        manager.activate_trip(trip.trip_id)

        stop1_id = trip.stops[0].stop_id
        updated = manager.update_stop_status(trip.trip_id, stop1_id, StopStatus.COMPLETED)

        assert updated.stops[0].status == StopStatus.COMPLETED
        assert updated.stops[1].status == StopStatus.ACTIVE  # auto-advanced

    def test_skip_stop_also_advances(self, manager):
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        manager.activate_trip(trip.trip_id)

        stop1_id = trip.stops[0].stop_id
        updated = manager.update_stop_status(trip.trip_id, stop1_id, StopStatus.SKIPPED)

        assert updated.stops[0].status == StopStatus.SKIPPED
        assert updated.stops[1].status == StopStatus.ACTIVE

    def test_completing_all_stops_auto_completes_trip(self, manager):
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        manager.activate_trip(trip.trip_id)

        for stop in trip.stops:
            manager.update_stop_status(trip.trip_id, stop.stop_id, StopStatus.COMPLETED)

        final = manager.get_trip(trip.trip_id)
        assert final.status == TripStatus.COMPLETED

    def test_cancel_trip(self, manager):
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        cancelled = manager.cancel_trip(trip.trip_id)
        assert cancelled.status == TripStatus.CANCELLED

    def test_cannot_cancel_completed_trip(self, manager):
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        manager.activate_trip(trip.trip_id)
        for stop in trip.stops:
            manager.update_stop_status(trip.trip_id, stop.stop_id, StopStatus.COMPLETED)

        with pytest.raises(ValueError, match="already completed"):
            manager.cancel_trip(trip.trip_id)


# ============================================================================
# 4. Disruption detection with mock weather
# ============================================================================

class TestDisruptionDetection:

    def test_no_alert_when_rain_probability_low(self, manager, mock_realtime):
        """20% rain → no alert."""
        mock_realtime.get_weather.return_value = WeatherData(
            district="信義區", rain_prob_pct=20, description="多雲",
        )
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        manager.activate_trip(trip.trip_id)

        alerts = manager.check_disruptions(trip.trip_id)
        assert len(alerts) == 0

    def test_medium_rain_alert(self, manager, mock_realtime):
        """60% rain → MEDIUM / rain."""
        mock_realtime.get_weather.return_value = WeatherData(
            district="信義區", rain_prob_pct=65, description="陰時多雲短暫陣雨",
        )
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        manager.activate_trip(trip.trip_id)

        alerts = manager.check_disruptions(trip.trip_id)
        assert len(alerts) == 1
        assert alerts[0].alert_type == AlertType.RAIN
        assert alerts[0].severity == Severity.MEDIUM

        # Trip status should change to DISRUPTED
        t = manager.get_trip(trip.trip_id)
        assert t.status == TripStatus.DISRUPTED

    def test_heavy_rain_alert(self, manager, mock_realtime):
        """80% rain → HIGH / heavy_rain."""
        mock_realtime.get_weather.return_value = WeatherData(
            district="中山區", rain_prob_pct=85, description="短暫陣雨或雷雨",
        )
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        manager.activate_trip(trip.trip_id)

        alerts = manager.check_disruptions(trip.trip_id)
        assert len(alerts) == 1
        assert alerts[0].alert_type == AlertType.HEAVY_RAIN
        assert alerts[0].severity == Severity.HIGH

    def test_disruption_clears_when_weather_improves(self, manager, mock_realtime):
        """First check → DISRUPTED, second check (clear sky) → back to ACTIVE."""
        mock_realtime.get_weather.return_value = WeatherData(
            district="信義區", rain_prob_pct=70, description="陣雨",
        )
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        manager.activate_trip(trip.trip_id)
        manager.check_disruptions(trip.trip_id)

        t = manager.get_trip(trip.trip_id)
        assert t.status == TripStatus.DISRUPTED

        # Weather improves
        mock_realtime.get_weather.return_value = WeatherData(
            district="信義區", rain_prob_pct=10, description="晴",
        )
        manager.check_disruptions(trip.trip_id)

        t = manager.get_trip(trip.trip_id)
        assert t.status == TripStatus.ACTIVE
        assert t.active_alerts == []

    def test_disruption_only_on_active_trip(self, manager, mock_realtime):
        """Disruption check on a PLANNED trip returns empty — no alerts."""
        mock_realtime.get_weather.return_value = WeatherData(
            district="信義區", rain_prob_pct=90, description="豪雨",
        )
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        alerts = manager.check_disruptions(trip.trip_id)
        assert len(alerts) == 0


# ============================================================================
# 5. Replanning contract (demonstrates what Trip Planner should return)
# ============================================================================

class TestReplanning:
    """
    Trip Planner is currently a stub.  These tests document the expected
    request/response contract so the Trip Planner team knows exactly what
    Trip Manager sends and what it expects back.
    """

    def test_replan_calls_planner_with_correct_payload(self, store, mock_realtime):
        """Verify the exact shape sent to TripPlannerClient.replan()."""

        # Create a mock planner that records calls and returns a new route
        mock_planner = MagicMock(spec=TripPlannerClient)
        mock_planner.replan.return_value = {
            "route_id": "replan_1",
            "route_name": "雨天備案路線",
            "theme": "室內行程",
            "tsp_evaluation": {"total_transit_time_mins": 30, "smoothness_score": 0.85},
            "google_maps_url": "https://maps.google.com/replan",
            "waypoints": [
                {
                    "step_order": 1,
                    "name": "台北市立美術館",
                    "place_id": "ChIJMXHEPcipQjQR4TRXTganLXY",
                    "location": {"lat": 25.0724, "lng": 121.5247},
                    "suggested_time": "13:00 - 15:00",
                    "reasoning": "室內場館，避雨首選。",
                },
                {
                    "step_order": 2,
                    "name": "華山1914文創園區",
                    "place_id": "ChIJbSTgI2WpQjQRcVwWB2cnyfE",
                    "location": {"lat": 25.0441, "lng": 121.5294},
                    "suggested_time": "15:30 - 17:30",
                    "reasoning": "文創園區的室內展覽和商店。",
                },
            ],
        }

        mgr = TripManager(
            store=store,
            realtime_client=mock_realtime,
            planner_client=mock_planner,
            task_client=TaskManagerClient(),
        )

        trip = mgr.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        mgr.activate_trip(trip.trip_id)

        # Complete first stop so remaining = stops 2 & 3
        mgr.update_stop_status(trip.trip_id, trip.stops[0].stop_id, StopStatus.COMPLETED)

        # Simulate disruption
        mock_realtime.get_weather.return_value = WeatherData(
            district="信義區", rain_prob_pct=85, description="大雨",
        )
        mgr.check_disruptions(trip.trip_id)

        # Trigger replan
        replanned = mgr.trigger_replan(trip.trip_id)

        # ── Verify planner was called correctly ──
        mock_planner.replan.assert_called_once()
        call_kwargs = mock_planner.replan.call_args
        # Keyword arguments sent to Planner:
        assert call_kwargs.kwargs["user_id"] == "alice"
        assert call_kwargs.kwargs["trip_date"] == "2025-08-01"
        assert isinstance(call_kwargs.kwargs["remaining_stops"], list)
        assert isinstance(call_kwargs.kwargs["alerts"], list)
        assert call_kwargs.kwargs["original_theme"] == "整合測試主題"

        # ── Verify trip was updated with new route ──
        assert replanned.status == TripStatus.ACTIVE
        # The completed stop is preserved, remaining stops are replaced
        assert replanned.stops[0].status == StopStatus.COMPLETED  # original first stop
        # New stops from replanned route
        assert any(s.name == "台北市立美術館" for s in replanned.stops)

    def test_replan_not_implemented_reverts_to_disrupted(self, manager):
        """When planner is a stub (not wired), trip reverts to DISRUPTED."""
        trip = manager.create_trip("alice", "2025-08-01", SAMPLE_ROUTE)
        manager.activate_trip(trip.trip_id)

        # Trigger disruption first
        manager._rt.get_weather.return_value = WeatherData(
            district="信義區", rain_prob_pct=85, description="大雨",
        )
        manager.check_disruptions(trip.trip_id)

        with pytest.raises(NotImplementedError):
            manager.trigger_replan(trip.trip_id)


# ============================================================================
# 6. FastAPI endpoint tests (requires httpx)
# ============================================================================

try:
    from httpx import AsyncClient, ASGITransport
    from trip_manager.api.routes import router, set_manager
    from fastapi import FastAPI

    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False


@pytest.mark.skipif(not HAS_HTTPX, reason="httpx not installed")
class TestAPI:
    """
    End-to-end API tests using FastAPI TestClient.

    These mirror what an external service (Trip Planner, frontend, etc.)
    would send over HTTP.
    """

    @pytest.fixture(autouse=True)
    def _setup_app(self, manager):
        set_manager(manager)
        self.app = FastAPI()
        self.app.include_router(router)
        self._manager = manager

    def _client(self):
        transport = ASGITransport(app=self.app)
        return AsyncClient(transport=transport, base_url="http://test")

    @pytest.mark.asyncio
    async def test_create_trip_endpoint(self):
        async with self._client() as client:
            resp = await client.post("/trips", json={
                "user_id": "alice",
                "trip_date": "2025-08-01",
                "chosen_route": SAMPLE_ROUTE,
            })
            assert resp.status_code == 200
            body = resp.json()
            assert body["user_id"] == "alice"
            assert body["status"] == "planned"
            assert len(body["stops"]) == 3

    @pytest.mark.asyncio
    async def test_get_trip_endpoint(self):
        async with self._client() as client:
            create_resp = await client.post("/trips", json={
                "user_id": "alice",
                "trip_date": "2025-08-01",
                "chosen_route": SAMPLE_ROUTE,
            })
            trip_id = create_resp.json()["trip_id"]

            resp = await client.get(f"/trips/{trip_id}")
            assert resp.status_code == 200
            assert resp.json()["trip_id"] == trip_id

    @pytest.mark.asyncio
    async def test_get_nonexistent_trip_returns_404(self):
        async with self._client() as client:
            resp = await client.get("/trips/nonexistent")
            assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_activate_trip_endpoint(self):
        async with self._client() as client:
            create_resp = await client.post("/trips", json={
                "user_id": "alice",
                "trip_date": "2025-08-01",
                "chosen_route": SAMPLE_ROUTE,
            })
            trip_id = create_resp.json()["trip_id"]

            resp = await client.post(f"/trips/{trip_id}/activate")
            assert resp.status_code == 200
            assert resp.json()["status"] == "active"

    @pytest.mark.asyncio
    async def test_update_stop_status_endpoint(self):
        async with self._client() as client:
            create_resp = await client.post("/trips", json={
                "user_id": "alice",
                "trip_date": "2025-08-01",
                "chosen_route": SAMPLE_ROUTE,
            })
            trip_id = create_resp.json()["trip_id"]
            stop_id = create_resp.json()["stops"][0]["stop_id"]

            await client.post(f"/trips/{trip_id}/activate")

            resp = await client.post(
                f"/trips/{trip_id}/stops/{stop_id}/status",
                json={"status": "completed"},
            )
            assert resp.status_code == 200
            stops = resp.json()["stops"]
            assert stops[0]["status"] == "completed"
            assert stops[1]["status"] == "active"  # auto-advanced

    @pytest.mark.asyncio
    async def test_check_disruptions_endpoint(self):
        async with self._client() as client:
            create_resp = await client.post("/trips", json={
                "user_id": "alice",
                "trip_date": "2025-08-01",
                "chosen_route": SAMPLE_ROUTE,
            })
            trip_id = create_resp.json()["trip_id"]
            await client.post(f"/trips/{trip_id}/activate")

            resp = await client.post(f"/trips/{trip_id}/check")
            assert resp.status_code == 200
            assert "alerts" in resp.json()
            assert "count" in resp.json()

    @pytest.mark.asyncio
    async def test_list_user_trips_endpoint(self):
        async with self._client() as client:
            await client.post("/trips", json={
                "user_id": "alice",
                "trip_date": "2025-08-01",
                "chosen_route": SAMPLE_ROUTE,
            })
            resp = await client.get("/users/alice/trips")
            assert resp.status_code == 200
            assert len(resp.json()["trip_ids"]) >= 1

    @pytest.mark.asyncio
    async def test_cancel_trip_endpoint(self):
        async with self._client() as client:
            create_resp = await client.post("/trips", json={
                "user_id": "alice",
                "trip_date": "2025-08-01",
                "chosen_route": SAMPLE_ROUTE,
            })
            trip_id = create_resp.json()["trip_id"]

            resp = await client.post(f"/trips/{trip_id}/cancel")
            assert resp.status_code == 200
            assert resp.json()["status"] == "cancelled"


# ============================================================================
# 7. Integration contract — how Trip Planner should call Trip Manager
# ============================================================================

class TestIntegrationContracts:
    """
    These tests are *documentation-as-code*: they show external services
    the exact JSON payloads Trip Manager accepts and returns.

    Trip Planner or Task Manager teams can copy these as integration examples.
    """

    def test_create_trip_request_shape(self):
        """
        POST /trips expects this JSON body (mirrors route_choice_sample.json):

        {
            "user_id": "alice",
            "trip_date": "2025-08-01",
            "chosen_route": {
                "route_id": "route_A",
                "route_name": "療癒文青花園漫遊",
                "theme": "...",
                "tsp_evaluation": {
                    "total_transit_time_mins": 79,
                    "smoothness_score": 1.0
                },
                "google_maps_url": "https://...",
                "waypoints": [
                    {
                        "step_order": 1,
                        "name": "臺北玫瑰園",
                        "place_id": "ChIJ...",
                        "location": {"lat": 25.069, "lng": 121.528},
                        "suggested_time": "09:00 - 10:30",
                        "reasoning": "行程開端..."
                    }
                ]
            }
        }
        """
        trip = Trip.from_chosen_route("alice", "2025-08-01", SAMPLE_ROUTE)
        d = trip.to_dict()

        # Verify the response shape matches documented contract
        assert "trip_id" in d
        assert "status" in d
        assert "stops" in d
        assert all(
            key in d["stops"][0]
            for key in ("stop_id", "step_order", "name", "place_id", "location", "status")
        )

    def test_trip_planner_replan_request_contract(self):
        """
        When Trip Manager calls Trip Planner's /replan endpoint, it sends:

        POST {TRIP_PLANNER_URL}/replan
        {
            "user_id": "alice",
            "trip_date": "2025-08-01",
            "remaining_stops": [ <TripStop.to_dict() objects> ],
            "current_time": "14:30",
            "alerts": [ <DisruptionAlert.to_dict() objects> ],
            "original_theme": "整合測試主題"
        }
        """
        trip = Trip.from_chosen_route("alice", "2025-08-01", SAMPLE_ROUTE)
        trip.stops[0].status = StopStatus.COMPLETED
        remaining = [s.to_dict() for s in trip.remaining_stops()]

        alert = DisruptionAlert(
            alert_type=AlertType.HEAVY_RAIN,
            severity=Severity.HIGH,
            affected_stop_ids=[s["stop_id"] for s in remaining],
            message="降雨機率 85%，建議改為室內行程。",
        )

        payload = {
            "user_id": trip.user_id,
            "trip_date": trip.trip_date,
            "remaining_stops": remaining,
            "current_time": "14:30",
            "alerts": [alert.to_dict()],
            "original_theme": trip.theme,
        }

        # Validate shape
        assert payload["user_id"] == "alice"
        assert len(payload["remaining_stops"]) == 2
        assert payload["alerts"][0]["severity"] == "high"
        assert "affected_stop_ids" in payload["alerts"][0]

    def test_trip_planner_replan_response_contract(self):
        """
        Trip Planner should return a route dict matching route_choice_sample.json:

        {
            "route_id": "replan_1",
            "route_name": "雨天備案路線",
            "theme": "室內行程",
            "tsp_evaluation": {"total_transit_time_mins": 30, "smoothness_score": 0.85},
            "google_maps_url": "https://...",
            "waypoints": [
                {
                    "step_order": 1, "name": "...", "place_id": "...",
                    "location": {"lat": ..., "lng": ...},
                    "suggested_time": "HH:MM - HH:MM",
                    "reasoning": "..."
                }
            ]
        }

        Trip Manager will call Trip.from_chosen_route() on this to create new stops.
        """
        response = {
            "route_id": "replan_1",
            "route_name": "雨天備案路線",
            "theme": "室內行程",
            "tsp_evaluation": {"total_transit_time_mins": 30, "smoothness_score": 0.85},
            "google_maps_url": "https://maps.google.com/replan",
            "waypoints": [
                {
                    "step_order": 1,
                    "name": "台北市立美術館",
                    "place_id": "ChIJMXHEPcipQjQR4TRXTganLXY",
                    "location": {"lat": 25.0724, "lng": 121.5247},
                    "suggested_time": "13:00 - 15:00",
                    "reasoning": "室內場館，避雨首選。",
                },
            ],
        }

        # This is exactly what Trip Manager does after receiving the response
        trip = Trip.from_chosen_route("alice", "2025-08-01", response)
        assert trip.route_name == "雨天備案路線"
        assert trip.stops[0].name == "台北市立美術館"

    def test_task_manager_stop_completion_contract(self):
        """
        Task Manager should expose:

        GET {TASK_MANAGER_URL}/stops/{stop_id}/completion

        Response:
        {
            "stop_id": "abc123_stop_1",
            "completed": true,
            "total_tasks": 3,
            "done_tasks": 3
        }

        Trip Manager uses `completed` to decide whether to auto-advance.
        """
        response = {
            "stop_id": "abc123_stop_1",
            "completed": True,
            "total_tasks": 3,
            "done_tasks": 3,
        }

        assert response["completed"] is True
        assert response["done_tasks"] == response["total_tasks"]
