"""
Tests for ``RedisCache`` — search cache, process cache, and freemium counter.

Uses ``fakeredis.aioredis`` for a fast in-memory Redis that supports all
the commands we use (GET, SETEX, INCR, EXPIRE, PIPELINE).  If fakeredis
is not installed, the tests are skipped.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.config import Settings
from app.domain.models.secop import SecopFilter, SecopProcess, SecopSearchResult
from app.infrastructure.redis_cache import (
    RedisCache,
    _search_key,
    _serialize_process,
    _serialize_search_result,
)


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_settings(**overrides: Any) -> Settings:
    defaults = {
        "DATABASE_URL": "sqlite+aiosqlite:///",
        "REDIS_URL": "redis://localhost:6379/15",
        "SECOP_CACHE_TTL_SEARCH": 60,
        "SECOP_CACHE_TTL_DETAIL": 120,
        "FREEMIUM_COUNTER_TTL": 300,
        "FREEMIUM_MAX_SEARCHES": 3,
    }
    defaults.update(overrides)
    return Settings(**defaults)  # type: ignore[arg-type]


def _sample_process() -> SecopProcess:
    return SecopProcess(
        id_del_proceso="CO1.PCCNTR.999",
        nombre_del_procedimiento="Test process",
        entidad="Test entity",
        departamento="Bogotá D.C.",
        ciudad="BOGOTÁ",
        modalidad_de_contratacion="Mínima Cuantía",
        fase="Borrador",
        precio_base=5_000_000.0,
        moneda="COP",
        fecha_de_publicacion=datetime(2024, 6, 15),
        codigo_unspsc="44121600",
        url_proceso="https://secop.gov.co/test",
    )


def _sample_search_result() -> SecopSearchResult:
    return SecopSearchResult(
        processes=(_sample_process(),),
        total_estimated=1,
        offset=0,
        limit=20,
    )


class FakeRedis:
    """
    Minimal async Redis fake for unit tests.

    Implements only the subset of commands used by ``RedisCache``.
    No external dependencies — works without ``fakeredis``.
    """

    def __init__(self) -> None:
        self._store: dict[str, str] = {}
        self._ttls: dict[str, int] = {}

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def setex(self, key: str, ttl: int, value: str) -> None:
        self._store[key] = value
        self._ttls[key] = ttl

    async def delete(self, key: str) -> None:
        self._store.pop(key, None)
        self._ttls.pop(key, None)

    async def incr(self, key: str) -> int:
        current = int(self._store.get(key, "0"))
        new_val = current + 1
        self._store[key] = str(new_val)
        return new_val

    async def expire(self, key: str, ttl: int, *, nx: bool = False) -> bool:
        if nx and key in self._ttls:
            return False
        self._ttls[key] = ttl
        return True

    def pipeline(self, transaction: bool = True) -> FakePipeline:
        return FakePipeline(self)


class FakePipeline:
    """Minimal pipeline that collects commands and executes sequentially."""

    def __init__(self, redis: FakeRedis) -> None:
        self._redis = redis
        self._commands: list[tuple[str, tuple[Any, ...]]] = []

    def incr(self, key: str) -> FakePipeline:
        self._commands.append(("incr", (key,)))
        return self

    def expire(self, key: str, ttl: int, nx: bool = False) -> FakePipeline:
        self._commands.append(("expire", (key, ttl)))
        return self

    async def execute(self) -> list[Any]:
        results: list[Any] = []
        for cmd, args in self._commands:
            if cmd == "incr":
                result = await self._redis.incr(args[0])
                results.append(result)
            elif cmd == "expire":
                result = await self._redis.expire(args[0], args[1], nx=True)
                results.append(result)
        return results


# ── Search key determinism ───────────────────────────────────────────────────


class TestSearchKey:
    def test_same_filters_produce_same_key(self) -> None:
        f1 = SecopFilter(keyword="test", departamento="Bogotá")
        f2 = SecopFilter(keyword="test", departamento="Bogotá")
        assert _search_key(f1) == _search_key(f2)

    def test_different_filters_produce_different_keys(self) -> None:
        f1 = SecopFilter(keyword="test")
        f2 = SecopFilter(keyword="other")
        assert _search_key(f1) != _search_key(f2)

    def test_key_has_correct_prefix(self) -> None:
        key = _search_key(SecopFilter())
        assert key.startswith("contracts:search:")

    def test_key_has_sha256_length(self) -> None:
        key = _search_key(SecopFilter())
        sha_part = key.split(":")[-1]
        assert len(sha_part) == 64  # SHA-256 hex digest


# ── Search cache ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestSearchCache:
    async def test_miss_returns_none(self) -> None:
        cache = RedisCache(FakeRedis(), _make_settings())  # type: ignore[arg-type]
        result = await cache.get_search(SecopFilter())
        assert result is None

    async def test_set_then_get(self) -> None:
        redis = FakeRedis()
        cache = RedisCache(redis, _make_settings())  # type: ignore[arg-type]
        filters = SecopFilter(keyword="papelería")
        search_result = _sample_search_result()

        await cache.set_search(filters, search_result)
        cached = await cache.get_search(filters)

        assert cached is not None
        assert cached.total_estimated == 1
        assert len(cached.processes) == 1
        assert cached.processes[0].id_del_proceso == "CO1.PCCNTR.999"

    async def test_corrupt_data_returns_none_and_deletes(self) -> None:
        redis = FakeRedis()
        cache = RedisCache(redis, _make_settings())  # type: ignore[arg-type]
        filters = SecopFilter()
        key = _search_key(filters)

        # Write corrupt JSON
        await redis.setex(key, 60, "{not valid json")
        result = await cache.get_search(filters)
        assert result is None
        # Key should be cleaned up
        assert await redis.get(key) is None


# ── Process cache ────────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestProcessCache:
    async def test_miss_returns_none(self) -> None:
        cache = RedisCache(FakeRedis(), _make_settings())  # type: ignore[arg-type]
        result = await cache.get_process("NONEXISTENT")
        assert result is None

    async def test_set_then_get(self) -> None:
        redis = FakeRedis()
        cache = RedisCache(redis, _make_settings())  # type: ignore[arg-type]
        process = _sample_process()

        await cache.set_process("CO1.PCCNTR.999", process)
        cached = await cache.get_process("CO1.PCCNTR.999")

        assert cached is not None
        assert cached.id_del_proceso == "CO1.PCCNTR.999"
        assert cached.precio_base == 5_000_000.0

    async def test_corrupt_data_returns_none_and_deletes(self) -> None:
        redis = FakeRedis()
        cache = RedisCache(redis, _make_settings())  # type: ignore[arg-type]
        key = "contracts:process:BAD"

        await redis.setex(key, 120, "not json{{{")
        result = await cache.get_process("BAD")
        assert result is None
        assert await redis.get(key) is None


# ── Freemium counter ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestFreemiumCounter:
    async def test_initial_count_is_zero(self) -> None:
        cache = RedisCache(FakeRedis(), _make_settings())  # type: ignore[arg-type]
        count = await cache.get_search_count("1.2.3.4", "sess-abc")
        assert count == 0

    async def test_increment_returns_new_count(self) -> None:
        cache = RedisCache(FakeRedis(), _make_settings())  # type: ignore[arg-type]
        count1 = await cache.increment_search_count("1.2.3.4", "sess-abc")
        assert count1 == 1
        count2 = await cache.increment_search_count("1.2.3.4", "sess-abc")
        assert count2 == 2

    async def test_different_ips_have_separate_counters(self) -> None:
        cache = RedisCache(FakeRedis(), _make_settings())  # type: ignore[arg-type]
        await cache.increment_search_count("1.1.1.1", "sess")
        await cache.increment_search_count("1.1.1.1", "sess")
        await cache.increment_search_count("2.2.2.2", "sess")

        assert await cache.get_search_count("1.1.1.1", "sess") == 2
        assert await cache.get_search_count("2.2.2.2", "sess") == 1

    async def test_freemium_max_property(self) -> None:
        cache = RedisCache(FakeRedis(), _make_settings(FREEMIUM_MAX_SEARCHES=5))  # type: ignore[arg-type]
        assert cache.freemium_max == 5


# ── Serialization round-trips ────────────────────────────────────────────────


class TestSerialization:
    def test_process_round_trip(self) -> None:
        original = _sample_process()
        serialized = _serialize_process(original)
        json_str = json.dumps(serialized)
        deserialized = SecopProcess.model_validate(json.loads(json_str))
        assert deserialized.id_del_proceso == original.id_del_proceso
        assert deserialized.precio_base == original.precio_base

    def test_search_result_round_trip(self) -> None:
        original = _sample_search_result()
        serialized = _serialize_search_result(original)
        json_str = json.dumps(serialized)
        deserialized = SecopSearchResult.model_validate(json.loads(json_str))
        assert deserialized.total_estimated == original.total_estimated
        assert len(deserialized.processes) == len(original.processes)
