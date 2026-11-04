"""
SECOP II domain models — Sprint 1.

Frozen Pydantic value objects. Field names align with the Socrata SODA
response columns from datos.gov.co so the gateway adapter can map with
minimal transformation.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class SecopFilter(BaseModel):
    """Query parameters for SECOP II search — maps to SODA $where clauses."""
    model_config = ConfigDict(frozen=True)

    query: Optional[str] = None
    departamento: Optional[str] = None
    modalidad: Optional[str] = None
    tipo_contrato: Optional[str] = None
    estado: Optional[str] = None
    codigo_unspsc: Optional[str] = None
    precio_min: Optional[Decimal] = None
    precio_max: Optional[Decimal] = None
    fecha_desde: Optional[datetime] = None
    fecha_hasta: Optional[datetime] = None
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=20, ge=1, le=100)


class SecopProcess(BaseModel):
    """Single SECOP II procurement process (normalized from SODA row)."""
    model_config = ConfigDict(frozen=True)

    proceso_id: str
    entidad: str
    nit_entidad: str = ""
    departamento_entidad: str = ""
    ciudad_entidad: str = ""
    nombre_del_procedimiento: str
    descripcion: str = ""
    precio_base: Optional[Decimal] = None
    modalidad: str = ""
    tipo_contrato: str = ""
    estado: str = ""
    codigo_unspsc: str = ""
    url_proceso: str = ""
    fecha_publicacion: datetime = Field(default_factory=lambda: datetime.now(tz=timezone.utc))
    duracion: Optional[int] = None
    unidad_duracion: Optional[str] = None


class SecopSearchResult(BaseModel):
    """Paginated search result set."""
    model_config = ConfigDict(frozen=True)

    results: list[SecopProcess] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 20
    cached: bool = False
    response_time_ms: int = 0
