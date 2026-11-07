"""
Alert configuration and recent events endpoints — Sprint 6.

All endpoints require PRO_LICITADOR subscription.

GET  /api/v1/alerts/config   — read current config (or default empty)
PUT  /api/v1/alerts/config   — create/update config
GET  /api/v1/alerts/events   — list recent alert deliveries
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.application.manage_alerts import (
    get_alert_config,
    upsert_alert_config,
    get_alert_events,
)
from app.config import Settings
from app.dependencies import get_settings, require_pro

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


# ── Request schema ────────────────────────────────────────────────────────

class AlertConfigIn(BaseModel):
    is_active: bool = True
    min_match_score: int = Field(70, ge=0, le=100)
    channels: list[str] = Field(default_factory=lambda: ["email"])
    email: str | None = None
    whatsapp_number: str | None = None
    unspsc_filter: list[str] = Field(default_factory=list)
    departamento_filter: list[str] = Field(default_factory=list)
    modalidad_filter: list[str] = Field(default_factory=list)
    precio_min: float | None = None
    precio_max: float | None = None
    keywords: str | None = None  # comma-separated terms


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/config")
async def get_config(
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    user_id = str(user.get("sub") or user.get("userId") or "")
    config = await get_alert_config(user_id, settings)
    if config:
        return config
    # First visit — return a sensible default without creating a DB row
    return {
        "user_id": user_id,
        "is_active": False,
        "min_match_score": 70,
        "channels": ["email"],
        "email": str(user.get("email") or ""),
        "whatsapp_number": None,
        "unspsc_filter": [],
        "departamento_filter": [],
        "modalidad_filter": [],
        "precio_min": None,
        "precio_max": None,
        "keywords": None,
    }


@router.put("/config")
async def update_config(
    body: AlertConfigIn,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    user_id = str(user.get("sub") or user.get("userId") or "")
    data = body.model_dump()
    # Fall back to JWT email when the caller did not supply one
    if not data.get("email"):
        data["email"] = str(user.get("email") or "")
    return await upsert_alert_config(user_id, data, settings)


@router.get("/events")
async def list_events(
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
    limit: int = Query(default=30, ge=1, le=100),
):
    user_id = str(user.get("sub") or user.get("userId") or "")
    events = await get_alert_events(user_id, settings, limit)
    return {"events": events, "total": len(events)}
