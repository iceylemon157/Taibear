"""
interface/api/auth_routes.py — FastAPI auth routes for register/login/session.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

_auth_service = None


def set_auth_service(service) -> None:
    global _auth_service
    _auth_service = service


def _auth():
    if _auth_service is None:
        raise HTTPException(status_code=503, detail="AuthService not initialised")
    return _auth_service


def _extract_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        return None
    token = authorization[len(prefix):].strip()
    return token or None


router = APIRouter(tags=["auth"])


class RegisterRequest(BaseModel):
    user_id: str
    password: str
    display_name: str
    country: str = ""
    preferred_languages: list[str] = []
    age: int = 0
    preferred_transportation: list[str] = []
    selected_tags: list[str] = []


class LoginRequest(BaseModel):
    user_id: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


@router.post("/register")
async def register(body: RegisterRequest) -> dict[str, Any]:
    try:
        return _auth().register(
            user_id=body.user_id,
            password=body.password,
            display_name=body.display_name,
            country=body.country,
            preferred_languages=body.preferred_languages,
            age=body.age,
            preferred_transportation=body.preferred_transportation,
            selected_tags=body.selected_tags,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(body: LoginRequest) -> dict[str, Any]:
    try:
        return _auth().login(user_id=body.user_id, password=body.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/refresh")
async def refresh(body: RefreshRequest) -> dict[str, Any]:
    try:
        return _auth().refresh(refresh_token=body.refresh_token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/logout")
async def logout(
    body: LogoutRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    access_token = _extract_bearer_token(authorization)
    changed = _auth().logout(access_token=access_token, refresh_token=body.refresh_token)
    return {"ok": True, "revoked": changed}


@router.get("/me")
async def me(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    access_token = _extract_bearer_token(authorization)
    if not access_token:
        raise HTTPException(status_code=401, detail="Missing bearer token.")

    try:
        user = _auth().me(access_token=access_token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except KeyError:
        raise HTTPException(status_code=404, detail="User profile not found.")

    return {"user": user}
