"""Offline auth stub — Supabase removed. Kiosk mode does not require cloud login."""

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth")


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    email: str


@router.post("/login", response_model=LoginResponse)
async def login(_payload: LoginRequest):
    raise HTTPException(
        status_code=501,
        detail="Cloud login disabled. This build runs offline with SQLite on the Raspberry Pi.",
    )


def require_auth(authorization: str = Header(default="")) -> dict[str, Any]:
    # Kept for compatibility; live monitor WebSocket does not require auth.
    if not authorization:
        return {"mode": "offline"}
    return {"mode": "offline", "authorization": authorization}


def verify_websocket_token(_token: str) -> dict[str, Any]:
    return {"mode": "offline"}
