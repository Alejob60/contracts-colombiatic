"""
SearchSecopUseCase — orchestrates freemium gating, caching, and SODA queries.

Access tiers:
  anonymous / FREE  →  3 searches/day, results with sensitive fields nulled
  PRO_LICITADOR     →  unlimited, full results
"""
from __future__ import annotations

import logging
import time
from typing import Any

from app.config import Settings
from app.domain.models.secop import SecopFilter, SecopProcess, SecopSearchResult
from app.domain.ports.secop_gateway import ISecopGateway
from app.infrastructure.redis_cache import RedisCache

logger = logging.getLogger(__name__)

# Fields stripped from results for non-PRO users
_GATED_FIELDS = frozenset(["descripcion", "url_proceso", "precio_base"])


def _mask_process(proc: SecopProcess) -> dict[str, Any]:
    """Return a dict of the process with sensitive fields replaced by None."""
    data = proc.model_dump(mode="json")   # mode='json' converts datetime → ISO string
    for field in _GATED_FIELDS:
        data[field] = None
    if data.get("nombre_del_procedimiento"):
        data["nombre_del_procedimiento"] = data["nombre_del_procedimiento"][:120]
    return data


def _full_process(proc: SecopProcess) -> dict[str, Any]:
    return proc.model_dump(mode="json")   # datetime → ISO string


class GatedSearchResponse:
    """Response envelope returned to the API router."""

    __slots__ = (
        "results", "total", "offset", "limit",
        "cached", "response_time_ms",
        "remaining_free_searches", "is_gated", "upgrade_url",
    )

    def __init__(
        self,
        base: SecopSearchResult,
        results: list[dict[str, Any]],
        remaining: int,
        is_gated: bool,
    ) -> None:
        self.results = results
        self.total = base.total
        self.offset = base.offset
        self.limit = base.limit
        self.cached = base.cached
        self.response_time_ms = base.response_time_ms
        self.remaining_free_searches = remaining
        self.is_gated = is_gated
        self.upgrade_url = "/pricing"

    def to_dict(self) -> dict[str, Any]:
        return {
            "results": self.results,
            "total": self.total,
            "offset": self.offset,
            "limit": self.limit,
            "cached": self.cached,
            "response_time_ms": self.response_time_ms,
            "remaining_free_searches": self.remaining_free_searches,
            "is_gated": self.is_gated,
            "upgrade_url": self.upgrade_url,
        }


class SearchSecopUseCase:
    def __init__(
        self,
        gateway: ISecopGateway,
        cache: RedisCache,
        settings: Settings,
    ) -> None:
        self._gateway = gateway
        self._cache = cache
        self._max_free = settings.FREEMIUM_MAX_SEARCHES

    async def execute(
        self,
        filters: SecopFilter,
        plan_tier: str | None,          # None=anonymous, 'FREE', 'PRO_LICITADOR'
        client_ip: str,
    ) -> GatedSearchResponse:
        is_pro = plan_tier in {"PRO_LICITADOR", "PRO"}

        # ── 1. Freemium gate check (anonymous only) ────────────────────────
        if not is_pro:
            count = await self._cache.get_search_count(client_ip)
            if count >= self._max_free:
                # Return a gated empty response — the router returns HTTP 402
                empty = SecopSearchResult(results=[], total=0, offset=filters.offset, limit=filters.limit)
                return GatedSearchResponse(
                    base=empty,
                    results=[],
                    remaining=0,
                    is_gated=True,
                )

        # ── 2. Cache lookup ───────────────────────────────────────────────
        cached_result = await self._cache.get_search(filters)
        if cached_result:
            logger.debug("Cache hit for filters offset=%d q=%r", filters.offset, filters.query)
            if not is_pro:
                new_count = await self._cache.increment_search_count(client_ip)
                remaining = max(0, self._max_free - new_count)
            else:
                remaining = self._max_free
            result_dicts = (
                [_full_process(p) for p in cached_result.results]
                if is_pro
                else [_mask_process(p) for p in cached_result.results]
            )
            cached_with_flag = SecopSearchResult(
                results=cached_result.results,
                total=cached_result.total,
                offset=cached_result.offset,
                limit=cached_result.limit,
                cached=True,
                response_time_ms=cached_result.response_time_ms,
            )
            return GatedSearchResponse(
                base=cached_with_flag,
                results=result_dicts,
                remaining=remaining,
                is_gated=False,
            )

        # ── 3. Live SODA query ────────────────────────────────────────────
        result = await self._gateway.search(filters)

        # ── 4. Store in cache ─────────────────────────────────────────────
        await self._cache.set_search(filters, result)

        # ── 5. Increment freemium counter (only for non-PRO) ──────────────
        if not is_pro:
            new_count = await self._cache.increment_search_count(client_ip)
            remaining = max(0, self._max_free - new_count)
        else:
            remaining = self._max_free  # PRO always shows "unlimited"

        # ── 6. Mask sensitive fields for non-PRO ─────────────────────────
        result_dicts = (
            [_full_process(p) for p in result.results]
            if is_pro
            else [_mask_process(p) for p in result.results]
        )

        return GatedSearchResponse(
            base=result,
            results=result_dicts,
            remaining=remaining,
            is_gated=False,
        )
