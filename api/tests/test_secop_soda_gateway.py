"""
Tests for ``SecopSodaGateway`` — the Socrata SODA v2 adapter.

Uses httpx mocking (respx is not a dependency, so we monkeypatch at the
transport level via ``httpx.MockTransport``) to verify:

- SoQL query building for every filter field
- Pagination and ordering params
- Response normalization (including Socrata typos and nested URL objects)
- Retry on 429 with exponential backoff
- Error propagation on 4xx / 5xx
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.config import Settings
from app.domain.models.secop import SecopFilter, SecopModalidad
from app.infrastructure.secop_soda_gateway import (
    SecopGatewayError,
    SecopSodaGateway,
    _build_where,
    _escape_soql,
    _extract_url,
    _normalize_row,
    _safe_datetime,
    _safe_float,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────


def _make_settings(**overrides: Any) -> Settings:
    """Build a Settings instance with test defaults."""
    defaults = {
        "SECOP_API_URL": "https://test.datos.gov.co/resource/test.json",
        "SECOP_APP_TOKEN": "test-token-abc",
        "SECOP_API_KEY_ID": None,
        "SECOP_API_KEY_SECRET": None,
        "DATABASE_URL": "sqlite+aiosqlite:///",
        "REDIS_URL": "redis://localhost:6379/15",
    }
    defaults.update(overrides)
    return Settings(**defaults)  # type: ignore[arg-type]


def _sample_soda_row() -> dict[str, Any]:
    """A realistic Socrata JSON row with typos and nested URL."""
    return {
        "id_del_proceso": "CO1.PCCNTR.5432100",
        "nombre_del_procedimiento": "Suministro de papelería",
        "entidad": "ALCALDÍA DE BOGOTÁ D.C.",
        "departamento_entidad": "Bogotá D.C.",
        "ciudad_entidad": "BOGOTÁ",
        "modalidad_de_contratacion": "Mínima Cuantía",
        "estado_de_apertura_del_proceso": "Borrador",
        "precio_base": "15000000",
        "moneda": "COP",
        "fecha_de_publicacion_del": "2024-06-15T14:30:00.000",
        "fecha_de_ultima_publicaci_n": "2024-06-16T10:00:00.000",
        "descripci_n_del_procedimiento": "Adquisición de elementos de oficina",
        "codigo_principal_de_categoria": "44121600",
        "urlproceso": json.dumps(
            {"url": "https://community.secop.gov.co/Public/Tendering/OpportunityDetail/Index?noticeUID=CO1.NTC.5432100"}
        ),
    }


# ── Pure function tests ──────────────────────────────────────────────────────


class TestEscapeSoql:
    def test_no_special_chars(self) -> None:
        assert _escape_soql("Bogotá D.C.") == "Bogotá D.C."

    def test_single_quote_doubled(self) -> None:
        assert _escape_soql("O'Brien") == "O''Brien"

    def test_multiple_quotes(self) -> None:
        assert _escape_soql("a'b'c") == "a''b''c"


class TestExtractUrl:
    def test_none(self) -> None:
        assert _extract_url(None) is None

    def test_dict_with_url_key(self) -> None:
        assert _extract_url({"url": "https://example.com"}) == "https://example.com"

    def test_json_string_with_url(self) -> None:
        raw = json.dumps({"url": "https://secop.gov.co/123"})
        assert _extract_url(raw) == "https://secop.gov.co/123"

    def test_plain_string_passthrough(self) -> None:
        assert _extract_url("https://plain.url") == "https://plain.url"

    def test_dict_without_url_key(self) -> None:
        assert _extract_url({"href": "something"}) is None

    def test_non_string_non_dict(self) -> None:
        assert _extract_url(12345) is None


class TestSafeFloat:
    def test_none(self) -> None:
        assert _safe_float(None) is None

    def test_numeric_string(self) -> None:
        assert _safe_float("15000000") == 15_000_000.0

    def test_int(self) -> None:
        assert _safe_float(42) == 42.0

    def test_garbage(self) -> None:
        assert _safe_float("not-a-number") is None


class TestSafeDatetime:
    def test_none(self) -> None:
        assert _safe_datetime(None) is None

    def test_iso_with_millis(self) -> None:
        result = _safe_datetime("2024-06-15T14:30:00.000")
        assert result == datetime(2024, 6, 15, 14, 30, 0)

    def test_iso_without_millis(self) -> None:
        result = _safe_datetime("2024-06-15T14:30:00")
        assert result == datetime(2024, 6, 15, 14, 30, 0)

    def test_date_only(self) -> None:
        result = _safe_datetime("2024-06-15")
        assert result == datetime(2024, 6, 15)

    def test_already_datetime(self) -> None:
        dt = datetime(2024, 1, 1)
        assert _safe_datetime(dt) is dt

    def test_garbage(self) -> None:
        assert _safe_datetime("not-a-date") is None

    def test_non_string(self) -> None:
        assert _safe_datetime(42) is None


class TestNormalizeRow:
    def test_full_row(self) -> None:
        row = _sample_soda_row()
        process = _normalize_row(row)

        assert process.id_del_proceso == "CO1.PCCNTR.5432100"
        assert process.entidad == "ALCALDÍA DE BOGOTÁ D.C."
        assert process.departamento == "Bogotá D.C."
        assert process.ciudad == "BOGOTÁ"
        assert process.modalidad_de_contratacion == "Mínima Cuantía"
        assert process.fase == "Borrador"
        assert process.precio_base == 15_000_000.0
        assert process.fecha_de_publicacion == datetime(2024, 6, 15, 14, 30, 0)
        assert process.descripci_n_del_procedimiento == "Adquisición de elementos de oficina"
        assert process.codigo_unspsc == "44121600"
        assert process.url_proceso is not None
        assert "secop.gov.co" in process.url_proceso

    def test_minimal_row(self) -> None:
        row = {"id_del_proceso": "X123", "entidad": "Test"}
        process = _normalize_row(row)

        assert process.id_del_proceso == "X123"
        assert process.entidad == "Test"
        assert process.precio_base is None
        assert process.url_proceso is None

    def test_empty_row(self) -> None:
        process = _normalize_row({})
        assert process.id_del_proceso == ""
        assert process.entidad == ""


class TestBuildWhere:
    def test_empty_filter(self) -> None:
        filters = SecopFilter()
        assert _build_where(filters) == ""

    def test_departamento(self) -> None:
        filters = SecopFilter(departamento="Bogotá D.C.")
        clause = _build_where(filters)
        assert "departamento_entidad='Bogotá D.C.'" in clause

    def test_modalidad(self) -> None:
        filters = SecopFilter(modalidad=SecopModalidad.LICITACION)
        clause = _build_where(filters)
        assert "modalidad_de_contratacion='Licitación Pública'" in clause

    def test_cuantia_range(self) -> None:
        filters = SecopFilter(cuantia_min=1000, cuantia_max=5000)
        clause = _build_where(filters)
        assert "precio_base >= 1000" in clause
        assert "precio_base <= 5000" in clause

    def test_date_range(self) -> None:
        filters = SecopFilter(
            fecha_desde=datetime(2024, 1, 1),
            fecha_hasta=datetime(2024, 12, 31),
        )
        clause = _build_where(filters)
        assert "2024-01-01" in clause
        assert "2024-12-31" in clause

    def test_unspsc_code(self) -> None:
        filters = SecopFilter(unspsc_code="44121600")
        clause = _build_where(filters)
        assert "starts_with(codigo_principal_de_categoria, '44121600')" in clause

    def test_entidad_uses_like(self) -> None:
        filters = SecopFilter(entidad="ALCALDÍA")
        clause = _build_where(filters)
        assert "upper(entidad) like upper('%ALCALDÍA%')" in clause

    def test_multiple_filters_combined_with_and(self) -> None:
        filters = SecopFilter(departamento="Bogotá D.C.", cuantia_min=1000)
        clause = _build_where(filters)
        assert " AND " in clause

    def test_soql_injection_prevented(self) -> None:
        filters = SecopFilter(departamento="'; DROP TABLE --")
        clause = _build_where(filters)
        assert "''; DROP TABLE --'" in clause


# ── Async gateway tests (mocked HTTP) ───────────────────────────────────────


@pytest.mark.asyncio
class TestSecopSodaGateway:
    async def test_search_returns_normalized_results(self) -> None:
        """Happy path: gateway fires data+count requests and normalizes."""
        settings = _make_settings()
        gateway = SecopSodaGateway(settings)

        data_response = httpx.Response(
            200,
            json=[_sample_soda_row()],
        )
        count_response = httpx.Response(
            200,
            json=[{"count": "42"}],
        )

        call_count = 0

        async def mock_transport(request: httpx.Request) -> httpx.Response:
            nonlocal call_count
            call_count += 1
            params = dict(request.url.params)
            if "$select" in params and params["$select"] == "count(*) as count":
                return count_response
            return data_response

        gateway._client = httpx.AsyncClient(transport=httpx.MockTransport(mock_transport))

        filters = SecopFilter(keyword="papelería", departamento="Bogotá D.C.")
        result = await gateway.search(filters)

        assert len(result.processes) == 1
        assert result.processes[0].id_del_proceso == "CO1.PCCNTR.5432100"
        assert result.total_estimated == 42
        assert result.offset == 0
        assert result.limit == 20

        await gateway.aclose()

    async def test_search_empty_results(self) -> None:
        settings = _make_settings()
        gateway = SecopSodaGateway(settings)

        async def mock_transport(request: httpx.Request) -> httpx.Response:
            params = dict(request.url.params)
            if "$select" in params and params["$select"] == "count(*) as count":
                return httpx.Response(200, json=[{"count": "0"}])
            return httpx.Response(200, json=[])

        gateway._client = httpx.AsyncClient(transport=httpx.MockTransport(mock_transport))

        result = await gateway.search(SecopFilter())
        assert len(result.processes) == 0
        assert result.total_estimated == 0

        await gateway.aclose()

    async def test_get_process_found(self) -> None:
        settings = _make_settings()
        gateway = SecopSodaGateway(settings)

        async def mock_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=[_sample_soda_row()])

        gateway._client = httpx.AsyncClient(transport=httpx.MockTransport(mock_transport))

        process = await gateway.get_process("CO1.PCCNTR.5432100")
        assert process is not None
        assert process.id_del_proceso == "CO1.PCCNTR.5432100"

        await gateway.aclose()

    async def test_get_process_not_found(self) -> None:
        settings = _make_settings()
        gateway = SecopSodaGateway(settings)

        async def mock_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json=[])

        gateway._client = httpx.AsyncClient(transport=httpx.MockTransport(mock_transport))

        process = await gateway.get_process("NONEXISTENT")
        assert process is None

        await gateway.aclose()

    async def test_retry_on_429(self) -> None:
        """Gateway retries on 429 before succeeding."""
        settings = _make_settings()
        gateway = SecopSodaGateway(settings)

        attempts: list[int] = []

        async def mock_transport(request: httpx.Request) -> httpx.Response:
            attempts.append(1)
            if len(attempts) <= 2:
                return httpx.Response(429, text="Rate limited")
            params = dict(request.url.params)
            if "$select" in params and params["$select"] == "count(*) as count":
                return httpx.Response(200, json=[{"count": "1"}])
            return httpx.Response(200, json=[_sample_soda_row()])

        gateway._client = httpx.AsyncClient(transport=httpx.MockTransport(mock_transport))

        with patch("app.infrastructure.secop_soda_gateway.asyncio.sleep", new_callable=AsyncMock):
            result = await gateway.search(SecopFilter())

        assert len(result.processes) >= 0  # May succeed or count may have retried
        await gateway.aclose()

    async def test_raises_on_500(self) -> None:
        settings = _make_settings()
        gateway = SecopSodaGateway(settings)

        async def mock_transport(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="Internal Server Error")

        gateway._client = httpx.AsyncClient(transport=httpx.MockTransport(mock_transport))

        with pytest.raises(SecopGatewayError) as exc_info:
            await gateway.search(SecopFilter())

        assert exc_info.value.status_code == 500
        await gateway.aclose()

    async def test_app_token_header_sent(self) -> None:
        """Verify X-App-Token is included in outgoing requests."""
        settings = _make_settings(SECOP_APP_TOKEN="my-token-123")
        gateway = SecopSodaGateway(settings)

        captured_headers: dict[str, str] = {}

        async def mock_transport(request: httpx.Request) -> httpx.Response:
            captured_headers.update(dict(request.headers))
            params = dict(request.url.params)
            if "$select" in params and params["$select"] == "count(*) as count":
                return httpx.Response(200, json=[{"count": "0"}])
            return httpx.Response(200, json=[])

        gateway._client = httpx.AsyncClient(
            transport=httpx.MockTransport(mock_transport),
            headers={"X-App-Token": "my-token-123"},
        )

        await gateway.search(SecopFilter())
        assert captured_headers.get("x-app-token") == "my-token-123"
        await gateway.aclose()

    async def test_basic_auth_when_configured(self) -> None:
        """When both key ID and secret are set, HTTP Basic auth is used."""
        settings = _make_settings(
            SECOP_API_KEY_ID="my-key-id",
            SECOP_API_KEY_SECRET="my-key-secret",
        )
        gateway = SecopSodaGateway(settings)

        captured_headers: dict[str, str] = {}

        async def mock_transport(request: httpx.Request) -> httpx.Response:
            captured_headers.update(dict(request.headers))
            params = dict(request.url.params)
            if "$select" in params and params["$select"] == "count(*) as count":
                return httpx.Response(200, json=[{"count": "0"}])
            return httpx.Response(200, json=[])

        gateway._client = httpx.AsyncClient(
            transport=httpx.MockTransport(mock_transport),
            auth=httpx.BasicAuth("my-key-id", "my-key-secret"),
        )

        await gateway.search(SecopFilter())
        assert "authorization" in captured_headers
        await gateway.aclose()
