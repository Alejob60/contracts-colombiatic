"""
Usage endpoints — Sprint 14.

GET  /api/v1/usage/current     — user's current month usage + limits
POST /api/v1/usage/reset/{res} — admin-only reset (for testing)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.dependencies import get_current_user, get_settings
from app.services.usage_service import get_usage_with_limits

router = APIRouter(prefix="/api/v1/usage", tags=["usage"])


def _plan(user: dict) -> str:
    return str(user.get("planTier") or user.get("role") or "FREE")


@router.get("/current")
async def current_usage(
    request: Request,
    user: dict = Depends(get_current_user),
):
    """
    Return the authenticated user's current month usage and plan limits.
    Used by the dashboard Usage Meter component.
    """
    user_id = str(user.get("sub") or user.get("userId") or "")
    plan_tier = _plan(user)
    redis = request.app.state.redis
    return await get_usage_with_limits(user_id, plan_tier, redis)
