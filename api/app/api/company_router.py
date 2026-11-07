"""
Company profile and saved processes — Sprint 3.

Endpoints:
  GET  /api/v1/company/profile               — get authenticated user's company
  PUT  /api/v1/company/profile               — create / update company profile
  GET  /api/v1/company/saved                 — list saved SECOP processes
  POST /api/v1/company/saved                 — save a process
  DELETE /api/v1/company/saved/{proceso_id}  — unsave
  PUT  /api/v1/company/saved/{proceso_id}/alert — toggle alert
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.dependencies import get_current_user, get_settings
from app.config import Settings
from app.application.manage_company import (
    get_company_profile,
    upsert_company_profile,
    get_saved_processes,
    save_process,
    unsave_process,
    toggle_alert,
)

router = APIRouter(prefix="/api/v1/company", tags=["company"])


def _user_id(user: dict[str, Any]) -> str:
    uid = str(user.get("sub") or user.get("userId") or "")
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No user ID in token")
    return uid


# ── Request models ─────────────────────────────────────────────────────────

class ProfileUpdateRequest(BaseModel):
    nit:              str
    nit_dv:           str | None  = None
    razon_social:     str
    nombre_comercial: str | None  = None
    representante:    str | None  = None
    email_contacto:   str | None  = None
    telefono:         str | None  = None
    departamento:     str | None  = None
    ciudad:           str | None  = None
    unspsc_codes:     list[str]   = []
    capacidad_k:      float | None = None
    sector:           str | None  = None
    tamano:           str | None  = None


class SaveProcessRequest(BaseModel):
    proceso_id:     str
    nombre_proceso: str | None  = None
    entidad:        str | None  = None
    precio_base:    float | None = None
    departamento:   str | None  = None
    ciudad:         str | None  = None
    estado:         str | None  = None
    notes:          str | None  = None


class AlertToggleRequest(BaseModel):
    enabled: bool


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(
    user:     dict[str, Any] = Depends(get_current_user),
    settings: Settings       = Depends(get_settings),
) -> JSONResponse:
    """Return the authenticated user's company profile, or 404."""
    profile = await get_company_profile(_user_id(user), settings)
    if profile is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Perfil de empresa no encontrado"},
        )
    return JSONResponse(content=profile)


@router.put("/profile", status_code=200)
async def update_profile(
    body:     ProfileUpdateRequest,
    user:     dict[str, Any] = Depends(get_current_user),
    settings: Settings       = Depends(get_settings),
) -> JSONResponse:
    """Create or update the authenticated user's company profile."""
    try:
        profile = await upsert_company_profile(_user_id(user), body.model_dump(), settings)
        return JSONResponse(content=profile)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error guardando perfil: {exc}",
        ) from exc


@router.get("/saved")
async def list_saved(
    user:     dict[str, Any] = Depends(get_current_user),
    settings: Settings       = Depends(get_settings),
) -> JSONResponse:
    """List saved SECOP processes for the authenticated user."""
    processes = await get_saved_processes(_user_id(user), settings)
    return JSONResponse(content={"saved": processes, "total": len(processes)})


@router.post("/saved", status_code=201)
async def save_secop_process(
    body:     SaveProcessRequest,
    user:     dict[str, Any] = Depends(get_current_user),
    settings: Settings       = Depends(get_settings),
) -> JSONResponse:
    """Save a SECOP II process to the user's watchlist."""
    try:
        saved = await save_process(_user_id(user), body.model_dump(), settings)
        return JSONResponse(status_code=201, content=saved)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.delete("/saved/{proceso_id}", status_code=204)
async def unsave_secop_process(
    proceso_id: str,
    user:       dict[str, Any] = Depends(get_current_user),
    settings:   Settings       = Depends(get_settings),
) -> JSONResponse:
    """Remove a saved process from the user's watchlist."""
    deleted = await unsave_process(_user_id(user), proceso_id, settings)
    if not deleted:
        raise HTTPException(status_code=404, detail="Proceso no encontrado en guardados")
    return JSONResponse(status_code=204, content=None)


@router.put("/saved/{proceso_id}/alert")
async def toggle_process_alert(
    proceso_id: str,
    body:       AlertToggleRequest,
    user:       dict[str, Any] = Depends(get_current_user),
    settings:   Settings       = Depends(get_settings),
) -> JSONResponse:
    """Enable or disable alert for a saved process."""
    updated = await toggle_alert(_user_id(user), proceso_id, body.enabled, settings)
    if updated is None:
        raise HTTPException(status_code=404, detail="Proceso no encontrado en guardados")
    return JSONResponse(content=updated)
