"""
Workspace background worker — Sprint 9.

Handles two modes:
  MANUAL_UPLOAD  — user provides a ZIP (or individual files) they downloaded
                   from SECOP II.  The worker extracts, classifies, and stores.
  AUTO_FETCH     — attempts to download the ZIP from the url_proceso field.
                   community.secop.gov.co requires an authenticated session; if
                   the URL is publicly accessible (e.g. direct Azure Blob link)
                   it downloads directly.  Otherwise marks the job FAILED with a
                   clear message so the user knows to upload manually.

All file storage is on S3 (contracts-documents-520847769480) with SSE-AES256.
"""
from __future__ import annotations

import asyncio
import io
import logging
import zipfile
from pathlib import Path
from typing import TYPE_CHECKING

import boto3
from botocore.config import Config

if TYPE_CHECKING:
    from app.config import Settings

logger = logging.getLogger(__name__)

# ── S3 helpers ────────────────────────────────────────────────────────────

def _s3(settings: "Settings"):
    return boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        config=Config(signature_version="s3v4"),
    )


def _safe_name(name: str) -> str:
    """Strip path separators and non-ASCII to keep S3 keys clean."""
    return "".join(
        c if (c.isalnum() or c in "._-") else "_"
        for c in Path(name).name
    ).encode("ascii", "ignore").decode()


def _classify(filename: str) -> str:
    name = filename.lower()
    ext = Path(name).suffix.lstrip(".")
    if ext in ("xlsx", "xls"):
        return "EXCEL_TEMPLATE"
    if ext == "pdf":
        kws = ("pliego", "condicion", "estudio", "tecnic", "invit")
        return "PDF_PLIEGO" if any(k in name for k in kws) else "PDF_ANEXO"
    return "OTHER"


# ── ZIP extraction ────────────────────────────────────────────────────────

async def _extract_and_store(
    zip_bytes: bytes,
    job_id: str,
    proceso_id: str,
    user_id: str,
    settings: "Settings",
) -> list[dict]:
    """
    Extract ZIP, classify files, upload each to S3, and insert DB records.
    Returns list of document dicts.
    """
    from app.application.manage_workspace import insert_document

    client = _s3(settings)
    docs: list[dict] = []

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        entries = [e for e in zf.infolist() if not e.is_dir()]
        if not entries:
            raise ValueError("ZIP está vacío o no contiene archivos")

        for entry in entries:
            raw_name = entry.filename
            safe = _safe_name(raw_name)
            if not safe:
                continue

            file_bytes = zf.read(entry)
            file_type = _classify(safe)
            s3_key = f"workspace/{user_id}/{proceso_id}/{safe}"
            size_kb = max(1, len(file_bytes) // 1024)

            client.put_object(
                Bucket=settings.S3_BUCKET_DOCUMENTS,
                Key=s3_key,
                Body=file_bytes,
                ServerSideEncryption="AES256",
                Metadata={
                    "proceso_id": proceso_id[:100],
                    "file_type": file_type,
                },
            )

            doc = await insert_document(
                job_id=job_id,
                proceso_id=proceso_id,
                user_id=user_id,
                file_name=safe,
                file_type=file_type,
                s3_key=s3_key,
                file_size_kb=size_kb,
                settings=settings,
            )
            docs.append(doc)
            logger.info("Stored %s (%s, %d KB)", safe, file_type, size_kb)

    return docs


# ── Auto-fetch attempt (direct public URL only) ───────────────────────────

async def _try_direct_download(url_proceso: str | None) -> bytes | None:
    """
    Attempt to download the ZIP from url_proceso only if it is a DIRECT file
    URL (e.g. an Azure Blob SAS URL or a direct .zip link).

    community.secop.gov.co requires an authenticated browser session — we do
    NOT attempt to scrape it here.  If the URL is not a direct file, returns
    None and the caller falls back to manual upload guidance.
    """
    if not url_proceso:
        return None

    u = url_proceso.lower()
    # Only try direct file links
    if not (u.endswith(".zip") or "blob.core.windows.net" in u or "download" in u):
        return None

    import urllib.request, ssl, urllib.error
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    try:
        req = urllib.request.Request(
            url_proceso,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
                "Accept": "application/zip, application/octet-stream, */*",
            },
        )
        resp = urllib.request.urlopen(req, context=ctx, timeout=30)
        ct = resp.headers.get("Content-Type", "")
        if "zip" in ct or "octet" in ct or "stream" in ct:
            return resp.read()
        # If content is HTML/text it's a login page — skip
        return None
    except Exception as exc:
        logger.debug("Direct download attempt failed: %s", exc)
        return None


# ── Manual upload (ZIP bytes from multipart) ─────────────────────────────

