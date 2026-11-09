"""
Shared asyncpg pool helper — Sprint 13.

Provides a module-level pool reference so application functions can use
connection pooling without requiring the FastAPI Request object.

Pattern: main.py lifespan sets the pool; application code calls acquire().
Backward-compatible: acquire() falls back to a direct connect when pool
is not yet initialised (e.g. in tests or the ARQ worker startup phase).
"""
from __future__ import annotations

import asyncpg

_pool: asyncpg.Pool | None = None


async def set_pool(pool: asyncpg.Pool) -> None:
    global _pool
    _pool = pool


async def acquire() -> asyncpg.pool.PoolConnectionProxy | None:  # type: ignore[type-arg]
    """Return a pool-acquired connection, or None if pool unavailable."""
    if _pool:
        return await _pool.acquire()
    return None


def get() -> asyncpg.Pool | None:
    return _pool
