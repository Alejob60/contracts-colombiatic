"""
Workspace endpoints — Sprint 9 + Sprint 13 (ARQ queue).

Upload ZIP → ARQ job (or BackgroundTask fallback)
Generate quote → ARQ job (or BackgroundTask fallback)
All status polling unchanged — reads from DB.
"""
from __future__ import annotations

import logging
import uuid

import boto3
from botocore.config import Config
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Request, UploadFile, status

from app.application.manage_workspace import (
    create_job,
    create_quote,
    get_latest_job,
    list_documents,
    list_quotes,
)
from app.config import Settings
from app.dependencies import get_settings, require_pro
from app.workers.workspace_worker import (
    generate_quote,
    process_uploaded_zip,
    run_auto_fetch_job,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/workspace", tags=["workspace"])

MAX_ZIP_MB = 50


def _uid(user: dict) -> str:
    return str(user.get("sub") or user.get("userId") or "")


def _presigned(s3_key: str, settings: Settings, expires: int = 3600) -> str:
    client = boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        config=Config(signature_version="s3v4"),
    )
    return client.generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET_DOCUMENTS, "Key": s3_key},
        ExpiresIn=expires,
    )


# ── Upload ZIP (manual) ───────────────────────────────────────────────────

@router.post("/{proceso_id}/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_zip(
    proceso_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """User uploads the ZIP they downloaded from SECOP II."""
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Solo se aceptan archivos .zip")

    zip_bytes = await file.read()
    if len(zip_bytes) > MAX_ZIP_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail=f"El archivo supera los {MAX_ZIP_MB} MB permitidos"
        )
    if len(zip_bytes) < 22:
        raise HTTPException(status_code=400, detail="El archivo ZIP parece estar vacío o corrupto")

    user_id = _uid(user)
    job = await create_job(user_id, proceso_id, None, "MANUAL_UPLOAD", settings)
    job_id = job["id"]
    arq_pool = getattr(request.app.state, "arq_pool", None)

    # Upload ZIP to S3 first (needed by both ARQ and BackgroundTask paths)
    s3_zip_key = f"workspace/{user_id}/{proceso_id}/_upload_{job_id[:8]}.zip"
    client = boto3.client("s3", region_name=settings.S3_REGION,
                          config=Config(signature_version="s3v4"))
    client.put_object(Bucket=settings.S3_BUCKET_DOCUMENTS, Key=s3_zip_key,
                      Body=zip_bytes, ServerSideEncryption="AES256")

    if arq_pool:
        await arq_pool.enqueue_job("task_process_zip", job_id, proceso_id, user_id, s3_zip_key)
        logger.info("ZIP queued via ARQ: job=%s", job_id[:8])
    else:
        background_tasks.add_task(process_uploaded_zip, job_id, proceso_id, user_id, zip_bytes, settings)
        logger.info("ZIP processing via BackgroundTask: job=%s", job_id[:8])

    return {"job_id": job_id, "status": "MANUAL_UPLOAD", "message": "Procesando archivos…"}


# ── Auto-fetch (bonus — works only for direct public links) ──────────────