async def process_uploaded_zip(
    job_id: str,
    proceso_id: str,
    user_id: str,
    zip_bytes: bytes,
    settings: "Settings",
) -> None:
    """
    Process a ZIP uploaded manually by the user.
    Never raises — errors are written to the job record.
    """
    from app.application.manage_workspace import update_job_status

    try:
        await update_job_status(job_id, "EXTRACTING", settings=settings)
        docs = await _extract_and_store(
            zip_bytes, job_id, proceso_id, user_id, settings
        )
        await update_job_status(job_id, "READY", settings=settings)
        logger.info("Job %s READY — %d documents", job_id, len(docs))
    except Exception as exc:
        logger.error("process_uploaded_zip failed for job %s: %s", job_id, exc)
        await update_job_status(
            job_id, "FAILED", error_msg=str(exc)[:400], settings=settings
        )


# ── Auto-fetch job ────────────────────────────────────────────────────────

async def run_auto_fetch_job(
    job_id: str,
    proceso_id: str,
    user_id: str,
    url_proceso: str | None,
    settings: "Settings",
) -> None:
    """
    Attempt automatic download.  Falls back gracefully with FAILED status
    and an actionable error message when community.secop.gov.co requires auth.
    """
    from app.application.manage_workspace import update_job_status

    try:
        await update_job_status(job_id, "DOWNLOADING", settings=settings)
        zip_bytes = await _try_direct_download(url_proceso)

        if not zip_bytes:
            await update_job_status(
                job_id,
                "FAILED",
                error_msg=(
                    "La descarga automática no está disponible para este proceso. "
                    "Descarga el ZIP desde SECOP II y cárgalo manualmente."
                ),
                settings=settings,
            )
            return

        await update_job_status(job_id, "EXTRACTING", settings=settings)
        docs = await _extract_and_store(
            zip_bytes, job_id, proceso_id, user_id, settings
        )
        await update_job_status(job_id, "READY", settings=settings)
        logger.info("Auto-fetch job %s READY — %d docs", job_id, len(docs))

    except Exception as exc:
        logger.error("Auto-fetch job %s failed: %s", job_id, exc)
        await update_job_status(
            job_id, "FAILED", error_msg=str(exc)[:400], settings=settings
        )


# ── Quote generation ──────────────────────────────────────────────────────

async def generate_quote(
    quote_id: str,
    proceso_id: str,
    user_id: str,
    source_doc_id: str,
    source_s3_key: str,
    settings: "Settings",
) -> None:
    """
    Generate a pre-filled Excel quote from a template.
    Never raises — errors go into the quote record status.
    """
    import asyncpg
    from app.application.manage_company import get_pg_url
    from app.application.manage_workspace import update_quote
    from app.infrastructure.template_autofiller import autofill_template

    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        profile_row = await conn.fetchrow(
            "SELECT * FROM contracts.company_profiles WHERE user_id=$1", user_id
        )
    finally:
        await conn.close()

    if not profile_row:
        await update_quote(
            quote_id, "FAILED", 0, {}, settings
        )
        logger.warning("generate_quote: no company profile for user %s", user_id)
        return

    profile = {
        "razon_social":    profile_row["razon_social"] or "",
        "nombre_comercial":profile_row["nombre_comercial"] or "",
        "nit":             profile_row["nit"] or "",
        "representante":   profile_row["representante"] or "",
        "email_contacto":  profile_row["email_contacto"] or "",
        "telefono":        profile_row["telefono"] or "",
        "departamento":    profile_row["departamento"] or "",
        "ciudad":          profile_row["ciudad"] or "",
        "capacidad_k":     str(profile_row["capacidad_k"] or ""),
    }

    try:
        filled_bytes, mapping, fill_pct = await autofill_template(
            source_key=source_s3_key,
            profile=profile,
            settings=settings,
        )

        from pathlib import Path
        out_key = (
            f"workspace/{user_id}/{proceso_id}/cotizacion_prellenada_"
            f"{quote_id[:8]}.xlsx"
        )
        s3 = boto3.client(
            "s3",
            region_name=settings.S3_REGION,
            config=Config(signature_version="s3v4"),
        )
        s3.put_object(
            Bucket=settings.S3_BUCKET_DOCUMENTS,
            Key=out_key,
            Body=filled_bytes,
            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ServerSideEncryption="AES256",
        )

        # Update quote record with the final S3 key
        conn2 = await asyncpg.connect(
            get_pg_url(settings), server_settings={"search_path": "contracts,public"}
        )
        try:
            import json
            await conn2.execute(
                """UPDATE contracts.generated_quotes
                   SET status='READY', fill_pct=$1, cell_mapping=$2, s3_key=$3
                   WHERE id=$4""",
                fill_pct, json.dumps(mapping), out_key, quote_id,
            )
        finally:
            await conn2.close()

        logger.info(
            "Quote %s READY — %d%% filled, key=%s", quote_id, fill_pct, out_key
        )

    except Exception as exc:
        logger.error("generate_quote failed for %s: %s", quote_id, exc)
        await update_quote(quote_id, "FAILED", 0, {}, settings)
