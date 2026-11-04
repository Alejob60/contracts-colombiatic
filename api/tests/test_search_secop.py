"""
Tests for ``SearchSecopUseCase`` — the orchestration layer.

Verifies:

- Cache hit returns immediately without calling gateway
- Cache miss calls gateway, stores result, returns it
- Anonymous quota enforcement (quota exceeded → empty gated response)
- FREE users see truncated fields
- PRO_LICITADOR users see full fields
- Freemium counter is incremented for anonymous users only
"""

from __future__ import annotations

from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.application.models import GATED_NAME_MAX_CHARS, GatedSearchResponse
from app.application.search_secop import SearchSecopUseCase, _truncate_process
from app.config import Settings
from app.domain.models.secop import SecopFilter, SecopProcess, SecopSearchResult


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


def _sample_process(
    proceso_id: str = "CO1.999",
    nombre: str = "Suministro de papelería para la administración municipal del departamento",
) -> SecopProcess:
    return SecopProcess(
        id_del_proceso=proceso_id,
        nombre_del_procedimiento=nombre,
        entidad="ALCALDÍA DE BOGOTÁ",
        departamento="Bogotá D.C.",
        ciudad="BOGOTÁ",
        modalidad_de_contratacion="Mínima Cuantía",
        fase="Borrador",
        precio_base=5_000_000.0,
        moneda="COP",
        fecha_de_publicacion=datetime(2024, 6, 15),
        codigo_unspsc="44121600",
        url_proceso="https://secop.gov.co/test",
        descripci_n_del_procedimiento="Adquisición de elementos de oficina para dependencias",
    )


def _sample_search_result(count: int = 1) -> SecopSearchResult:
    processes = tuple(_sample_process(proceso_id=f"CO1.{i}") for i in range(count))
    return SecopSearchResult(
        processes=processes,
        total_estimated=count,
        offset=0,
        limit=20,
    )


class FakeCache:
    """
    Minimal mock of ``RedisCache`` that tracks calls.

    Uses AsyncMock for methods so we can assert call counts.
    """

    def __init__(
        self,
        cached_search: SecopSearchResult | None = None,
        current_count: int = 0,
        freemium_max: int = 3,
    ) -> None:
        self._cached_search = cached_search
        self._count = current_count
        self._freemium_max = freemium_max

        self.get_search = AsyncMock(return_value=cached_search)
        self.set_search = AsyncMock()
        self.get_search_count = AsyncMock(return_value=current_count)
        self.increment_search_count = AsyncMock(
            side_effect=self._do_increment
        )

    async def _do_increment(self, ip: str, session_id: str) -> int:
        self._count += 1
        return self._count

    @property
    def freemium_max(self) -> int:
        return self._freemium_max


class FakeGateway:
    """Minimal mock of ``ISecopGateway``."""

    def __init__(self, search_result: SecopSearchResult | None = None) -> None:
        self._search_result = search_result or _sample_search_result()
        self.search = AsyncMock(return_value=self._search_result)
        self.get_process = AsyncMock(return_value=None)


