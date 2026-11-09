"""
ARQ worker configuration — Sprint 13.

ARQ (Async Redis Queue) uses the SAME asyncio pattern as FastAPI.
Tasks are async functions that receive a context dict with shared resources.

Worker process is completely separate from the API:
  API: POST /evaluate → enqueue → 202 immediate
  Worker: pulls job from queue → runs evaluate_bid → writes to DB
  Frontend: polls /evaluations/{id} for COMPLETED status (already does this)

Redis DB 3 is used for ARQ queues (DB 0=GovDocs, DB 1=Atelier, DB 2=Contracts cache, DB 3=ARQ)
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

import asyncpg

try:
    from arq.connections import RedisSettings
    from arq.cron import cron as arq_cron
    _ARQ_AVAILABLE = True
except ImportError:
    _ARQ_AVAILABLE = False
    RedisSettings = None  # type: ignore
    arq_cron = None       # type: ignore

from app.config import Settings
from app.application.manage_company import get_pg_url

logger = logging.getLogger(__name__)

# ── Shared ARQ Redis settings ─────────────────────────────────────────────

def get_arq_redis() -> RedisSettings:
    settings = Settings()
    # Parse redis URL: redis://127.0.0.1:6379/2 → host:port + db 3 for ARQ
    url = settings.REDIS_URL  # e.g. redis://127.0.0.1:6379/2
    parts = url.replace("redis://", "").split("/")
    host_port = parts[0].split(":")
    host = host_port[0]
    port = int(host_port[1]) if len(host_port) > 1 else 6379
    return RedisSettings(host=host, port=port, database=3)  # DB 3 for ARQ


# ── Worker startup / shutdown ─────────────────────────────────────────────

async def startup(ctx: dict[str, Any]) -> None:
    """Initialise shared resources for all tasks in this worker."""
    from app.infrastructure.secop_soda_gateway import SecopSodaGateway

    settings = Settings()
    ctx["settings"] = settings

    # asyncpg pool — shared across all tasks in this worker
    ctx["pg_pool"] = await asyncpg.create_pool(
        get_pg_url(settings),
        min_size=3,
        max_size=10,
        server_settings={"search_path": "contracts,public"},
    )

    # SECOP gateway
    ctx["gateway"] = SecopSodaGateway(settings)

    logger.info("ARQ worker started — pool min=3 max=10")


async def shutdown(ctx: dict[str, Any]) -> None:
    """Clean up resources on graceful shutdown."""
    await ctx["pg_pool"].close()
    await ctx["gateway"].aclose()
    logger.info("ARQ worker shutdown complete")


# ── Tasks ─────────────────────────────────────────────────────────────────

async def task_evaluate_bid(
    ctx: dict[str, Any],
    user_id: str,
    company_id: str | None,
    proceso_id: str,
) -> dict:
    """
    Full AI bid evaluation pipeline.
    Runs Bedrock Converse API + RAG retrieval in a worker process,
    completely decoupled from the HTTP request lifecycle.
    """
    from app.application.evaluate_bid import evaluate_bid

    settings: Settings = ctx["settings"]
    gateway = ctx["gateway"]
    logger.info("Worker: starting evaluation user=%s proceso=%s", user_id[:8], proceso_id)
    result = await evaluate_bid(user_id, company_id, proceso_id, settings, gateway)
    logger.info("Worker: evaluation done status=%s", result.get("status"))
    return result


async def task_index_document(
    ctx: dict[str, Any],
    doc_id: str,
    company_id: str,
    s3_key: str,
) -> dict:
    """
    PDF → text → chunks → embeddings → pgvector pipeline.
    Potentially 30-120s depending on PDF size.
    """
    import boto3
    from botocore.config import Config
    from app.workers.embedding_worker import index_document

    settings: Settings = ctx["settings"]

    # Download file from S3
    s3 = boto3.client("s3", region_name=settings.S3_REGION,
                      config=Config(signature_version="s3v4"))
    obj = s3.get_object(Bucket=settings.S3_BUCKET_DOCUMENTS, Key=s3_key)
    file_bytes = obj["Body"].read()

    logger.info("Worker: indexing doc=%s", doc_id[:8])
    await index_document(doc_id, company_id, file_bytes, settings)
    return {"doc_id": doc_id, "status": "indexed"}


async def task_process_zip(
    ctx: dict[str, Any],
    job_id: str,
    proceso_id: str,
    user_id: str,
    s3_zip_key: str,
) -> dict:
    """
    ZIP → extract → classify → S3 → DB (workspace).
    """
    import boto3
    from botocore.config import Config
    from app.workers.workspace_worker import _extract_and_store
    from app.application.manage_workspace import update_job_status

    settings: Settings = ctx["settings"]
    s3 = boto3.client("s3", region_name=settings.S3_REGION,
                      config=Config(signature_version="s3v4"))

    try:
        await update_job_status(job_id, "EXTRACTING", settings=settings)
        obj = s3.get_object(Bucket=settings.S3_BUCKET_DOCUMENTS, Key=s3_zip_key)
        zip_bytes = obj["Body"].read()

        docs = await _extract_and_store(zip_bytes, job_id, proceso_id, user_id, settings)
        await update_job_status(job_id, "READY", settings=settings)
        logger.info("Worker: ZIP processed job=%s docs=%d", job_id[:8], len(docs))
        return {"job_id": job_id, "docs": len(docs)}
    except Exception as exc:
        await update_job_status(job_id, "FAILED", error_msg=str(exc)[:400], settings=settings)
        raise


async def task_generate_quote(
    ctx: dict[str, Any],
    quote_id: str,
    proceso_id: str,
    user_id: str,
    source_doc_id: str,
    source_s3_key: str,
) -> dict:
    """
    Excel template → auto-fill with company profile → S3.
    """
    from app.workers.workspace_worker import generate_quote

    settings: Settings = ctx["settings"]
    logger.info("Worker: generating quote=%s", quote_id[:8])
    await generate_quote(quote_id, proceso_id, user_id, source_doc_id, source_s3_key, settings)
    return {"quote_id": quote_id}


async def task_extract_external(
    ctx: dict[str, Any],
    user_id: str,
    raw_text: str,
    page_url: str,
) -> dict:
    """
    Claude extraction from pasted SECOP II text.
    """
    from app.infrastructure.secop_text_extractor import extract_from_text
    from app.application.manage_external_process import create_external_process

    settings: Settings = ctx["settings"]
    extracted = await extract_from_text(raw_text, settings)
    extracted["url_secop"] = page_url
    proc = await create_external_process(user_id, extracted, settings)
    return proc


# ── Alert cron (runs in worker, not in API process) ───────────────────────

async def task_alert_cycle(ctx: dict[str, Any]) -> dict:
    """
    SECOP polling + SES alert dispatch. Replaces the asyncio background
    task in main.py — runs every 6 hours via ARQ cron.
    """
    from app.workers.secop_sync_worker import _run_once

    settings: Settings = ctx["settings"]
    gateway = ctx["gateway"]
    logger.info("ARQ cron: starting alert cycle")
    await _run_once(settings, gateway)
    return {"status": "done"}


# ── ARQ WorkerSettings ────────────────────────────────────────────────────

class WorkerSettings:
    """
    ARQ worker configuration.

    Run with:
      /opt/contracts-api-venv/bin/arq app.workers.arq_worker.WorkerSettings
    """
    functions = [
        task_evaluate_bid,
        task_index_document,
        task_process_zip,
        task_generate_quote,
        task_extract_external,
        task_alert_cycle,
    ]

    if _ARQ_AVAILABLE and arq_cron:
        cron_jobs = [
            arq_cron(task_alert_cycle, hour={0, 6, 12, 18}, minute=0, run_at_startup=False),
        ]

    redis_settings = get_arq_redis()
    max_jobs = 5
    job_timeout = 300
    max_tries = 2
    on_startup = startup
    on_shutdown = shutdown
    health_check_interval = 30
