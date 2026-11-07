"""
Dependency-injection providers for FastAPI route handlers.
"""
from __future__ import annotations

import functools
import logging
from typing import AsyncGenerator

import asyncpg
import jwt
from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings

logger = logging.getLogger(__name__)

_PRO_PLANS  = frozenset({"PRO_LICITADOR", "PRO"})
_CACHE_TTL  = 300  # 5 minutes


# ── Settings (singleton) ─────────────────────────────────────────────────

@functools.lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


# ── Redis ─────────────────────────────────────────────────────────────────

async def get_redis(request: Request) -> Redis:  # type: ignore[type-arg]
    return request.app.state.redis


async def get_redis_cache(request: Request, settings: Settings = Depends(get_settings)):
    from app.infrastructure.redis_cache import RedisCache
    return RedisCache(redis=request.app.state.redis, settings=settings)


# ── SECOP Gateway ─────────────────────────────────────────────────────────

async def get_secop_gateway(request: Request):
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


# ── Client IP / Session ────────────────────────────────────────────────────

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def get_session_id(request: Request) -> str:
    return request.cookies.get("contracts_session",
           request.headers.get("X-Session-ID", "anon"))


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


# ── DB subscription check (fallback for stale JWT) ────────────────────────

async def _is_pro_in_db(user_id: str, settings: Settings, redis: Redis) -> bool:
    """
    Query realculture.subscriptions to verify PRO status when the JWT is stale.

    Result cached in Redis for 5 minutes to avoid a DB query on every search.
    The webhook that activates the subscription updates the DB within seconds
    of the Wompi payment — by the time the user reaches the search page the
    DB is already up to date.
    """
    cache_key = f"contracts:pro_check:{user_id}"
    try:
        cached = await redis.get(cache_key)
        if cached is not None:
            return cached == "1"
    except Exception:
        pass

    is_pro = False
    try:
        # Tables are in public schema (not realculture schema)
        db_url = (settings.DATABASE_URL
                  .replace("postgresql+asyncpg://", "postgresql://")
                  .split("?")[0])
        conn = await asyncpg.connect(db_url, timeout=5)
        try:
            row = await conn.fetchrow(
                """
                SELECT 1 FROM public.subscriptions
                WHERE user_id = $1::uuid
                  AND status   = 'ACTIVE'
                  AND plan_tier = 'PRO_LICITADOR'
                LIMIT 1
                """,
                user_id,
            )
            is_pro = row is not None
        finally:
            await conn.close()
    except Exception as exc:
        logger.warning("DB pro-check failed for user %s: %s", user_id, exc)

    try:
        await redis.setex(cache_key, _CACHE_TTL, "1" if is_pro else "0")
    except Exception:
        pass

    return is_pro


# ── require_pro dependency ────────────────────────────────────────────────

async def require_pro(
    request: Request,
    user: dict[str, object] = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> dict[str, object]:
    """
    Gate access to PRO_LICITADOR subscribers.

    Check order (fast → slow):
    1. JWT planTier or role in _PRO_PLANS  → immediate allow
    2. DB subscription check + Redis cache → handles stale JWT (e.g. right
       after Wompi payment before the user re-logs in)
    """
    plan_tier = str(user.get("planTier") or "")
    role      = str(user.get("role")     or "")

    if plan_tier in _PRO_PLANS or role in _PRO_PLANS:
        return user

    # Fallback: check the DB for current subscription status
    user_id = str(user.get("sub") or user.get("userId") or "")
    if user_id:
        redis = request.app.state.redis
        if await _is_pro_in_db(user_id, settings, redis):
            logger.info("PRO granted via DB check for user %s", user_id)
            return user

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Se requiere una suscripción activa para acceder a este recurso.",
    )
