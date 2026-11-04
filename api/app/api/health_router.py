"""
Health and readiness probes.

``/health`` is a shallow liveness check (always 200 if the process runs).
``/readyz`` verifies that Redis and the database are reachable; Kubernetes
or the ALB target-group health check should hit this one.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health")
async def liveness() -> dict[str, str]:
    """Shallow liveness probe — returns 200 if the process is up."""
    return {"status": "ok", "service": "contracts-api"}


@router.get("/readyz")
async def readiness(request: Request) -> JSONResponse:
    """
    Deep readiness probe — verifies Redis and PostgreSQL connectivity.

    Returns 200 with ``{"status": "ready"}`` when both are reachable,
    or 503 with diagnostic detail when one or both fail.
    """
    errors: list[str] = []

    # ── Redis ─────────────────────────────────────────────────────────
    try:
        pong: bool = await request.app.state.redis.ping()
        if not pong:
            errors.append("Redis ping returned False")
    except Exception as exc:
        logger.error("Readiness: Redis unreachable — %s", exc)
        errors.append(f"Redis: {exc}")

    # ── Database ──────────────────────────────────────────────────────
    try:
        async with request.app.state.db_session_maker() as session:
            await session.execute(
                __import__("sqlalchemy").text("SELECT 1"),
            )
    except Exception as exc:
        logger.error("Readiness: Database unreachable — %s", exc)
        errors.append(f"Database: {exc}")

    if errors:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={"status": "degraded", "errors": errors},
        )

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"status": "ready"},
    )
