"""
interface/api/routes.py — FastAPI routes for user profile CRUD.

Mount this router in the main FastAPI app:
    from interface.api.routes import router, set_service
    set_service(service)
    app.include_router(router, prefix="/users")
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Injected by main.py via set_service()
_service = None


def set_service(service) -> None:
    global _service
    _service = service


def _svc():
    if _service is None:
        raise HTTPException(status_code=503, detail="UserService not initialised")
    return _service


router = APIRouter(tags=["users"])

# ── Request models ────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    user_id: str                                   # email address
    display_name: str
    country: str = ""
    preferred_languages: list[str] = []
    age: int = 0
    preferred_transportation: list[str] = []
    selected_tags: list[str] = []


class UpdateUserRequest(BaseModel):
    display_name: str | None = None
    country: str | None = None
    preferred_languages: list[str] | None = None
    age: int | None = None
    preferred_transportation: list[str] | None = None
    selected_tags: list[str] | None = None


class AddTagRequest(BaseModel):
    tag: str


class RemoveTagRequest(BaseModel):
    tag: str


class AddReelRequest(BaseModel):
    url: str
    text_content: str = ""


class RemoveReelRequest(BaseModel):
    url: str


# ── Routes ────────────────────────────────────────────────────────────────

@router.get("/")
async def list_users() -> dict[str, Any]:
    """List all user IDs."""
    ids = _svc().list_users()
    return {"user_ids": ids, "count": len(ids)}


@router.post("/")
async def create_user(body: CreateUserRequest) -> dict[str, Any]:
    """Create a new user profile."""
    try:
        pref = _svc().create_user(
            user_id=body.user_id,
            display_name=body.display_name,
            country=body.country,
            preferred_languages=body.preferred_languages,
            age=body.age,
            preferred_transportation=body.preferred_transportation,
            selected_tags=body.selected_tags,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return pref.to_dict()


@router.get("/{user_id:path}")
async def get_user(user_id: str) -> dict[str, Any]:
    """Get a user profile by email."""
    try:
        pref = _svc().get_user(user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    return pref.to_dict()


@router.put("/{user_id:path}")
async def update_user(user_id: str, body: UpdateUserRequest) -> dict[str, Any]:
    """Partial update of a user profile."""
    try:
        pref = _svc().update_user(user_id, **body.model_dump(exclude_none=True))
    except KeyError:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return pref.to_dict()


@router.delete("/{user_id:path}")
async def delete_user(user_id: str) -> dict[str, Any]:
    """Delete a user profile."""
    try:
        _svc().delete_user(user_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    return {"deleted": user_id}


@router.post("/{user_id:path}/tags")
async def add_tag(user_id: str, body: AddTagRequest) -> dict[str, Any]:
    """Add a tag to the user's selected_tags."""
    try:
        _svc().add_tag(user_id, body.tag)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    pref = _svc().get_user(user_id)
    return pref.to_dict()


@router.delete("/{user_id:path}/tags")
async def remove_tag(user_id: str, body: RemoveTagRequest) -> dict[str, Any]:
    """Remove a tag from the user's selected_tags."""
    try:
        _svc().remove_tag(user_id, body.tag)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    pref = _svc().get_user(user_id)
    return pref.to_dict()


@router.post("/{user_id:path}/reels")
async def add_reel(user_id: str, body: AddReelRequest) -> dict[str, Any]:
    """Add a reel to the user's profile."""
    try:
        _svc().add_reel(user_id, body.url, body.text_content)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    pref = _svc().get_user(user_id)
    return pref.to_dict()


@router.delete("/{user_id:path}/reels")
async def remove_reel(user_id: str, body: RemoveReelRequest) -> dict[str, Any]:
    """Remove a reel from the user's profile."""
    try:
        _svc().remove_reel(user_id, body.url)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"User '{user_id}' not found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    pref = _svc().get_user(user_id)
    return pref.to_dict()
