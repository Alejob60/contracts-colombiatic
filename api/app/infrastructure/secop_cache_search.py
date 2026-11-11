"""
Local SECOP cache search — Sprint 10A.

Searches the local contracts.secop_processes_cache table.
Uses PostgreSQL full-text search (GIN index on tsvector) which is
10-50x faster than calling the remote SODA API.

Returns None when the cache is cold (< _MIN_WARM_SIZE records),
signalling the caller to fall back to the SODA API.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING

import asyncpg

if TYPE_CHECKING:
    from app.config import Settings
    from app.domain.models.secop import SecopFilter, SecopSearchResult

logger = logging.getLogger(__name__)

_MIN_WARM_SIZE = 5_000   # below this → treat cache as cold, use SODA


async def search_cache(
    filters: "SecopFilter",
    settings: "Settings",
) -> "SecopSearchResult | None":
    """
    Search the local SECOP cache.

    Returns None if:
    - Cache is cold (< _MIN_WARM_SIZE records)
    - Query returns 0 results AND we suspect the cache doesn't have the record
      (falls back to SODA for potential misses on very recent processes)
    """
    from app.application.manage_company import get_pg_url
    from app.domain.models.secop import SecopProcess, SecopSearchResult

    conn = await asyncpg.connect(
        get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    try:
        # Check cache warmth
        cache_total = await conn.fetchval(
            "SELECT cache_total FROM contracts.secop_sync_state WHERE id=1"
        ) or 0
        if cache_total < _MIN_WARM_SIZE:
            return None  # Cache cold, use SODA

        # ── Build WHERE clauses ────────────────────────────────────────
        where: list[str] = []
        params: list = []

        def _p(val) -> str:
            params.append(val)
            return f"${len(params)}"

        # Full-text search
        if filters.query:
            where.append(f"search_tsv @@ plainto_tsquery('spanish', contracts.immutable_unaccent({_p(filters.query)}))")

        # Entity filter — partial case-insensitive match
        if filters.entidad:
            where.append(f"entidad ILIKE {_p(f'%{filters.entidad.strip()}%')}")

        # Estado
        if filters.estado and filters.estado.lower() != "todos":
            where.append(f"estado = {_p(filters.estado)}")
        elif not filters.estado:
            where.append("estado IN ('Abierto','Convocado','Publicado')")
            if not filters.year and not filters.fecha_desde:
                where.append("(fecha_pub IS NULL OR fecha_pub >= '2015-01-01')")
            # ── Deterministic hard filters ──────────────────────────────
            # Rule 1: exclude processes with an awarded provider
            if filters.excluir_adjudicados:
                where.append(
                    "(proveedor_adjudicado IS NULL OR proveedor_adjudicado = '')"
                )
            # Rule 2: exclude processes whose closing date has passed
            where.append(
                "(fecha_cierre IS NULL OR fecha_cierre >= NOW())"
            )

        # Departamento / municipio
        if filters.departamento:
            where.append(f"departamento = {_p(filters.departamento)}")
        if filters.municipio:
            where.append(f"ciudad = {_p(filters.municipio)}")

        # Modalidad
        if filters.modalidad:
            where.append(f"modalidad ILIKE {_p(f'%{filters.modalidad}%')}")

        # UNSPSC
        if filters.codigo_unspsc:
            where.append(f"unspsc LIKE {_p(f'{filters.codigo_unspsc}%')}")

        # Price range
        if filters.precio_min is not None:
            where.append(f"precio_base >= {_p(float(filters.precio_min))}")
        if filters.precio_max is not None:
            where.append(f"precio_base <= {_p(float(filters.precio_max))}")

        # Year
        if filters.year:
            where.append(f"fecha_pub >= {_p(f'{filters.year}-01-01')}")
            where.append(f"fecha_pub <= {_p(f'{filters.year}-12-31')}")
        elif filters.fecha_desde:
            where.append(f"fecha_pub >= {_p(filters.fecha_desde.isoformat())}")
        if filters.fecha_hasta and not filters.year:
            where.append(f"fecha_pub <= {_p(filters.fecha_hasta.isoformat())}")

        # Negative keywords — exclude processes matching user-supplied terms
        for kw in filters.palabras_negativas:
            kw_clean = kw.strip()
            if kw_clean:
                where.append(f"nombre NOT ILIKE {_p(f'%{kw_clean}%')}")

        where_sql = " AND ".join(where) if where else "TRUE"

        # ── Count ──────────────────────────────────────────────────────
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM contracts.secop_processes_cache WHERE {where_sql}",
            *params,
        )
        total = int(total or 0)

        # Cache miss on very recent process? Let SODA handle it
        if total == 0 and filters.query:
            return None  # Might be a process published in the last 2h

        # ── Fetch results ──────────────────────────────────────────────
        params_page = params + [filters.limit, filters.offset]
        rows = await conn.fetch(
            f"""
            SELECT proceso_id, nombre, entidad, nit_entidad,
                   departamento, ciudad, modalidad, tipo_contrato,
                   estado, precio_base, unspsc, url_proceso, fecha_pub,
                   soda_synced_at,
                   proveedor_adjudicado, fecha_cierre
            FROM contracts.secop_processes_cache
            WHERE {where_sql}
            ORDER BY fecha_pub DESC NULLS LAST,
                     soda_synced_at DESC
            LIMIT ${len(params_page) - 1} OFFSET ${len(params_page)}
            """,
            *params_page,
        )

        processes: list[SecopProcess] = []
        for row in rows:
            try:
                fecha = row["fecha_pub"] or datetime.now(tz=timezone.utc)
                processes.append(SecopProcess(
                    proceso_id=row["proceso_id"],
                    nombre_del_procedimiento=row["nombre"] or "",
                    entidad=row["entidad"] or "",
                    nit_entidad=row["nit_entidad"] or "",
                    departamento_entidad=row["departamento"] or "",
                    ciudad_entidad=row["ciudad"] or "",
                    modalidad=row["modalidad"] or "",
                    tipo_contrato=row["tipo_contrato"] or "",
                    estado=row["estado"] or "",
                    precio_base=Decimal(str(row["precio_base"])) if row["precio_base"] else None,
                    codigo_unspsc=row["unspsc"] or "",
                    url_proceso=row["url_proceso"] or "",
                    fecha_publicacion=fecha,
                    proveedor_adjudicado=row["proveedor_adjudicado"] or None,
                    fecha_cierre=row["fecha_cierre"] or None,
                ))
            except Exception as exc:
                logger.debug("Skip row %s: %s", row["proceso_id"], exc)

        # Get last sync time for freshness indicator
        sync_state = await conn.fetchrow(
            "SELECT last_synced_at, cache_total FROM contracts.secop_sync_state WHERE id=1"
        )
        last_synced = sync_state["last_synced_at"] if sync_state else None
        cache_size = int(sync_state["cache_total"] or 0) if sync_state else 0

        return SecopSearchResult(
            results=processes,
            total=total,
            offset=filters.offset,
            limit=filters.limit,
            cached=True,
            response_time_ms=0,
        ), last_synced, cache_size

    finally:
        await conn.close()


async def get_cache_status(settings: "Settings") -> dict:
    """Return cache health metrics for the health endpoint and UI."""
    from app.application.manage_company import get_pg_url
    from app.infrastructure.soda_metadata import get_soda_last_updated

    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        state = await conn.fetchrow(
            "SELECT * FROM contracts.secop_sync_state WHERE id=1"
        )
        if not state:
            return {"warm": False, "cache_total": 0}

        now = datetime.now(timezone.utc)
        synced_at = state["last_synced_at"]
        age_min = int((now - synced_at).total_seconds() / 60) if synced_at else None

        # Also fetch government update time (non-blocking — cache for 1h)
        gov_info: dict = {}
        try:
            import asyncio as _asyncio
            gov_info = await _asyncio.to_thread(get_soda_last_updated)
        except Exception:
            pass

        return {
            "warm":             int(state["cache_total"] or 0) >= _MIN_WARM_SIZE,
            "cache_total":      int(state["cache_total"] or 0),
            "last_synced_at":   synced_at.isoformat() if synced_at else None,
            "age_minutes":      age_min,
            "warmup_done":      bool(state["warmup_done"]),
            # Government data freshness
            "govt_last_updated":       gov_info.get("last_updated_iso"),
            "govt_last_updated_display": gov_info.get("last_updated_display"),
            "govt_lag_hours":          gov_info.get("lag_hours"),
            "govt_is_fresh":           gov_info.get("is_fresh"),
            "soda_row_count":          gov_info.get("row_count"),
        }
    finally:
        await conn.close()
