"""
Redis cache adapter — search results, process detail, freemium counter.

Key namespaces (all prefixed with 'contracts:'):
  search:{sha256}    — SecopSearchResult JSON, TTL=SECOP_CACHE_TTL_SEARCH
  process:{id}       — SecopProcess JSON, TTL=SECOP_CACHE_TTL_DETAIL
  freemium:{ip}:{sid}— integer counter, TTL=FREEMIUM_COUNTER_TTL
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from redis.asyncio import Redis

from app.config import Settings
from app.domain.models.secop import SecopFilter, SecopProcess, SecopSearchResult

logger = logging.getLogger(__name__)


def _filter_cache_key(filters: SecopFilter) -> str:
    """Deterministic cache key from filter values (order-independent)."""
    canonical = json.dumps(
        filters.model_dump(exclude_none=True),
        sort_keys=True,
        default=str,
    )
    digest = hashlib.sha256(canonical.encode()).hexdigest()[:16]
    return f"contracts:search:{digest}"


class RedisCache:
    def __init__(self, redis: Redis, settings: Settings) -> None:
        self._r = redis
        self._ttl_search = settings.SECOP_CACHE_TTL_SEARCH
        self._ttl_detail = settings.SECOP_CACHE_TTL_DETAIL
        self._ttl_freemium = settings.FREEMIUM_COUNTER_TTL
        self._max_free = settings.FREEMIUM_MAX_SEARCHES

    # ── Search result cache ───────────────────────────────────────────────

    async def get_search(self, filters: SecopFilter) -> SecopSearchResult | None:
        key = _filter_cache_key(filters)
        try:
            raw = await self._r.get(key)
            if raw:
                return SecopSearchResult.model_validate_json(raw)
        except Exception as exc:
            logger.warning("Cache get_search error: %s", exc)
        return None

    async def set_search(self, filters: SecopFilter, result: SecopSearchResult) -> None:
        key = _filter_cache_key(filters)
        try:
            await self._r.setex(key, self._ttl_search, result.model_dump_json())
        except Exception as exc:
            logger.warning("Cache set_search error: %s", exc)

    # ── Process detail cache ──────────────────────────────────────────────

    async def get_process(self, proceso_id: str) -> SecopProcess | None:
        key = f"contracts:process:{proceso_id}"
        try:
            raw = await self._r.get(key)
            if raw:
                return SecopProcess.model_validate_json(raw)
        except Exception as exc:
            logger.warning("Cache get_process error: %s", exc)
        return None

    async def set_process(self, proceso_id: str, process: SecopProcess) -> None:
        key = f"contracts:process:{proceso_id}"
        try:
            await self._r.setex(key, self._ttl_detail, process.model_dump_json())
        except Exception as exc:
            logger.warning("Cache set_process error: %s", exc)

    # ── Freemium counter ─────────────────────────────────────────────────

    def _freemium_key(self, ip: str, session_id: str) -> str:
        safe_ip = ip.replace(":", "_")          # collapse IPv6 colons
        safe_sid = session_id[:32]              # truncate for key safety
        return f"contracts:freemium:{safe_ip}:{safe_sid}"

    async def increment_search_count(self, ip: str, session_id: str) -> int:
        """Atomically increment and return the new count. Sets TTL on first access."""
        key = self._freemium_key(ip, session_id)
        try:
            count = await self._r.incr(key)
            if count == 1:
                # First access — start the 24 h rolling window
                await self._r.expire(key, self._ttl_freemium)
            return int(count)
        except Exception as exc:
            logger.warning("Freemium increment error: %s", exc)
            return 1

    async def get_search_count(self, ip: str, session_id: str) -> int:
        key = self._freemium_key(ip, session_id)
        try:
            val = await self._r.get(key)
            return int(val) if val else 0
        except Exception as exc:
            logger.warning("Freemium get_count error: %s", exc)
            return 0

    async def remaining_free_searches(self, ip: str, session_id: str) -> int:
        count = await self.get_search_count(ip, session_id)
        return max(0, self._max_free - count)