# ── Use case tests ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestSearchSecopUseCase:

    async def test_pro_user_gets_full_results(self) -> None:
        """PRO_LICITADOR sees all fields ungated."""
        gateway = FakeGateway()
        cache = FakeCache()
        use_case = SearchSecopUseCase(gateway, cache, _make_settings())  # type: ignore[arg-type]

        response = await use_case.execute(
            filters=SecopFilter(),
            user_plan="PRO_LICITADOR",
            client_ip="1.2.3.4",
            session_id="sess-123",
        )

        assert not response.is_gated
        assert len(response.results) == 1
        assert response.results[0]["url_proceso"] == "https://secop.gov.co/test"
        assert response.results[0]["precio_base"] == 5_000_000.0
        # PRO user should NOT increment freemium counter
        cache.increment_search_count.assert_not_awaited()

    async def test_anonymous_user_gets_gated_results(self) -> None:
        """Anonymous user sees truncated fields."""
        gateway = FakeGateway()
        cache = FakeCache()
        use_case = SearchSecopUseCase(gateway, cache, _make_settings())  # type: ignore[arg-type]

        response = await use_case.execute(
            filters=SecopFilter(),
            user_plan=None,
            client_ip="1.2.3.4",
            session_id="sess-123",
        )

        assert response.is_gated
        assert len(response.results) == 1
        assert response.results[0]["url_proceso"] is None
        assert response.results[0]["precio_base"] is None
        assert response.results[0]["descripci_n_del_procedimiento"] is None
        # Counter should be incremented
        cache.increment_search_count.assert_awaited_once()

    async def test_free_user_gets_gated_results(self) -> None:
        """FREE registered user also sees gated results."""
        gateway = FakeGateway()
        cache = FakeCache()
        use_case = SearchSecopUseCase(gateway, cache, _make_settings())  # type: ignore[arg-type]

        response = await use_case.execute(
            filters=SecopFilter(),
            user_plan="FREE",
            client_ip="1.2.3.4",
            session_id="sess-123",
        )

        assert response.is_gated
        assert response.results[0]["url_proceso"] is None
        # FREE user is NOT anonymous, so freemium counter is not incremented
        cache.increment_search_count.assert_not_awaited()

    async def test_anonymous_quota_exceeded_returns_empty(self) -> None:
        """When quota is exhausted, return empty results without calling gateway."""
        gateway = FakeGateway()
        cache = FakeCache(current_count=3, freemium_max=3)
        use_case = SearchSecopUseCase(gateway, cache, _make_settings())  # type: ignore[arg-type]

        response = await use_case.execute(
            filters=SecopFilter(),
            user_plan=None,
            client_ip="1.2.3.4",
            session_id="sess-123",
        )

        assert response.is_gated
        assert response.results == []
        assert response.remaining_free_searches == 0
        # Gateway should NOT have been called
        gateway.search.assert_not_awaited()

    async def test_cache_hit_skips_gateway(self) -> None:
        """When cache has the result, gateway is not called."""
        cached = _sample_search_result()
        gateway = FakeGateway()
        cache = FakeCache(cached_search=cached)
        use_case = SearchSecopUseCase(gateway, cache, _make_settings())  # type: ignore[arg-type]

        response = await use_case.execute(
            filters=SecopFilter(),
            user_plan="PRO_LICITADOR",
            client_ip="1.2.3.4",
            session_id="sess-123",
        )

        assert response.cached
        assert len(response.results) == 1
        gateway.search.assert_not_awaited()
        cache.set_search.assert_not_awaited()

    async def test_cache_miss_stores_result(self) -> None:
        """On cache miss, result is fetched from gateway and stored."""
        gateway = FakeGateway()
        cache = FakeCache(cached_search=None)
        use_case = SearchSecopUseCase(gateway, cache, _make_settings())  # type: ignore[arg-type]

        response = await use_case.execute(
            filters=SecopFilter(),
            user_plan="PRO_LICITADOR",
            client_ip="1.2.3.4",
            session_id="sess-123",
        )

        assert not response.cached
        gateway.search.assert_awaited_once()
        cache.set_search.assert_awaited_once()

    async def test_remaining_searches_decremented_for_anonymous(self) -> None:
        """After search, remaining count reflects the increment."""
        gateway = FakeGateway()
        cache = FakeCache(current_count=1, freemium_max=3)
        use_case = SearchSecopUseCase(gateway, cache, _make_settings())  # type: ignore[arg-type]

        response = await use_case.execute(
            filters=SecopFilter(),
            user_plan=None,
            client_ip="1.2.3.4",
            session_id="sess-123",
        )

        # current_count=1, after increment becomes 2, so remaining = 3-2 = 1
        assert response.remaining_free_searches == 1

    async def test_pro_user_remaining_is_max(self) -> None:
        """PRO users don't have freemium limits; remaining is set to max."""
        gateway = FakeGateway()
        cache = FakeCache(freemium_max=3)
        use_case = SearchSecopUseCase(gateway, cache, _make_settings())  # type: ignore[arg-type]

        response = await use_case.execute(
            filters=SecopFilter(),
            user_plan="PRO_LICITADOR",
            client_ip="1.2.3.4",
            session_id="sess-123",
        )

        assert response.remaining_free_searches == 3


# ── Truncation tests ─────────────────────────────────────────────────────────


class TestTruncateProcess:
    def test_short_name_not_truncated(self) -> None:
        process = _sample_process(nombre="Short name")
        truncated = _truncate_process(process)
        assert truncated["nombre_del_procedimiento"] == "Short name"

    def test_long_name_truncated_with_ellipsis(self) -> None:
        long_name = "A" * 150
        process = _sample_process(nombre=long_name)
        truncated = _truncate_process(process)
        assert len(truncated["nombre_del_procedimiento"]) == GATED_NAME_MAX_CHARS + 1  # +1 for …
        assert truncated["nombre_del_procedimiento"].endswith("…")

    def test_sensitive_fields_nulled(self) -> None:
        process = _sample_process()
        truncated = _truncate_process(process)
        assert truncated["precio_base"] is None
        assert truncated["url_proceso"] is None
        assert truncated["descripci_n_del_procedimiento"] is None

    def test_visible_fields_preserved(self) -> None:
        process = _sample_process()
        truncated = _truncate_process(process)
        assert truncated["id_del_proceso"] == process.id_del_proceso
        assert truncated["entidad"] == process.entidad
        assert truncated["departamento"] == process.departamento
        assert truncated["ciudad"] == process.ciudad
        assert truncated["modalidad_de_contratacion"] == process.modalidad_de_contratacion
        assert truncated["fase"] == process.fase
        assert truncated["codigo_unspsc"] == process.codigo_unspsc


# ── GatedSearchResponse model ───────────────────────────────────────────────


class TestGatedSearchResponse:
    def test_defaults(self) -> None:
        resp = GatedSearchResponse(results=[], total=0, offset=0, limit=20)
        assert resp.is_gated is False
        assert resp.remaining_free_searches == 0
        assert resp.upgrade_url == "/pricing"

    def test_serialization(self) -> None:
        resp = GatedSearchResponse(
            results=[{"id_del_proceso": "X"}],
            total=1,
            offset=0,
            limit=20,
            is_gated=True,
            remaining_free_searches=2,
        )
        dumped = resp.model_dump()
        assert dumped["is_gated"] is True
        assert dumped["remaining_free_searches"] == 2
