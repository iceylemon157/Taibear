"""
schemas.py — API Pydantic schemas

UserPreference と Reel は agent/models.py から import（唯一真相）。
"""

from pydantic import BaseModel

from agent.models import Reel, UserPreference  # noqa: F401 — re-exported


class ExtractedPlace(BaseModel):
    name: str
    context: str


class TopResult(BaseModel):
    rank: int
    title: str
    url: str = ""
    relevance_score: float
    summary: str = ""
    extracted_places: list[ExtractedPlace]
    tags: list[str]


class SpotResult(BaseModel):
    """POST /search の出力 = POST /plan の入力。"""

    query: str
    user_preference: UserPreference
    top_results: list[TopResult]


class Location(BaseModel):
    lat: float
    lng: float


class Waypoint(BaseModel):
    step_order: int
    name: str
    place_id: str
    location: Location
    suggested_time: str
    reasoning: str


class TspEvaluation(BaseModel):
    total_transit_time_mins: int
    smoothness_score: float


class Route(BaseModel):
    route_id: str
    route_name: str
    theme: str
    tsp_evaluation: TspEvaluation
    google_maps_url: str
    waypoints: list[Waypoint]


class PlanResponse(BaseModel):
    recommended_routes: list[Route]
