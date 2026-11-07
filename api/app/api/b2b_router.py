"""
B2B network endpoints — Sprint 8.

GET  /api/v1/b2b/my-profile              — get/default my B2B profile
PUT  /api/v1/b2b/my-profile              — upsert bio / visibility
GET  /api/v1/b2b/directory               — searchable public company directory
POST /api/v1/b2b/connect/{target_user_id}— send connection request (PRO)
GET  /api/v1/b2b/connections             — list all my connections
PUT  /api/v1/b2b/connections/{id}        — accept or reject a connection
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.application.manage_b2b import (
    get_b2b_profile,
    upsert_b2b_profile,
    search_directory,
    send_connection,
    respond_connection,
    get_my_connections,
)
from app.config import Settings
from app.dependencies import get_current_user, get_settings, require_pro

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/b2b", tags=["b2b"])


def _user_id(user: dict) -> str:
    return str(user.get("sub") or user.get("userId") or "")


# ── Request schemas ────────────────────────────────────────────────────────

class B2BProfileIn(BaseModel):
    is_public: bool = False
    bio: str | None = Field(default=None, max_length=500)
    website: str | None = Field(default=None, max_length=500)


class ConnectRequest(BaseModel):
    message: str | None = Field(default=None, max_length=300)


class RespondRequest(BaseModel):
    accept: bool


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/my-profile")
async def my_b2b_profile(
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await get_b2b_profile(_user_id(user), settings)


@router.put("/my-profile")
async def update_b2b_profile(
    body: B2BProfileIn,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    return await upsert_b2b_profile(_user_id(user), body.model_dump(), settings)


@router.get("/directory")
async def directory(
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
    q: str | None = Query(default=None, description="Buscar por nombre de empresa"),
    sector: str | None = Query(default=None),
    departamento: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
):
    return await search_directory(
        _user_id(user), q, sector, departamento, limit, offset, settings
    )


@router.post("/connect/{target_user_id}", status_code=status.HTTP_201_CREATED)
async def connect(
    target_user_id: str,
    body: ConnectRequest = ConnectRequest(),
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    requester = _user_id(user)
    if requester == target_user_id:
        raise HTTPException(status_code=400, detail="No puedes conectarte contigo mismo")
    return await send_connection(requester, target_user_id, body.message, settings)


@router.get("/connections")
async def connections(
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    conns = await get_my_connections(_user_id(user), settings)
    return {"connections": conns, "total": len(conns)}


@router.put("/connections/{connection_id}")
async def respond(
    connection_id: str,
    body: RespondRequest,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    result = await respond_connection(connection_id, _user_id(user), body.accept, settings)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Conexión no encontrada o ya fue respondida",
        )
    return result
