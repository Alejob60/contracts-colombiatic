"""
ColombiaTIC Contracts API — application entrypoint.

Creates the FastAPI app, wires lifespan (Redis + DB), CORS, and routers.
Run locally with:  ``uvicorn app.main:app --reload --port 8100``
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app.api.health_router import router as health_router
from app.api.secop_router import router as secop_router
from app.api.company_router import router as company_router
from app.api.evaluation_router import router as evaluation_router
from app.api.alert_router import router as alert_router
from app.api.analytics_router import router as analytics_router
from app.api.b2b_router import router as b2b_router
from app.api.workspace_router import router as workspace_router
from app.config import Settings
from app.infrastructure.db import build_async_engine, build_session_maker
from app.infrastructure.secop_soda_gateway import SecopSodaGateway
from app.workers.secop_sync_worker import run_alert_worker

logger = logging.getLogger(__name__)

# ── Allowed CORS origins ─────────────────────────────────────────────────
_CORS_ORIGINS: list[str] = [
    "https://contracts.colombiatic.com.co",
    "http://localhost:3300",
]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Manage shared resources across the application lifetime.

    * **Startup**: create Redis pool + SQLAlchemy async engine + alert worker.
    * **Shutdown**: cancel worker, close all connections cleanly.
    """
    settings = Settings()

    # ── Redis ─────────────────────────────────────────────────────────
    redis_client: Redis = Redis.from_url(  # type: ignore[type-arg]
        settings.REDIS_URL,
        decode_responses=True,
    )
    app.state.redis = redis_client
    logger.info(
        "Redis connected",
        extra={"redis_url": settings.REDIS_URL},
    )

    # ── Database ──────────────────────────────────────────────────────
    engine = build_async_engine(settings)
    app.state.db_engine = engine
    app.state.db_session_maker = build_session_maker(engine)
    logger.info("Database engine created")

    # ── Schema migration: add keywords column (idempotent) ────────────
    try:
        import asyncpg
        from app.application.manage_company import get_pg_url
        _conn = await asyncpg.connect(get_pg_url(settings))
        try:
            await _conn.execute(
                "ALTER TABLE contracts.alert_configs "
                "ADD COLUMN IF NOT EXISTS keywords TEXT"
            )
        finally:
            await _conn.close()
    except Exception as _mig_exc:
        logger.warning("alert_configs keyword migration skipped: %s", _mig_exc)

    # ── SECOP SODA Gateway ────────────────────────────────────────────
    secop_gateway = SecopSodaGateway(settings)
    app.state.secop_gateway = secop_gateway
    logger.info("SECOP SODA gateway initialised — endpoint: %s", settings.SECOP_API_URL)

    # ── Alert worker ──────────────────────────────────────────────────
    worker_task = asyncio.create_task(
        run_alert_worker(settings, secop_gateway),
        name="alert-worker",
    )

    yield  # ← application runs here

    # ── Shutdown ──────────────────────────────────────────────────────
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass

    await secop_gateway.aclose()
    await redis_client.aclose()
    await engine.dispose()
    logger.info("Resources released — shutdown complete")


def create_app() -> FastAPI:
    """
    Application factory.

    Separated from module-level so tests can build a fresh app per suite.
    """
    settings = Settings()

    application = FastAPI(
        title="ColombiaTIC Contracts API",
        version="0.1.0",
        description=(
            "SECOP II search, company RAG profiles, AI bid evaluation, "
            "and procurement alerts for ColombiaTIC."
        ),
        lifespan=lifespan,
        docs_url="/docs" if settings.APP_ENV != "production" else None,
        redoc_url="/redoc" if settings.APP_ENV != "production" else None,
    )

    # ── CORS ──────────────────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    # ── Routers ───────────────────────────────────────────────────────
    application.include_router(health_router)
    application.include_router(secop_router)
    application.include_router(company_router)
    application.include_router(evaluation_router)
    application.include_router(alert_router)
    application.include_router(analytics_router)
    application.include_router(b2b_router)
    application.include_router(workspace_router)

    return application


app: FastAPI = create_app()
