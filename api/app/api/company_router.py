"""
Company profile and document management endpoints.

Sprint 0 stubs — real implementation lands when the RAG pipeline
(embedding + pgvector storage) is wired.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/v1/company", tags=["company"])


@router.get("/profile")
async def get_profile() -> JSONResponse:
    """Return the authenticated company's profile and capability summary."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"message": "Company profile endpoint — Sprint 2"},
    )


@router.post("/documents")
async def upload_document() -> JSONResponse:
    """Upload a company document (RUP, financial cert, experience cert)."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"message": "Document upload endpoint — Sprint 2"},
    )


@router.get("/documents")
async def list_documents() -> JSONResponse:
    """List all documents belonging to the authenticated company."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={"message": "Document list endpoint — Sprint 2"},
    )


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str) -> JSONResponse:
    """Delete a company document by ID."""
    return JSONResponse(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        content={
            "message": "Document delete endpoint — Sprint 2",
            "document_id": document_id,
        },
    )
