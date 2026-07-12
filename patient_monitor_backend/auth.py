import json
import urllib.request
import urllib.error
from typing import Any

import os
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

router = APIRouter(prefix="/api/auth")


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user_id: str
    email: str


def _perform_supabase_auth_request(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    url = SUPABASE_URL.rstrip("/") + path
    data = json.dumps(payload).encode("utf-8")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as http_err:
        body = http_err.read().decode("utf-8")
        raise HTTPException(status_code=401, detail=f"Authentication failed: {body}")


def verify_token(token: str) -> dict[str, Any]:
    if not token:
        raise HTTPException(status_code=401, detail="Missing authentication token")

    url = SUPABASE_URL.rstrip("/") + "/auth/v1/user"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {token}",
    }
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            user = json.loads(resp.read().decode("utf-8"))
            return user
    except urllib.error.HTTPError as http_err:
        body = http_err.read().decode("utf-8")
        raise HTTPException(status_code=401, detail=f"Invalid token: {body}")


def require_auth(authorization: str = Header(default="")) -> dict[str, Any]:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    return verify_token(token)


def verify_websocket_token(token: str) -> dict[str, Any]:
    return verify_token(token)


@router.post("/login", response_model=LoginResponse)
async def login(payload: LoginRequest):
    data = _perform_supabase_auth_request("/auth/v1/token?grant_type=password", {
        "email": payload.email,
        "password": payload.password,
    })
    if "access_token" not in data:
        raise HTTPException(status_code=401, detail="Invalid login credentials")
    user = verify_token(data["access_token"])
    return LoginResponse(
        access_token=data["access_token"],
        token_type=data.get("token_type", "bearer"),
        user_id=user.get("id", ""),
        email=user.get("email", ""),
    )
