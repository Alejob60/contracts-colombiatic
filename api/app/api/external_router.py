"""
External process endpoints — Sprint 10B.

POST /api/v1/external/extract-text  — extract metadata from pasted SECOP II text
POST /api/v1/external/extract-url   — extract hints from a SECOP II URL
POST /api/v1/external/save          — save / update an external process
GET  /api/v1/external/{proceso_id}  — get single external process
GET  /api/v1/external/              — list user's external processes
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from fastapi.exceptions import HTTPException
from pydantic import BaseModel, Field

from app.application.manage_external_process import (
    create_external_process,
    get_external_process,
    list_external_processes,
)
from app.config import Settings
from app.dependencies import get_settings, require_pro
from app.infrastructure.secop_text_extractor import (
    extract_from_text,
    extract_from_url,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/external", tags=["external"])


def _uid(user: dict) -> str:
    return str(user.get("sub") or user.get("userId") or "")


# ── Request schemas ───────────────────────────────────────────────────────────

class ExtractTextRequest(BaseModel):
    raw_text: str = Field(..., min_length=50, max_length=20_000)


class ExtractUrlRequest(BaseModel):
    url: str = Field(..., min_length=10)


class SaveExternalProcessRequest(BaseModel):
    proceso_id: str | None = None          # system generates EXT-XXXX if absent
    titulo: str | None = None
    entidad: str | None = None
    nit_entidad: str | None = None
    departamento: str | None = None
    ciudad: str | None = None
    modalidad: str | None = None
    tipo_contrato: str | None = None
    estado: str = "Publicado"
    precio_base: float | None = None
    unspsc_codes: list[str] = Field(default_factory=list)
    url_secop: str | None = None
    fecha_pub: str | None = None
    fecha_cierre: str | None = None
    descripcion: str | None = None
    source: str = "paste"
    raw_input: str | None = None
    extraction_json: dict | None = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/extract-text")
async def extract_text(
    body: ExtractTextRequest,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """Extract structured process metadata from copy-pasted SECOP II page text."""
    result = await extract_from_text(body.raw_text, settings)
    return {
        "extracted": result,
        "confidence": result.get("confianza", 0),
        "source": result.get("source", "regex"),
        "missing_fields": [
            f for f in ["titulo", "entidad", "fecha_cierre", "unspsc_codes"]
            if not result.get(f)
        ],
    }


@router.post("/extract-url")
async def extract_url_hints(
    body: ExtractUrlRequest,
    user: dict = Depends(require_pro),
):
    """Extract process ID hints from a community.secop.gov.co URL."""
    result = extract_from_url(body.url)
    return result


@router.post("/save", status_code=201)
async def save_external_process(
    body: SaveExternalProcessRequest,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """
    Create or update an external process for the current user.
    Returns the proceso_id (EXT-XXXXXXXX) used for workspace and evaluation.
    """
    if not body.titulo and not body.entidad:
        raise HTTPException(
            status_code=400,
            detail="Se requiere al menos el título o la entidad del proceso.",
        )
    proc = await create_external_process(_uid(user), body.model_dump(), settings)
    return proc


@router.get("/")
async def list_external(
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    procs = await list_external_processes(_uid(user), settings)
    return {"processes": procs, "total": len(procs)}


@router.get("/{proceso_id}")
async def get_external(
    proceso_id: str,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    proc = await get_external_process(proceso_id, _uid(user), settings)
    if not proc:
        raise HTTPException(status_code=404, detail="Proceso externo no encontrado")
    return proc
