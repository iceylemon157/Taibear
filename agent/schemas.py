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


# ── Hidden Spots ────────────────────────────────────────────────────────────────


class HiddenSpotPhotoOut(BaseModel):
    id: int
    file_path: str
    uploaded_by: int | None
    created_at: str | None


class HiddenSpotCommentOut(BaseModel):
    id: int
    user_id: int | None
    content: str
    rating: int | None
    created_at: str | None


class HiddenSpotDetail(BaseModel):
    id: int
    google_place_id: str
    name: str
    address: str | None
    lat: float | None
    lng: float | None
    description: str | None
    category: str | None
    vibes: list[str]
    submitted_by: int | None
    created_at: str | None
    photos: list[HiddenSpotPhotoOut]
    comments: list[HiddenSpotCommentOut]


class HiddenSpotSubmitResponse(BaseModel):
    created: bool
    spot: HiddenSpotDetail


class HiddenSpotListItem(BaseModel):
    id: int
    google_place_id: str
    name: str
    address: str | None
    category: str | None
    vibes: list[str]
    photo_count: int
    comment_count: int
