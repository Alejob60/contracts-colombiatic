"""
SECOP II search router.

Endpoints:
  GET /api/v1/secop/search       — freemium-gated search
  GET /api/v1/secop/process/{id} — full process detail (PRO only)
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import JSONResponse

from app.application.search_secop import SearchSecopUseCase
from app.config import Settings
from app.dependencies import (
    get_client_ip,
    get_current_user_optional,
    get_redis_cache,
    get_secop_gateway,
    get_settings,
    require_pro,
)
from app.domain.models.secop import SecopFilter
from app.infrastructure.redis_cache import RedisCache
from app.infrastructure.secop_soda_gateway import SecopSodaGateway

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/secop", tags=["SECOP II"])


@router.get("/freshness")
async def get_data_freshness(
    settings: Settings = Depends(get_settings),
):
    """
    Returns data freshness information:
    - When the government last updated datos.gov.co (Socrata metadata)
    - When our local cache was last synced
    - Cache warmup status

    No authentication required — useful for status pages.
    """
    from app.infrastructure.secop_cache_search import get_cache_status
    try:
        status = await get_cache_status(settings)
        return status
    except Exception as exc:
        logger.warning("freshness check failed: %s", exc)
        # Fallback: just call Socrata directly
        from app.infrastructure.soda_metadata import get_soda_last_updated
        import asyncio
        try:
            gov = await asyncio.to_thread(get_soda_last_updated)
            return {
                "govt_last_updated":        gov.get("last_updated_iso"),
                "govt_last_updated_display":gov.get("last_updated_display"),
                "govt_lag_hours":           gov.get("lag_hours"),
                "govt_is_fresh":            gov.get("is_fresh"),
                "soda_row_count":           gov.get("row_count"),
            }
        except Exception:
            return {"error": "freshness data unavailable"}


@router.get("/municipios")
async def get_municipios(
    departamento: Annotated[str, Query(description="Nombre exacto del departamento")],
    gateway: SecopSodaGateway = Depends(get_secop_gateway),
    cache: RedisCache = Depends(get_redis_cache),
) -> JSONResponse:
    """
    Municipios con contratos en SECOP II para un departamento dado.
    Resultados cacheados 24 h — solo retorna ciudades con actividad contractual real.
    """
    departamento = departamento.strip()
    if not departamento:
        return JSONResponse(status_code=400, content={"detail": "departamento es requerido"})

    # Cache first
    cached = await cache.get_municipios(departamento)
    if cached is not None:
        return JSONResponse(content={"municipios": cached, "cached": True})

    municipios = await gateway.get_municipios_by_departamento(departamento)
    await cache.set_municipios(departamento, municipios)
    return JSONResponse(content={"municipios": municipios, "cached": False})


@router.get("/search")
async def search_secop(
    request: Request,
    # ── Full-text search ───────────────────────────────────────────────
    q: Annotated[str | None, Query(description="Texto libre")] = None,
    # ── Filters ───────────────────────────────────────────────────────
    departamento: Annotated[str | None, Query()] = None,
    municipio: Annotated[str | None, Query(description="Ciudad — usar junto con departamento")] = None,
    modalidad: Annotated[str | None, Query()] = None,
    tipo_contrato: Annotated[str | None, Query()] = None,
    # estado: None=activos (Abierto/Convocado), 'todos'=all, specific=exact
    estado: Annotated[str | None, Query(description="None=activos, 'todos'=todos, o valor exacto")] = None,
    # year: filter by publication year (2020..2030). Overrides fecha_desde/hasta.
    year: Annotated[int | None, Query(ge=2000, le=2030, description="Año de publicación")] = None,
    codigo_unspsc: Annotated[str | None, Query()] = None,
    precio_min: Annotated[Decimal | None, Query()] = None,
    precio_max: Annotated[Decimal | None, Query()] = None,
    # ── Pagination ────────────────────────────────────────────────────
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    # ── Dependencies ──────────────────────────────────────────────────
    user: dict[str, Any] | None = Depends(get_current_user_optional),
    gateway: SecopSodaGateway = Depends(get_secop_gateway),
    cache: RedisCache = Depends(get_redis_cache),
    settings: Settings = Depends(get_settings),
) -> Response:
    """
    Search SECOP II processes.

    - **Anonymous / FREE**: up to 3 searches per 24 h. Results have
      `descripcion`, `url_proceso`, and `precio_base` masked.
    - **PRO_LICITADOR**: unlimited, full results.

    Returns HTTP 402 when the freemium limit is reached.
    """
    client_ip = get_client_ip(request)
    plan_tier: str | None = user.get("planTier") if user else None  # type: ignore[union-attr]
    role: str | None      = user.get("role")     if user else None  # type: ignore[union-attr]

    # ── DB fallback: handle stale JWT (user paid but JWT not refreshed yet) ──
    # If the JWT says FREE but the user might have just paid via Wompi
    # (webhook updates DB but old JWT still circulates), check the DB.
    _PRO = {"PRO_LICITADOR", "PRO"}
    if plan_tier not in _PRO and role not in _PRO and user:
        user_id = str(user.get("sub") or user.get("userId") or "")
        if user_id:
            from app.dependencies import _is_pro_in_db
            if await _is_pro_in_db(user_id, settings, request.app.state.redis):
                plan_tier = "PRO_LICITADOR"

    filters = SecopFilter(
        query=q,
        departamento=departamento,
        municipio=municipio,
        modalidad=modalidad,
        tipo_contrato=tipo_contrato,
        estado=estado,
        year=year,
        codigo_unspsc=codigo_unspsc,
        precio_min=precio_min,
        precio_max=precio_max,
        offset=offset,
        limit=limit,
    )

    use_case = SearchSecopUseCase(gateway=gateway, cache=cache, settings=settings)
    response = await use_case.execute(
        filters=filters,
        plan_tier=plan_tier,
        client_ip=client_ip,
        user_id=str(user.get("sub") or user.get("userId") or "") if user else None,
    )

    payload = response.to_dict()

    if response.is_gated:
        return JSONResponse(
            status_code=402,
            content={
                **payload,
                "detail": "Límite de búsquedas gratuitas alcanzado",
                "upgrade_url": "/pricing",
            },
        )

    return JSONResponse(content=payload)


@router.get("/process/{proceso_id}")
async def get_process_detail(
    proceso_id: str,
    gateway: SecopSodaGateway = Depends(get_secop_gateway),
    cache: RedisCache = Depends(get_redis_cache),
    _user: dict[str, Any] = Depends(require_pro),
) -> JSONResponse:
    """
    Full detail for a single SECOP II process.
    Requires PRO_LICITADOR plan.
    """
    # Check cache first
    cached = await cache.get_process(proceso_id)
    if cached:
        return JSONResponse(content=cached.model_dump(mode="json"))

    process = await gateway.get_process(proceso_id)
    if process is None:
        return JSONResponse(status_code=404, content={"detail": "Proceso no encontrado"})

    await cache.set_process(proceso_id, process)
    return JSONResponse(content=process.model_dump(mode="json"))
