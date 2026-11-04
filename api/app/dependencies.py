"""
Dependency-injection providers for FastAPI route handlers.

All heavy resources (Redis pool, DB engine, SECOP gateway) live on
``request.app.state`` and are created/destroyed by the lifespan in
``main.py``.
"""
from __future__ import annotations

import functools
import logging
from typing import AsyncGenerator

import jwt
from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.infrastructure.redis_cache import RedisCache
from app.infrastructure.secop_soda_gateway import SecopSodaGateway

logger = logging.getLogger(__name__)


# ── Settings (singleton) ─────────────────────────────────────────────────

@functools.lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return a cached Settings instance — parsed once per process."""
    return Settings()


# ── Redis ─────────────────────────────────────────────────────────────────

async def get_redis(request: Request) -> Redis:  # type: ignore[type-arg]
    return request.app.state.redis


async def get_redis_cache(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> RedisCache:
    return RedisCache(redis=request.app.state.redis, settings=settings)


# ── SECOP Gateway ─────────────────────────────────────────────────────────

async def get_secop_gateway(request: Request) -> SecopSodaGateway:
    return request.app.state.secop_gateway


# ── Database session ──────────────────────────────────────────────────────

async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    session_maker = request.app.state.db_session_maker
    async with session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Client IP helper ──────────────────────────────────────────────────────

def get_client_ip(request: Request) -> str:
    """Extract real client IP, respecting X-Forwarded-For from nginx."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_session_id(request: Request) -> str:
    """Extract or generate a session identifier for freemium tracking."""
    return request.cookies.get("contracts_session", request.headers.get("X-Session-ID", "anon"))


# ── JWT helpers ───────────────────────────────────────────────────────────

_BEARER_PREFIX = "Bearer "
_BEARER_LEN = len(_BEARER_PREFIX)


def _decode_token(request: Request, settings: Settings) -> dict[str, object] | None:
    auth_header: str | None = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith(_BEARER_PREFIX):
        return None
    token = auth_header[_BEARER_LEN:]
    try:
        payload: dict[str, object] = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError as exc:
        logger.warning("Invalid JWT: %s", exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_current_user_optional(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict[str, object] | None:
    return _decode_token(request, settings)


async def get_current_user(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    payload = _decode_token(request, settings)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


async def require_pro(
    user: dict[str, object] = Depends(get_current_user),
) -> dict[str, object]:
    plan_tier = user.get("planTier")
    if plan_tier != "PRO_LICITADOR":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Plan 'PRO_LICITADOR' required; current plan: '{plan_tier}'",
        )
    return user
