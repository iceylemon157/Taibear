"""
trip_manager/api/routes.py — FastAPI routes for the Trip Manager service.

Mount this router in the main FastAPI app:
    app.include_router(router)
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# These will be injected by main.py via set_manager()
_manager = None


def set_manager(manager) -> None:
    global _manager
    _manager = manager


def _mgr():
    if _manager is None:
        raise HTTPException(status_code=503, detail="TripManager not initialised")
    return _manager


router = APIRouter(tags=["trips"])


# ── Request models ────────────────────────────────────────────────────────────

class CreateTripRequest(BaseModel):
    user_id: str
    trip_date: str  # YYYY-MM-DD
    chosen_route: dict  # one entry from recommended_routes[]


class UpdateStopStatusRequest(BaseModel):
    status: str  # "pending" | "active" | "completed" | "skipped"


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/trips")
async def create_trip(body: CreateTripRequest) -> dict[str, Any]:
    """Create a new trip from a chosen route."""
    trip = _mgr().create_trip(
        user_id=body.user_id,
        trip_date=body.trip_date,
        chosen_route=body.chosen_route,
    )
    return trip.to_dict()


@router.get("/trips/{trip_id}")
async def get_trip(trip_id: str) -> dict[str, Any]:
    """Get full trip status, stops, and active alerts."""
    try:
        trip = _mgr().get_trip(trip_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Trip '{trip_id}' not found")
    return trip.to_dict()


@router.get("/users/{user_id}/trips")
async def list_user_trips(user_id: str) -> dict[str, Any]:
    """List all trip IDs for a user."""
    ids = _mgr().list_trips(user_id=user_id)
    return {"user_id": user_id, "trip_ids": ids}


@router.post("/trips/{trip_id}/activate")
async def activate_trip(trip_id: str) -> dict[str, Any]:
    """Activate a planned trip and start background polling."""
    try:
        trip = _mgr().activate_trip(trip_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Trip '{trip_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Start background polling
    await _mgr().start_polling(trip_id)
    return trip.to_dict()


@router.post("/trips/{trip_id}/cancel")
async def cancel_trip(trip_id: str) -> dict[str, Any]:
    """Cancel a trip."""
    try:
        trip = _mgr().cancel_trip(trip_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Trip '{trip_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return trip.to_dict()


@router.post("/trips/{trip_id}/stops/{stop_id}/status")
async def update_stop_status(
    trip_id: str, stop_id: str, body: UpdateStopStatusRequest
) -> dict[str, Any]:
    """Update a stop's status (pending / active / completed / skipped)."""
    from trip_manager.models.trip import StopStatus

    try:
        new_status = StopStatus(body.status)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status '{body.status}'. Valid: pending, active, completed, skipped",
        )
    try:
        trip = _mgr().update_stop_status(trip_id, stop_id, new_status)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return trip.to_dict()


@router.post("/trips/{trip_id}/check")
async def check_disruptions(trip_id: str) -> dict[str, Any]:
    """Manually trigger a disruption check against real-time data."""
    try:
        alerts = _mgr().check_disruptions(trip_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Trip '{trip_id}' not found")
    return {
        "trip_id": trip_id,
        "alerts": [a.to_dict() for a in alerts],
        "count": len(alerts),
    }


@router.get("/trips/{trip_id}/alerts")
async def get_alerts(trip_id: str) -> dict[str, Any]:
    """Get current active alerts for a trip."""
    try:
        trip = _mgr().get_trip(trip_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Trip '{trip_id}' not found")
    return {
        "trip_id": trip_id,
        "alerts": trip.active_alerts,
        "count": len(trip.active_alerts),
    }


@router.post("/trips/{trip_id}/replan")
async def replan_trip(trip_id: str) -> dict[str, Any]:
    """Manually trigger a replan of remaining stops."""
    try:
        trip = _mgr().trigger_replan(trip_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Trip '{trip_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    return trip.to_dict()
