"""
tests/test_all_services.py — Integration tests for every exposed API endpoint.

Prerequisites:
  - All services running via `docker compose up`
  - YTP_API_KEY env var set (or pass via --api-key flag)

Usage:
  pip install requests python-dotenv pytest
  pytest tests/test_all_services.py -v
  pytest tests/test_all_services.py -v -k "not slow"   # skip Gemini-dependent tests
"""

import json
import os
import uuid

import pytest
import requests
from dotenv import load_dotenv

load_dotenv()

# ── Base URLs ─────────────────────────────────────────────────────────────────

TRIP_PLANNER_URL = os.getenv("TEST_TRIP_PLANNER_URL", "http://localhost:8001")
TRIP_MANAGER_URL = os.getenv("TEST_TRIP_MANAGER_URL", "http://localhost:8003")
USER_PROFILE_URL = os.getenv("TEST_USER_PROFILE_URL", "http://localhost:8004")

YTP_API_KEY = os.getenv("YTP_API_KEY", "")

# ── Sample route (from route_choice_sample.json) ─────────────────────────────

SAMPLE_ROUTE = {
    "route_id": "route_test",
    "route_name": "Test Route",
    "theme": "Integration test route",
    "tsp_evaluation": {"total_transit_time_mins": 30, "smoothness_score": 0.9},
    "google_maps_url": "https://www.google.com/maps",
    "waypoints": [
        {
            "step_order": 1,
            "name": "臺北玫瑰園",
            "place_id": "ChIJ5X1aDFGpQjQROYTjlSR0GAQ",
            "location": {"lat": 25.0693501, "lng": 121.5287696},
            "suggested_time": "09:00 - 10:30",
            "reasoning": "Test stop 1",
        },
        {
            "step_order": 2,
            "name": "華山1914文創園區",
            "place_id": "ChIJbSTgI2WpQjQRcVwWB2cnyfE",
            "location": {"lat": 25.0440698, "lng": 121.5293583},
            "suggested_time": "11:00 - 13:00",
            "reasoning": "Test stop 2",
        },
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def planner_headers():
    return {"Content-Type": "application/json", "X-API-Key": YTP_API_KEY}


def unique_user_id():
    return f"test_{uuid.uuid4().hex[:8]}"


# ═══════════════════════════════════════════════════════════════════════════════
#  1. HEALTH CHECKS
# ═══════════════════════════════════════════════════════════════════════════════


class TestHealthChecks:
    def test_trip_planner_health(self):
        r = requests.get(f"{TRIP_PLANNER_URL}/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_trip_manager_health(self):
        r = requests.get(f"{TRIP_MANAGER_URL}/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"

    def test_user_profile_manager_health(self):
        r = requests.get(f"{USER_PROFILE_URL}/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"


# ═══════════════════════════════════════════════════════════════════════════════
#  2. USER PROFILE MANAGER (port 8004)
# ═══════════════════════════════════════════════════════════════════════════════


class TestUserProfileManager:
    """Tests for all /users/ endpoints."""

    def test_create_and_get_user(self):
        uid = unique_user_id()
        # Create
        r = requests.post(
            f"{USER_PROFILE_URL}/users/",
            json={
                "user_id": uid,
                "display_name": "Test User",
                "country": "Taiwan",
                "preferred_languages": ["zh-TW"],
                "age": 25,
                "preferred_transportation": ["MRT"],
                "selected_tags": ["文青", "咖啡"],
            },
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == uid
        assert data["display_name"] == "Test User"
        assert "文青" in data["selected_tags"]

        # Get
        r = requests.get(f"{USER_PROFILE_URL}/users/{uid}")
        assert r.status_code == 200
        assert r.json()["user_id"] == uid

    def test_create_duplicate_user_fails(self):
        uid = unique_user_id()
        requests.post(
            f"{USER_PROFILE_URL}/users/",
            json={"user_id": uid, "display_name": "First"},
        )
        r = requests.post(
            f"{USER_PROFILE_URL}/users/",
            json={"user_id": uid, "display_name": "Duplicate"},
        )
        assert r.status_code == 400

    def test_update_user(self):
        uid = unique_user_id()
        requests.post(
            f"{USER_PROFILE_URL}/users/",
            json={"user_id": uid, "display_name": "Before"},
        )
        r = requests.put(
            f"{USER_PROFILE_URL}/users/{uid}",
            json={"display_name": "After", "age": 30},
        )
        assert r.status_code == 200
        assert r.json()["display_name"] == "After"
        assert r.json()["age"] == 30

    def test_delete_user(self):
        uid = unique_user_id()
        requests.post(
            f"{USER_PROFILE_URL}/users/",
            json={"user_id": uid, "display_name": "ToDelete"},
        )
        r = requests.delete(f"{USER_PROFILE_URL}/users/{uid}")
        assert r.status_code == 200
        assert r.json()["deleted"] == uid

        # Confirm gone
        r = requests.get(f"{USER_PROFILE_URL}/users/{uid}")
        assert r.status_code == 404

    def test_list_users(self):
        uid = unique_user_id()
        requests.post(
            f"{USER_PROFILE_URL}/users/",
            json={"user_id": uid, "display_name": "Listed"},
        )
        r = requests.get(f"{USER_PROFILE_URL}/users/")
        assert r.status_code == 200
        assert uid in r.json()["user_ids"]

    def test_add_and_remove_tag(self):
        uid = unique_user_id()
        requests.post(
            f"{USER_PROFILE_URL}/users/",
            json={"user_id": uid, "display_name": "Tagger", "selected_tags": ["文青"]},
        )
        # Add tag
        r = requests.post(
            f"{USER_PROFILE_URL}/users/{uid}/tags", json={"tag": "咖啡廳"}
        )
        assert r.status_code == 200
        assert "咖啡廳" in r.json()["selected_tags"]

        # Remove tag
        r = requests.delete(
            f"{USER_PROFILE_URL}/users/{uid}/tags", json={"tag": "咖啡廳"}
        )
        assert r.status_code == 200
        assert "咖啡廳" not in r.json()["selected_tags"]

    def test_add_and_remove_reel(self):
        uid = unique_user_id()
        requests.post(
            f"{USER_PROFILE_URL}/users/",
            json={"user_id": uid, "display_name": "Reeler"},
        )
        reel_url = "https://www.instagram.com/reel/test123"

        # Add reel
        r = requests.post(
            f"{USER_PROFILE_URL}/users/{uid}/reels",
            json={"url": reel_url, "text_content": "台北文青咖啡"},
        )
        assert r.status_code == 200
        assert any(rl["url"] == reel_url for rl in r.json()["reels"])

        # Remove reel
        r = requests.delete(
            f"{USER_PROFILE_URL}/users/{uid}/reels", json={"url": reel_url}
        )
        assert r.status_code == 200
        assert not any(rl["url"] == reel_url for rl in r.json()["reels"])

    def test_get_nonexistent_user_404(self):
        r = requests.get(f"{USER_PROFILE_URL}/users/nonexistent_user_xyz")
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
#  3. TRIP PLANNER / agent (port 8001)
# ═══════════════════════════════════════════════════════════════════════════════


class TestTripPlanner:
    """Tests for /search, /plan, /enrich endpoints."""

    def test_health(self):
        r = requests.get(f"{TRIP_PLANNER_URL}/health")
        assert r.status_code == 200

    def test_search_requires_api_key(self):
        r = requests.post(
            f"{TRIP_PLANNER_URL}/search",
            json={"query": "台北文青咖啡"},
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code in (403, 422)

    def test_plan_requires_api_key(self):
        r = requests.post(
            f"{TRIP_PLANNER_URL}/plan",
            json={"query": "test", "user_preference": {}, "top_results": []},
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code in (403, 422)

    @pytest.mark.slow
    def test_search(self):
        """Calls Gemini — marked slow. Skip with: pytest -m 'not slow'"""
        if not YTP_API_KEY:
            pytest.skip("YTP_API_KEY not set")
        r = requests.post(
            f"{TRIP_PLANNER_URL}/search",
            json={"query": "台北文青咖啡", "tg_user_id": -1},
            headers=planner_headers(),
            timeout=120,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "query" in data
        assert "top_results" in data
        return data

    @pytest.mark.slow
    def test_search_then_plan(self):
        """Full search → plan pipeline. Calls Gemini twice."""
        if not YTP_API_KEY:
            pytest.skip("YTP_API_KEY not set")

        # Search
        search_resp = requests.post(
            f"{TRIP_PLANNER_URL}/search",
            json={"query": "台北週末下午", "tg_user_id": -1},
            headers=planner_headers(),
            timeout=120,
        )
        assert search_resp.status_code == 200, search_resp.text

        # Plan
        plan_resp = requests.post(
            f"{TRIP_PLANNER_URL}/plan",
            json=search_resp.json(),
            headers=planner_headers(),
            timeout=120,
        )
        assert plan_resp.status_code == 200, plan_resp.text
        data = plan_resp.json()
        assert "recommended_routes" in data
        assert len(data["recommended_routes"]) > 0
        route = data["recommended_routes"][0]
        assert "route_id" in route
        assert "waypoints" in route


# ═══════════════════════════════════════════════════════════════════════════════
#  4. TRIP MANAGER (port 8003)
# ═══════════════════════════════════════════════════════════════════════════════


class TestTripManager:
    """Tests for trip lifecycle endpoints."""

    def _create_trip(self) -> dict:
        r = requests.post(
            f"{TRIP_MANAGER_URL}/trips",
            json={
                "user_id": "test_user",
                "trip_date": "2026-04-15",
                "chosen_route": SAMPLE_ROUTE,
            },
        )
        assert r.status_code == 200, r.text
        return r.json()

    def test_create_trip(self):
        trip = self._create_trip()
        assert "trip_id" in trip
        assert trip["status"] == "planned"
        assert len(trip["stops"]) == 2

    def test_get_trip(self):
        trip = self._create_trip()
        r = requests.get(f"{TRIP_MANAGER_URL}/trips/{trip['trip_id']}")
        assert r.status_code == 200
        assert r.json()["trip_id"] == trip["trip_id"]

    def test_get_nonexistent_trip_404(self):
        r = requests.get(f"{TRIP_MANAGER_URL}/trips/nonexistent_trip_id")
        assert r.status_code == 404

    def test_list_user_trips(self):
        trip = self._create_trip()
        r = requests.get(f"{TRIP_MANAGER_URL}/users/test_user/trips")
        assert r.status_code == 200
        assert trip["trip_id"] in r.json()["trip_ids"]

    def test_activate_trip(self):
        trip = self._create_trip()
        r = requests.post(f"{TRIP_MANAGER_URL}/trips/{trip['trip_id']}/activate")
        assert r.status_code == 200
        assert r.json()["status"] == "active"

    def test_cancel_trip(self):
        trip = self._create_trip()
        r = requests.post(f"{TRIP_MANAGER_URL}/trips/{trip['trip_id']}/cancel")
        assert r.status_code == 200
        assert r.json()["status"] == "cancelled"

    def test_update_stop_status(self):
        trip = self._create_trip()
        tid = trip["trip_id"]
        # Activate first
        requests.post(f"{TRIP_MANAGER_URL}/trips/{tid}/activate")

        stop_id = trip["stops"][0]["stop_id"]
        r = requests.post(
            f"{TRIP_MANAGER_URL}/trips/{tid}/stops/{stop_id}/status",
            json={"status": "completed"},
        )
        assert r.status_code == 200
        updated_stop = next(
            s for s in r.json()["stops"] if s["stop_id"] == stop_id
        )
        assert updated_stop["status"] == "completed"

    def test_update_stop_invalid_status(self):
        trip = self._create_trip()
        tid = trip["trip_id"]
        requests.post(f"{TRIP_MANAGER_URL}/trips/{tid}/activate")
        stop_id = trip["stops"][0]["stop_id"]
        r = requests.post(
            f"{TRIP_MANAGER_URL}/trips/{tid}/stops/{stop_id}/status",
            json={"status": "invalid_status"},
        )
        assert r.status_code == 400

    def test_check_disruptions(self):
        trip = self._create_trip()
        tid = trip["trip_id"]
        requests.post(f"{TRIP_MANAGER_URL}/trips/{tid}/activate")
        r = requests.post(f"{TRIP_MANAGER_URL}/trips/{tid}/check")
        assert r.status_code == 200
        assert "alerts" in r.json()

    def test_get_alerts(self):
        trip = self._create_trip()
        tid = trip["trip_id"]
        requests.post(f"{TRIP_MANAGER_URL}/trips/{tid}/activate")
        r = requests.get(f"{TRIP_MANAGER_URL}/trips/{tid}/alerts")
        assert r.status_code == 200
        assert "alerts" in r.json()


# ═══════════════════════════════════════════════════════════════════════════════
#  5. END-TO-END: Cross-service flow
# ═══════════════════════════════════════════════════════════════════════════════


class TestEndToEnd:
    """Tests that verify services can work together."""

    def test_create_user_then_create_trip(self):
        """User Profile Manager → Trip Manager (using sample route)."""
        uid = unique_user_id()

        # Create user profile
        r = requests.post(
            f"{USER_PROFILE_URL}/users/",
            json={
                "user_id": uid,
                "display_name": "E2E User",
                "selected_tags": ["文青", "咖啡廳"],
            },
        )
        assert r.status_code == 200

        # Create trip with sample route
        r = requests.post(
            f"{TRIP_MANAGER_URL}/trips",
            json={
                "user_id": uid,
                "trip_date": "2026-04-20",
                "chosen_route": SAMPLE_ROUTE,
            },
        )
        assert r.status_code == 200
        trip = r.json()
        assert trip["user_id"] == uid
        assert trip["status"] == "planned"

        # Activate and check disruptions
        r = requests.post(f"{TRIP_MANAGER_URL}/trips/{trip['trip_id']}/activate")
        assert r.status_code == 200

        r = requests.post(f"{TRIP_MANAGER_URL}/trips/{trip['trip_id']}/check")
        assert r.status_code == 200

    def test_trip_lifecycle_full(self):
        """Create → activate → complete stops → trip done."""
        trip = requests.post(
            f"{TRIP_MANAGER_URL}/trips",
            json={
                "user_id": "lifecycle_test",
                "trip_date": "2026-04-20",
                "chosen_route": SAMPLE_ROUTE,
            },
        ).json()
        tid = trip["trip_id"]

        # Activate
        r = requests.post(f"{TRIP_MANAGER_URL}/trips/{tid}/activate")
        assert r.json()["status"] == "active"

        # Complete all stops
        for stop in trip["stops"]:
            r = requests.post(
                f"{TRIP_MANAGER_URL}/trips/{tid}/stops/{stop['stop_id']}/status",
                json={"status": "completed"},
            )
            assert r.status_code == 200

        # Check final trip status
        r = requests.get(f"{TRIP_MANAGER_URL}/trips/{tid}")
        assert r.status_code == 200
        final = r.json()
        assert all(s["status"] == "completed" for s in final["stops"])

    @pytest.mark.slow
    def test_full_pipeline_search_plan_trip(self):
        """Trip Planner search → plan → Trip Manager create trip.

        Calls Gemini API — marked slow.
        """
        if not YTP_API_KEY:
            pytest.skip("YTP_API_KEY not set")

        # 1. Search
        search_resp = requests.post(
            f"{TRIP_PLANNER_URL}/search",
            json={"query": "台北文青咖啡", "tg_user_id": -1},
            headers=planner_headers(),
            timeout=120,
        )
        assert search_resp.status_code == 200

        # 2. Plan
        plan_resp = requests.post(
            f"{TRIP_PLANNER_URL}/plan",
            json=search_resp.json(),
            headers=planner_headers(),
            timeout=120,
        )
        assert plan_resp.status_code == 200
        routes = plan_resp.json()["recommended_routes"]
        assert len(routes) > 0

        # 3. Create managed trip from first route
        trip_resp = requests.post(
            f"{TRIP_MANAGER_URL}/trips",
            json={
                "user_id": "e2e_full",
                "trip_date": "2026-04-20",
                "chosen_route": routes[0],
            },
        )
        assert trip_resp.status_code == 200
        trip = trip_resp.json()
        assert trip["status"] == "planned"
        assert len(trip["stops"]) > 0

        # 4. Activate
        r = requests.post(f"{TRIP_MANAGER_URL}/trips/{trip['trip_id']}/activate")
        assert r.status_code == 200
        assert r.json()["status"] == "active"


# ═══════════════════════════════════════════════════════════════════════════════
#  pytest configuration
# ═══════════════════════════════════════════════════════════════════════════════


def pytest_configure(config):
    config.addinivalue_line("markers", "slow: tests that call external APIs (Gemini)")
