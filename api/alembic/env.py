"""
Alembic async migration environment for the ``contracts`` schema.

Reads DATABASE_URL from ``app.config.Settings`` so the connection string
is never duplicated.  Runs migrations inside an async engine context.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import Settings

# ── Alembic Config object (provides access to alembic.ini values) ─────
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── Override sqlalchemy.url with the app's DATABASE_URL ───────────────
settings = Settings()
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

# ── Target metadata for autogenerate support ──────────────────────────
# Import your SQLAlchemy ORM Base.metadata here when ORM models exist:
#   from app.infrastructure.orm import Base
#   target_metadata = Base.metadata
target_metadata = None


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode — emit SQL to stdout without a DB connection.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:  # noqa: ANN001
    """Execute migrations against the provided connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """
    Create an async engine and run migrations within its connection.

    Uses NullPool because Alembic manages its own short-lived connection.
    """
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode — connected to the database."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
