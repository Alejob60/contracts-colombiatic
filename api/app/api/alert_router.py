"""
Procurement alert subscription endpoints.

Sprint 0 stubs — real implementation lands when the SQS polling worker
and user notification preferences are built.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/v1/alerts", tags=["alerts"])


@router.post("/subscriptions")
async def create_subscription() -> JSONResponse:
    """Subscribe to alerts for SECOP processes matching given criteria."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"message": "Create alert subscription endpoint — Sprint 4"},
    )


@router.get("/subscriptions")
async def list_subscriptions() -> JSONResponse:
    """List the authenticated user's active alert subscriptions."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"message": "List alert subscriptions endpoint — Sprint 4"},
    )


@router.delete("/subscriptions/{subscription_id}")
async def delete_subscription(subscription_id: str) -> JSONResponse:
    """Remove an alert subscription."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={
            "message": "Delete alert subscription endpoint — Sprint 4",
            "subscription_id": subscription_id,
        },
    )


@router.get("/")
async def list_alerts() -> JSONResponse:
    """List recent alerts delivered to the authenticated user."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"message": "List alerts endpoint — Sprint 4"},
    )
