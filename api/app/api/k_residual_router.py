"""
Capacidad Residual K endpoints — Sprint 11A.

GET  /api/v1/k-residual/             — current K analysis for user's company
GET  /api/v1/k-residual/contracts    — list active contracts
POST /api/v1/k-residual/contracts    — add / update active contract
DELETE /api/v1/k-residual/contracts/{id} — delete contract
"""
from __future__ import annotations

import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.application.manage_k_residual import (
    get_k_residual,
    list_active_contracts,
    upsert_active_contract,
    delete_active_contract,
)
from app.config import Settings
from app.dependencies import get_current_user, get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/k-residual", tags=["k-residual"])


def _uid(user: dict) -> str:
    return str(user.get("sub") or user.get("userId") or "")


class ActiveContractIn(BaseModel):
    id:           str | None = None
    entidad:      str        = Field(..., min_length=2)
    descripcion:  str | None = None
    valor_cop:    float      = Field(..., gt=0, description="Valor del contrato en COP")
    fecha_inicio: date
    fecha_fin:    date
    estado:       str        = "ACTIVO"
    proceso_id:   str | None = None


@router.get("/")
async def k_summary(
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Returns the company's K_residual (remaining contracting capacity).

    K_total (SMMLV) comes from company_profiles.capacidad_k.
    K_utilizado = sum of active contracts / SMMLV of current year.
    K_residual = K_total - K_utilizado.
    """
    return await get_k_residual(_uid(user), settings)


@router.get("/contracts")
async def list_contracts(
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    contracts = await list_active_contracts(_uid(user), settings)
    return {"contracts": contracts, "total": len(contracts)}


@router.post("/contracts", status_code=201)
async def save_contract(
    body: ActiveContractIn,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    if body.fecha_fin < body.fecha_inicio:
        raise HTTPException(400, "fecha_fin debe ser posterior a fecha_inicio")
    return await upsert_active_contract(_uid(user), body.model_dump(), settings)


@router.delete("/contracts/{contract_id}")
async def remove_contract(
    contract_id: str,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    ok = await delete_active_contract(contract_id, _uid(user), settings)
    if not ok:
        raise HTTPException(404, "Contrato no encontrado")
    return {"deleted": True}
