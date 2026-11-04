"""
AI bid-evaluation endpoints.

Sprint 0 stubs — real implementation lands when the Bedrock evaluator
service and pgvector similarity search are integrated.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/v1/evaluations", tags=["evaluations"])


@router.post("/")
async def create_evaluation() -> JSONResponse:
    """Request an AI evaluation for a specific SECOP process vs. company profile."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"message": "Create evaluation endpoint — Sprint 3"},
    )


@router.get("/{evaluation_id}")
async def get_evaluation(evaluation_id: str) -> JSONResponse:
    """Retrieve a completed or in-progress evaluation by ID."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={
            "message": "Get evaluation endpoint — Sprint 3",
            "evaluation_id": evaluation_id,
        },
    )


@router.get("/")
async def list_evaluations() -> JSONResponse:
    """List all evaluations for the authenticated company."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"message": "List evaluations endpoint — Sprint 3"},
    )
