"""
Company profile, saved processes, and document management.

Endpoints:
  GET  /api/v1/company/profile               — get authenticated user's company
  PUT  /api/v1/company/profile               — create / update company profile
  GET  /api/v1/company/saved                 — list saved SECOP processes
  POST /api/v1/company/saved                 — save a process
  DELETE /api/v1/company/saved/{proceso_id}  — unsave
  PUT  /api/v1/company/saved/{proceso_id}/alert — toggle alert
  POST /api/v1/company/documents             — upload PDF document (Sprint 4)
  GET  /api/v1/company/documents             — list company documents (Sprint 4)
  DELETE /api/v1/company/documents/{id}      — delete document (Sprint 4)
"""
from __future__ import annotations

import logging
from typing import Any

import asyncpg
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.dependencies import get_current_user, get_settings
from app.config import Settings
from app.application.manage_company import (
    get_company_profile,
    get_pg_url,
    upsert_company_profile,
    get_saved_processes,
    save_process,
    unsave_process,
    toggle_alert,
    _row_to_dict,
)
from app.infrastructure.s3_document_store import S3DocumentStore
from app.workers.embedding_worker import index_document

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/company", tags=["company"])


def _user_id(user: dict[str, Any]) -> str:
    uid = str(user.get("sub") or user.get("userId") or "")
    if not uid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No user ID in token")
    return uid


# ── Request models ─────────────────────────────────────────────────────────

class ProfileUpdateRequest(BaseModel):
    nit:              str
    nit_dv:           str | None  = None
    razon_social:     str
    nombre_comercial: str | None  = None
    representante:    str | None  = None
    email_contacto:   str | None  = None
    telefono:         str | None  = None
    departamento:     str | None  = None
    ciudad:           str | None  = None
    unspsc_codes:     list[str]   = []
    capacidad_k:      float | None = None
    sector:           str | None  = None
    tamano:           str | None  = None


class SaveProcessRequest(BaseModel):
    proceso_id:     str
    nombre_proceso: str | None  = None
    entidad:        str | None  = None
    precio_base:    float | None = None
    departamento:   str | None  = None
    ciudad:         str | None  = None
    estado:         str | None  = None
    notes:          str | None  = None


class AlertToggleRequest(BaseModel):
    enabled: bool


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(
    user:     dict[str, Any] = Depends(get_current_user),
    settings: Settings       = Depends(get_settings),
) -> JSONResponse:
    """Return the authenticated user's company profile, or 404."""
    profile = await get_company_profile(_user_id(user), settings)
    if profile is None:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={"detail": "Perfil de empresa no encontrado"},
        )
    return JSONResponse(content=profile)


@router.put("/profile", status_code=200)
async def update_profile(
    body:     ProfileUpdateRequest,
    user:     dict[str, Any] = Depends(get_current_user),
    settings: Settings       = Depends(get_settings),
) -> JSONResponse:
    """Create or update the authenticated user's company profile."""
    try:
        profile = await upsert_company_profile(_user_id(user), body.model_dump(), settings)
        return JSONResponse(content=profile)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Error guardando perfil: {exc}",
        ) from exc


@router.get("/saved")
async def list_saved(
    user:     dict[str, Any] = Depends(get_current_user),
    settings: Settings       = Depends(get_settings),
) -> JSONResponse:
    """List saved SECOP processes for the authenticated user."""
    processes = await get_saved_processes(_user_id(user), settings)
    return JSONResponse(content={"saved": processes, "total": len(processes)})


@router.post("/saved", status_code=201)
async def save_secop_process(
    body:     SaveProcessRequest,
    user:     dict[str, Any] = Depends(get_current_user),
    settings: Settings       = Depends(get_settings),
) -> JSONResponse:
    """Save a SECOP II process to the user's watchlist."""
    try:
        saved = await save_process(_user_id(user), body.model_dump(), settings)
        return JSONResponse(status_code=201, content=saved)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.delete("/saved/{proceso_id}", status_code=204)
async def unsave_secop_process(
    proceso_id: str,
    user:       dict[str, Any] = Depends(get_current_user),
    settings:   Settings       = Depends(get_settings),
) -> JSONResponse:
    """Remove a saved process from the user's watchlist."""
    deleted = await unsave_process(_user_id(user), proceso_id, settings)
    if not deleted:
        raise HTTPException(status_code=404, detail="Proceso no encontrado en guardados")
    return JSONResponse(status_code=204, content=None)


@router.put("/saved/{proceso_id}/alert")
async def toggle_process_alert(
    proceso_id: str,
    body:       AlertToggleRequest,
    user:       dict[str, Any] = Depends(get_current_user),
    settings:   Settings       = Depends(get_settings),
) -> JSONResponse:
    """Enable or disable alert for a saved process."""
    updated = await toggle_alert(_user_id(user), proceso_id, body.enabled, settings)
    if updated is None:
        raise HTTPException(status_code=404, detail="Proceso no encontrado en guardados")
    return JSONResponse(content=updated)


# ── Document Management (Sprint 4) ────────────────────────────────────────

# Allowed doc_type values matching the contracts.document_type enum
_VALID_DOC_TYPES = frozenset({"RUP", "FINANCIAL", "EXPERIENCE", "LEGAL_REP", "OTHER"})

# 20 MiB — reasonable ceiling for scanned government certificates
_MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024