@router.post("/{proceso_id}/fetch", status_code=status.HTTP_202_ACCEPTED)
async def auto_fetch(
    proceso_id: str,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """
    Attempts automatic document fetch.  Only works when url_proceso points to a
    direct public file.  Falls back to FAILED with actionable guidance otherwise.
    """
    import asyncpg
    from app.application.manage_company import get_pg_url

    user_id = _uid(user)

    # Get the url_proceso from the saved process if available
    url_proceso: str | None = None
    try:
        conn = await asyncpg.connect(
            get_pg_url(settings), server_settings={"search_path": "contracts,public"}
        )
        try:
            row = await conn.fetchrow(
                "SELECT * FROM contracts.saved_processes WHERE user_id=$1 AND proceso_id=$2",
                user_id, proceso_id,
            )
        finally:
            await conn.close()
    except Exception:
        row = None

    job = await create_job(user_id, proceso_id, url_proceso, "QUEUED", settings)
    job_id = job["id"]

    background_tasks.add_task(
        run_auto_fetch_job,
        job_id, proceso_id, user_id, url_proceso, settings,
    )
    return {"job_id": job_id, "status": "QUEUED"}


# ── Status + documents ────────────────────────────────────────────────────

@router.get("/{proceso_id}/status")
async def workspace_status(
    proceso_id: str,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    user_id = _uid(user)
    job = await get_latest_job(user_id, proceso_id, settings)
    docs = await list_documents(user_id, proceso_id, settings)
    quotes = await list_quotes(user_id, proceso_id, settings)

    return {
        "job":       job,
        "documents": docs,
        "quotes":    quotes,
        "has_excel_templates": any(d["file_type"] == "EXCEL_TEMPLATE" for d in docs),
    }


# ── Generate quote ────────────────────────────────────────────────────────

@router.post("/{proceso_id}/quote/{doc_id}", status_code=status.HTTP_202_ACCEPTED)
async def request_quote(
    proceso_id: str,
    doc_id: str,
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    user_id = _uid(user)
    arq_pool = getattr(request.app.state, "arq_pool", None)

    docs = await list_documents(user_id, proceso_id, settings)
    doc = next((d for d in docs if d["id"] == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    if doc["file_type"] != "EXCEL_TEMPLATE":
        raise HTTPException(
            status_code=400,
            detail="Solo se pueden generar cotizaciones a partir de plantillas Excel",
        )

    quote_id = str(uuid.uuid4())
    placeholder_key = f"workspace/{user_id}/{proceso_id}/cotizacion_prellenada_{quote_id[:8]}.xlsx"
    quote = await create_quote(proceso_id, user_id, doc_id, placeholder_key, settings)

    if arq_pool:
        await arq_pool.enqueue_job(
            "task_generate_quote",
            quote["id"], proceso_id, user_id, doc_id, doc["s3_key"],
        )
        logger.info("Quote queued via ARQ: quote=%s", quote["id"][:8])
    else:
        background_tasks.add_task(
            generate_quote,
            quote["id"], proceso_id, user_id, doc_id, doc["s3_key"], settings,
        )

    return {"quote_id": quote["id"], "status": "PROCESSING"}


# ── List quotes ───────────────────────────────────────────────────────────

@router.get("/{proceso_id}/quotes")
async def get_quotes(
    proceso_id: str,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    user_id = _uid(user)
    quotes = await list_quotes(user_id, proceso_id, settings)
    return {"quotes": quotes}


# ── Presigned download URLs ───────────────────────────────────────────────

@router.get("/download/doc/{doc_id}")
async def download_doc(
    doc_id: str,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """Return a 1-hour presigned S3 URL for a workspace document."""
    import asyncpg
    from app.application.manage_company import get_pg_url

    user_id = _uid(user)
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        row = await conn.fetchrow(
            "SELECT s3_key FROM contracts.process_documents WHERE id=$1 AND user_id=$2",
            doc_id, user_id,
        )
    finally:
        await conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    url = _presigned(row["s3_key"], settings)
    return {"download_url": url}


@router.get("/download/quote/{quote_id}")
async def download_quote(
    quote_id: str,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """Return a 1-hour presigned S3 URL for a generated quote."""
    import asyncpg
    from app.application.manage_company import get_pg_url

    user_id = _uid(user)
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        row = await conn.fetchrow(
            """SELECT s3_key FROM contracts.generated_quotes
               WHERE id=$1 AND user_id=$2 AND status='READY'""",
            quote_id, user_id,
        )
    finally:
        await conn.close()

    if not row:
        raise HTTPException(
            status_code=404,
            detail="Cotización no encontrada o aún en procesamiento",
        )

    url = _presigned(row["s3_key"], settings)
    return {"download_url": url, "quote_id": quote_id}
