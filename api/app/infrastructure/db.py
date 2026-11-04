"""
Async SQLAlchemy engine factory and session maker.

The engine is created once at application startup (via lifespan) and stored
in ``app.state``. The session maker yields per-request scoped sessions
through the ``get_db`` dependency.

search_path is set via connect_args (not URL query params) so that the
DATABASE_URL never contains %-encoded characters — which systemd EnvironmentFile
would try to expand as format specifiers, causing startup failures.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import Settings

_POOL_SIZE = 5
_MAX_OVERFLOW = 10
_POOL_RECYCLE_SEC = 300


def build_async_engine(settings: Settings) -> AsyncEngine:
    """Create and return a configured async SQLAlchemy engine."""
    # Strip any existing search_path query param from the URL so it's clean
    db_url = settings.DATABASE_URL.split("?")[0]

    return create_async_engine(
        db_url,
        echo=(settings.APP_ENV == "development"),
        pool_size=_POOL_SIZE,
        max_overflow=_MAX_OVERFLOW,
        pool_recycle=_POOL_RECYCLE_SEC,
        pool_pre_ping=True,
        # Set search_path here — safe from systemd EnvironmentFile parsing
        connect_args={"server_settings": {"search_path": "contracts,public"}},
    )


def build_session_maker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Return a session factory bound to *engine*."""
    return async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
