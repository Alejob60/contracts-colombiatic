"""
ColombiaTIC Contracts API — application entrypoint.

Creates the FastAPI app, wires lifespan (Redis + DB + asyncpg pool + ARQ).
Run locally with:  ``uvicorn app.main:app --reload --port 8110``

Sprint 13: Added asyncpg connection pool and ARQ job queue.
The alert worker moved to the ARQ cron scheduler — no longer runs
inside the API process, which allows multiple uvicorn workers.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

# ARQ is optional — API works without it (falls back to BackgroundTasks)
try:
    from arq import create_pool as arq_create_pool
    _ARQ_AVAILABLE = True
except ImportError:
    _ARQ_AVAILABLE = False
    arq_create_pool = None  # type: ignore

from app.api.health_router import router as health_router
from app.api.secop_router import router as secop_router
from app.api.company_router import router as company_router
from app.api.evaluation_router import router as evaluation_router
from app.api.alert_router import router as alert_router
from app.api.analytics_router import router as analytics_router
from app.api.b2b_router import router as b2b_router
from app.api.workspace_router import router as workspace_router
from app.api.external_router import router as external_router
from app.api.browser_router import router as browser_router
from app.config import Settings
from app.infrastructure.db import build_async_engine, build_session_maker
from app.infrastructure.secop_soda_gateway import SecopSodaGateway

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

    * **Startup**: Redis pool + asyncpg pool + SQLAlchemy engine + ARQ pool.
    * **Shutdown**: close all connections cleanly.

    Note: Alert worker moved to ARQ cron scheduler (arq_worker.py).
    This allows running multiple uvicorn workers without duplicate timers.
    """
    settings = Settings()

    # ── Redis (DB 2, cache + freemium) ────────────────────────────────
    redis_client: Redis = Redis.from_url(  # type: ignore[type-arg]
        settings.REDIS_URL,
        decode_responses=True,
    )
    app.state.redis = redis_client
    logger.info("Redis connected — %s", settings.REDIS_URL)

    # ── asyncpg connection pool (Sprint 13) ───────────────────────────
    # Replaces the 48 individual asyncpg.connect() calls across the codebase
    # over time.  New code should use this pool; legacy code still works
    # with direct connects (they just don't benefit from pooling yet).
    from app.application.manage_company import get_pg_url
    pg_pool = await asyncpg.create_pool(
        get_pg_url(settings),
        min_size=5,
        max_size=20,
        server_settings={"search_path": "contracts,public"},
        command_timeout=30,
    )
    app.state.pg_pool = pg_pool
    logger.info("asyncpg pool created — min=5 max=20")

    # ── Schema migration (idempotent) ─────────────────────────────────
    async with pg_pool.acquire() as _conn:
        try:
            await _conn.execute(
                "ALTER TABLE contracts.alert_configs "
                "ADD COLUMN IF NOT EXISTS keywords TEXT"
            )
        except Exception as _e:
            logger.debug("keywords migration skipped: %s", _e)

    # ── SQLAlchemy engine (for legacy ORM use) ────────────────────────
    engine = build_async_engine(settings)
    app.state.db_engine = engine
    app.state.db_session_maker = build_session_maker(engine)

    # ── SECOP SODA Gateway ────────────────────────────────────────────
    secop_gateway = SecopSodaGateway(settings)
    app.state.secop_gateway = secop_gateway
    logger.info("SECOP SODA gateway initialised — %s", settings.SECOP_API_URL)

    # ── ARQ job queue pool (Sprint 13) ────────────────────────────────
    # API enqueues jobs; ARQ workers (separate processes) execute them.
    # Alert worker moved to ARQ cron — no longer runs here.
    if _ARQ_AVAILABLE and arq_create_pool:
        try:
            from app.workers.arq_worker import get_arq_redis as _get_arq_redis
            arq_pool = await arq_create_pool(_get_arq_redis())
            app.state.arq_pool = arq_pool
            logger.info("ARQ pool connected — DB 3")
        except Exception as _arq_exc:
            logger.warning("ARQ pool unavailable (%s) — falling back to BackgroundTasks", _arq_exc)
            app.state.arq_pool = None
    else:
        app.state.arq_pool = None
        logger.info("ARQ not installed — using BackgroundTasks fallback")

    yield  # ← application runs here

    # ── Shutdown ──────────────────────────────────────────────────────
    if app.state.arq_pool:
        await app.state.arq_pool.close()

    await secop_gateway.aclose()
    await redis_client.aclose()
    await pg_pool.close()
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
    application.include_router(external_router)
    application.include_router(browser_router)

    return application


app: FastAPI = create_app()
