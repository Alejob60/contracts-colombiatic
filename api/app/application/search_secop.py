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
        "last_synced", "cache_age_minutes",
        "profile_filters_active",
    )

    def __init__(
        self,
        base: SecopSearchResult,
        results: list[dict[str, Any]],
        remaining: int,
        is_gated: bool,
        profile_filters_active: bool = False,
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
        self.last_synced: str | None = None
        self.cache_age_minutes: int | None = None
        self.profile_filters_active = profile_filters_active

    def to_dict(self) -> dict[str, Any]:
        d = {
            "results": self.results,
            "total": self.total,
            "offset": self.offset,
            "limit": self.limit,
            "cached": self.cached,
            "response_time_ms": self.response_time_ms,
            "remaining_free_searches": self.remaining_free_searches,
            "is_gated": self.is_gated,
            "upgrade_url": self.upgrade_url,
            "profile_filters_active": self.profile_filters_active,
        }
        if self.last_synced:
            d["last_synced"] = self.last_synced
            d["cache_age_minutes"] = self.cache_age_minutes
        return d


class SearchSecopUseCase:
    def __init__(
        self,
        gateway: ISecopGateway,
        cache: RedisCache,
        settings: Settings,
    ) -> None:
        self._gateway = gateway
        self._cache = cache
        self._settings = settings
        self._max_free = settings.FREEMIUM_MAX_SEARCHES

    async def execute(
        self,
        filters: SecopFilter,
        plan_tier: str | None,          # None=anonymous, 'FREE', 'PRO_LICITADOR'
        client_ip: str,
        user_id: str | None = None,
    ) -> GatedSearchResponse:
        is_pro = plan_tier in {"PRO_LICITADOR", "PRO"}

        # ── 0. Enrich filter from company profile (PRO only) ──────────────
        # If the user hasn't set an explicit UNSPSC filter, auto-apply their
        # registered codes and negative keywords from their company profile.
        # This makes every search feel personalized without requiring manual setup.
        profile_unspsc: list[str] = []
        profile_neg_kws: list[str] = []
        if is_pro and user_id and not filters.codigo_unspsc:
            try:
                from app.application.manage_company import get_company_profile
                profile = await get_company_profile(user_id, self._settings)
                if profile:
                    profile_unspsc = list(profile.get("unspsc_codes") or [])
                    profile_neg_kws = list(profile.get("palabras_negativas") or [])
            except Exception as exc:
                logger.debug("Could not load profile for search enrichment: %s", exc)

        # Merge profile palabras_negativas with any explicitly passed ones
        all_neg_kws = tuple(set(list(filters.palabras_negativas) + profile_neg_kws))
        if all_neg_kws != filters.palabras_negativas or (profile_unspsc and not filters.codigo_unspsc):
            filters = filters.model_copy(update={
                "palabras_negativas": all_neg_kws,
                # Only set UNSPSC from profile if exactly one code registered
                # (multiple codes → too restrictive; let user search freely)
                **({"codigo_unspsc": profile_unspsc[0]} if len(profile_unspsc) == 1 and not filters.codigo_unspsc else {}),
            })

        _profile_active = bool(profile_neg_kws or profile_unspsc)

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
                    profile_filters_active=_profile_active,
                )

        # ── 2. Cache lookup (Redis short-term) ───────────────────────────
        cached_result = await self._cache.get_search(filters)
        if cached_result:
            logger.debug("Redis cache hit offset=%d q=%r", filters.offset, filters.query)
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
                profile_filters_active=_profile_active,
            )

        # ── 3. Local PostgreSQL cache (Sprint 10A — freshness < 2h) ──────
        import time as _time
        t_local = _time.monotonic()
        local_result = None
        last_synced = None
        try:
            from app.infrastructure.secop_cache_search import search_cache
            cache_result = await search_cache(filters, self._settings)
            if cache_result and isinstance(cache_result, tuple):
                local_result, last_synced, _cache_size = cache_result
                elapsed_ms = int((_time.monotonic() - t_local) * 1000)
                if local_result and local_result.results:
                    logger.info(
                        "Local cache hit: %d results in %dms (q=%r)",
                        local_result.total, elapsed_ms, filters.query,
                    )
                    # Store in Redis for 5min to avoid repeated DB queries
                    await self._cache.set_search(filters, local_result)
                elif local_result is None:
                    pass  # cache cold/miss — fall through to SODA
        except Exception as exc:
            logger.warning("Local cache search failed, falling back to SODA: %s", exc)
            local_result = None

        if local_result and local_result.results:
            if not is_pro:
                new_count = await self._cache.increment_search_count(client_ip)
                remaining = max(0, self._max_free - new_count)
            else:
                remaining = self._max_free
            result_dicts = (
                [_full_process(p) for p in local_result.results]
                if is_pro
                else [_mask_process(p) for p in local_result.results]
            )
            response = GatedSearchResponse(
                base=local_result,
                results=result_dicts,
                remaining=remaining,
                is_gated=False,
                profile_filters_active=_profile_active,
            )
            # Add freshness metadata
            if last_synced:
                response.last_synced = last_synced.isoformat()
                import math
                age_min = int((
                    __import__('datetime').datetime.now(__import__('datetime').timezone.utc) - last_synced
                ).total_seconds() / 60)
                response.cache_age_minutes = age_min
            return response

        # ── 4. Live SODA query (fallback) ─────────────────────────────────
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
            profile_filters_active=_profile_active,
        )