@router.post("/documents", status_code=202)
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    doc_type: str,
    file: UploadFile = File(...),
    user: dict[str, Any] = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    """
    Upload a company document (PDF only).

    Returns 202 immediately with status=UPLOADED. The background worker
    extracts text, chunks it, generates Titan Embed v2 embeddings, and
    stores them in pgvector. Poll GET /documents to check indexing progress.
    """
    uid = _user_id(user)

    # Validate doc_type before any I/O
    doc_type_upper = doc_type.strip().upper()
    if doc_type_upper not in _VALID_DOC_TYPES:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"doc_type inválido. Valores permitidos: {', '.join(sorted(_VALID_DOC_TYPES))}",
        )

    # Require company profile (FK constraint on company_documents.company_id)
    profile = await get_company_profile(uid, settings)
    if not profile:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Crea tu perfil de empresa antes de subir documentos",
        )
    company_id: str = profile["id"]

    # Validate file extension
    filename = file.filename or "documento.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            "Solo se aceptan archivos PDF",
        )

    # Read and validate size
    file_bytes = await file.read()
    if len(file_bytes) > _MAX_PDF_SIZE_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"El archivo excede el límite de {_MAX_PDF_SIZE_BYTES // (1024 * 1024)} MiB",
        )
    if len(file_bytes) == 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "El archivo está vacío",
        )

    # Upload to S3
    store = S3DocumentStore(settings)
    content_type = file.content_type or "application/pdf"
    s3_key = store.upload(file_bytes, filename, company_id, content_type)

    # Create DB record
    conn = await asyncpg.connect(
        get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO company_documents
              (company_id, user_id, filename, doc_type, s3_key,
               file_size_bytes, mime_type, status)
            VALUES ($1, $2, $3, $4::document_type, $5, $6, $7, 'UPLOADED')
            RETURNING *
            """,
            company_id,
            uid,
            filename,
            doc_type_upper,
            s3_key,
            len(file_bytes),
            content_type,
        )
        if row is None:
            raise HTTPException(
                status.HTTP_500_INTERNAL_SERVER_ERROR,
                "Error creando registro del documento",
            )
        doc = _row_to_dict(row)
    finally:
        await conn.close()

    # Fire-and-forget indexing — ARQ when available, BackgroundTask fallback
    arq_pool = getattr(request.app.state, "arq_pool", None)
    if arq_pool:
        # Upload file to S3 first so ARQ worker can access it
        s3_store = S3DocumentStore(settings)
        s3_key = s3_store.upload(file_bytes, filename, company_id)
        await arq_pool.enqueue_job("task_index_document", doc["id"], company_id, s3_key)
        logger.info("Document indexing queued via ARQ: doc=%s", doc["id"][:8])
    else:
        background_tasks.add_task(index_document, doc["id"], company_id, file_bytes, settings)
        logger.info("Document indexing via BackgroundTask: doc=%s", doc["id"][:8])

    logger.info(
        "Document upload accepted",
        extra={"doc_id": doc["id"], "company_id": company_id, "filename": filename},
    )
    return JSONResponse(
        status_code=202,
        content={**doc, "message": "Documento recibido. Indexando en segundo plano..."},
    )


@router.get("/documents")
async def list_documents(
    user: dict[str, Any] = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    """List all documents for the authenticated user's company, with presigned download URLs."""
    uid = _user_id(user)
    profile = await get_company_profile(uid, settings)
    if not profile:
        return JSONResponse(content={"documents": [], "total": 0})

    company_id: str = profile["id"]
    conn = await asyncpg.connect(
        get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    try:
        rows = await conn.fetch(
            "SELECT * FROM company_documents WHERE company_id = $1 ORDER BY created_at DESC",
            company_id,
        )
        docs = [_row_to_dict(r) for r in rows]
    finally:
        await conn.close()

    # Attach presigned download URLs
    store = S3DocumentStore(settings)
    for doc in docs:
        s3_key = doc.get("s3_key")
        if s3_key:
            try:
                doc["download_url"] = store.get_presigned_url(s3_key)
            except Exception as presign_exc:
                logger.warning(
                    "Failed to generate presigned URL",
                    extra={"doc_id": doc.get("id"), "error": str(presign_exc)},
                )
                doc["download_url"] = None
        else:
            doc["download_url"] = None

    return JSONResponse(content={"documents": docs, "total": len(docs)})


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    user: dict[str, Any] = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    """
    Delete a document, its S3 object, and all associated chunks.

    Authorization: the document must belong to the authenticated user.
    The S3 deletion is best-effort — if it fails the DB record is still removed
    to avoid orphaned references (S3 lifecycle can clean up later).
    """
    uid = _user_id(user)
    conn = await asyncpg.connect(
        get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    try:
        row = await conn.fetchrow(
            "SELECT * FROM company_documents WHERE id = $1 AND user_id = $2",
            document_id,
            uid,
        )
        if not row:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "Documento no encontrado",
            )

        # Best-effort S3 cleanup
        s3_key = row["s3_key"]
        if s3_key:
            try:
                S3DocumentStore(settings).delete(s3_key)
            except Exception as s3_exc:
                logger.warning(
                    "S3 deletion failed — proceeding with DB cleanup",
                    extra={"doc_id": document_id, "s3_key": s3_key, "error": str(s3_exc)},
                )

        # Delete chunks first (FK), then the document
        await conn.execute(
            "DELETE FROM document_chunks WHERE doc_id = $1",
            document_id,
        )
        await conn.execute(
            "DELETE FROM company_documents WHERE id = $1",
            document_id,
        )
    finally:
        await conn.close()

    logger.info("Document deleted", extra={"doc_id": document_id, "user_id": uid})
    return JSONResponse(status_code=204, content=None)
