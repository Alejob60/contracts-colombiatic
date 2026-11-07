"""
Analytics endpoint — Sprint 7.

GET /api/v1/analytics/summary — consolidated dashboard payload (PRO-only).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends

from app.application.get_analytics import get_user_analytics
from app.config import Settings
from app.dependencies import get_settings, require_pro

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


@router.get("/summary")
async def get_summary(
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    user_id = str(user.get("sub") or user.get("userId") or "")
    return await get_user_analytics(user_id, settings)
