"""
SECOP II SODA Gateway — concrete implementation of ISecopGateway.

Calls the Socrata SODA v2 API at datos.gov.co, handles authentication
with the App Token + API Key credentials, builds $where clauses from
SecopFilter, normalizes the raw SODA response into domain models, and
supports exponential-backoff retry on 429 / transient errors.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from decimal import Decimal
from typing import Any

import httpx

from app.config import Settings
from app.domain.models.secop import SecopFilter, SecopProcess, SecopSearchResult
from app.domain.ports.secop_gateway import ISecopGateway

logger = logging.getLogger(__name__)

# Fields we request via $select to keep payloads small
_SELECT_FIELDS = ",".join([
    "id_del_proceso",
    "entidad",
    "nit_entidad",
    "departamento_entidad",
    "ciudad_entidad",
    "nombre_del_procedimiento",
    "descripci_n_del_procedimiento",
    "precio_base",
    "modalidad_de_contratacion",
    "tipo_de_contrato",
    "estado_de_apertura_del_proceso",
    "codigo_principal_de_categoria",
    "urlproceso",
    "fecha_de_publicacion_del",
    "duracion",
    "unidad_de_duracion",
])


def _build_where(f: SecopFilter) -> list[str]:
    """Convert SecopFilter fields into SODA $where clause fragments."""
    clauses: list[str] = []
    if f.departamento:
        safe = f.departamento.replace("'", "''")
        clauses.append(f"departamento_entidad='{safe}'")
    if f.municipio:
        safe = f.municipio.replace("'", "''")
        clauses.append(f"ciudad_entidad='{safe}'")
    if f.modalidad:
        safe = f.modalidad.replace("'", "''")
        clauses.append(f"modalidad_de_contratacion='{safe}'")
    if f.tipo_contrato:
        safe = f.tipo_contrato.replace("'", "''")
        clauses.append(f"tipo_de_contrato='{safe}'")
    if f.estado:
        safe = f.estado.replace("'", "''")
        clauses.append(f"estado_de_apertura_del_proceso='{safe}'")
    if f.codigo_unspsc:
        safe = f.codigo_unspsc.replace("'", "''")
        clauses.append(f"starts_with(codigo_principal_de_categoria,'{safe}')")
    if f.precio_min is not None:
        clauses.append(f"precio_base>='{f.precio_min}'")
    if f.precio_max is not None:
        clauses.append(f"precio_base<='{f.precio_max}'")
    if f.fecha_desde:
        clauses.append(f"fecha_de_publicacion_del>='{f.fecha_desde.isoformat()}'")
    if f.fecha_hasta:
        clauses.append(f"fecha_de_publicacion_del<='{f.fecha_hasta.isoformat()}'")
    return clauses


def _normalize_row(row: dict[str, Any]) -> SecopProcess | None:
    """Map a raw SODA row dict to a SecopProcess domain model."""
    try:
        proceso_id = (
            row.get("id_del_proceso")
            or row.get("referencia_del_proceso")
            or row.get("ppi")
            or ""
        )
        if not proceso_id:
            return None

        # urlproceso arrives as {"url": "..."} or as a plain string
        raw_url = row.get("urlproceso", {})
        if isinstance(raw_url, dict):
            url_proceso = raw_url.get("url", "")
        else:
            url_proceso = str(raw_url) if raw_url else ""

        # fecha_de_publicacion_del is an ISO string
        from datetime import datetime, timezone
        fecha_raw = row.get("fecha_de_publicacion_del", "")
        try:
            fecha = datetime.fromisoformat(fecha_raw.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            fecha = datetime(2000, 1, 1, tzinfo=timezone.utc)  # sentinel: missing date

        # precio_base comes as a string
        precio_raw = row.get("precio_base")
        try:
            precio_base = Decimal(str(precio_raw)) if precio_raw not in (None, "", "0") else None
        except Exception:
            precio_base = None

        duracion_raw = row.get("duracion")
        try:
            duracion = int(duracion_raw) if duracion_raw not in (None, "", "0") else None
        except (ValueError, TypeError):
            duracion = None

        return SecopProcess(
            proceso_id=str(proceso_id),
            entidad=row.get("entidad", ""),
            nit_entidad=row.get("nit_entidad", ""),
            departamento_entidad=row.get("departamento_entidad", ""),
            ciudad_entidad=row.get("ciudad_entidad", ""),
            nombre_del_procedimiento=row.get("nombre_del_procedimiento", ""),
            descripcion=row.get("descripci_n_del_procedimiento", ""),
            precio_base=precio_base,
            modalidad=row.get("modalidad_de_contratacion", ""),
            tipo_contrato=row.get("tipo_de_contrato", ""),
            estado=row.get("estado_de_apertura_del_proceso", ""),
            codigo_unspsc=row.get("codigo_principal_de_categoria", ""),
            url_proceso=url_proceso,
            fecha_publicacion=fecha,
            duracion=duracion,
            unidad_duracion=row.get("unidad_de_duracion"),
        )
    except Exception as exc:
        logger.warning("Could not normalize SECOP row: %s — %s", row.get("id_del_proceso"), exc)
        return None


class SecopSodaGateway(ISecopGateway):
    """
    Socrata SODA v2 adapter for SECOP II.

    Authentication uses:
    1. X-App-Token header (raises rate limit from 1 req/s to 1000 req/s)
    2. HTTP Basic auth with API Key ID + Secret for authenticated endpoints
    """

    def __init__(self, settings: Settings) -> None:
        self._url = settings.SECOP_API_URL
        self._cache_ttl_search = settings.SECOP_CACHE_TTL_SEARCH
        self._cache_ttl_detail = settings.SECOP_CACHE_TTL_DETAIL

        headers: dict[str, str] = {"Accept": "application/json"}
        if settings.SECOP_APP_TOKEN:
            headers["X-App-Token"] = settings.SECOP_APP_TOKEN

        auth: httpx.BasicAuth | None = None
        if settings.SECOP_API_KEY_ID and settings.SECOP_API_KEY_SECRET:
            auth = httpx.BasicAuth(
                username=settings.SECOP_API_KEY_ID,
                password=settings.SECOP_API_KEY_SECRET,
            )

        self._client = httpx.AsyncClient(
            headers=headers,
            auth=auth,
            timeout=30.0,
            follow_redirects=True,
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _get(self, params: dict[str, Any], retries: int = 3) -> list[dict]:
        """Execute a SODA query with retry on 429 / 5xx."""
        for attempt in range(retries):
            try:
                response = await self._client.get(self._url, params=params)
                if response.status_code == 429:
                    wait = 2 ** attempt
                    logger.warning("SECOP rate limited, waiting %ss (attempt %d)", wait, attempt + 1)
                    await asyncio.sleep(wait)
                    continue
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as exc:
                if attempt == retries - 1:
                    logger.error("SECOP API error %s: %s", exc.response.status_code, exc.response.text[:200])
                    raise
            except httpx.RequestError as exc:
                if attempt == retries - 1:
                    logger.error("SECOP request failed: %s", exc)
                    raise
                await asyncio.sleep(2 ** attempt)
        return []

    async def search(self, filters: SecopFilter) -> SecopSearchResult:
        t_start = time.monotonic()
        where_clauses = _build_where(filters)
        where_str = " AND ".join(where_clauses) if where_clauses else None

        base_params: dict[str, Any] = {
            "$select": _SELECT_FIELDS,
            "$limit": filters.limit,
            "$offset": filters.offset,
            "$order": "fecha_de_publicacion_del DESC",
        }
        if where_str:
            base_params["$where"] = where_str
        if filters.query:
            base_params["$q"] = filters.query

        # Fetch results and total count in parallel
        count_params = {"$select": "count(*)", "$limit": 1}
        if where_str:
            count_params["$where"] = where_str
        if filters.query:
            count_params["$q"] = filters.query

        rows_task = asyncio.create_task(self._get(base_params))
        count_task = asyncio.create_task(self._get(count_params))
        rows, count_rows = await asyncio.gather(rows_task, count_task)

        processes: list[SecopProcess] = []
        for row in rows:
            proc = _normalize_row(row)
            if proc:
                processes.append(proc)

        total = 0
        if count_rows:
            try:
                total = int(count_rows[0].get("count", 0))
            except (KeyError, ValueError, IndexError):
                total = len(processes)

        elapsed_ms = int((time.monotonic() - t_start) * 1000)
        logger.info(
            "SECOP search: query=%r dept=%r offset=%d → %d/%d results in %dms",
            filters.query, filters.departamento, filters.offset, len(processes), total, elapsed_ms,
        )

        return SecopSearchResult(
            results=processes,
            total=total,
            offset=filters.offset,
            limit=filters.limit,
            cached=False,
            response_time_ms=elapsed_ms,
        )

    async def get_process(self, proceso_id: str) -> SecopProcess | None:
        safe_id = proceso_id.replace("'", "''")
        rows = await self._get({
            "$select": _SELECT_FIELDS,
            "$where": f"id_del_proceso='{safe_id}'",
            "$limit": 1,
        })
        if not rows:
            return None
        return _normalize_row(rows[0])

    async def get_municipios_by_departamento(self, departamento: str) -> list[str]:
        """Return sorted list of distinct municipalities that have contracts in *departamento*."""
        safe = departamento.replace("'", "''")
        rows = await self._get({
            "$select": "ciudad_entidad",
            "$where": f"departamento_entidad='{safe}'",
            "$group": "ciudad_entidad",
            "$order": "ciudad_entidad ASC",
            "$limit": 500,
        })
        return sorted([
            row["ciudad_entidad"].strip()
            for row in rows
            if row.get("ciudad_entidad") and row["ciudad_entidad"].strip()
        ])
