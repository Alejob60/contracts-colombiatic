"""
Workspace CRUD — Sprint 9.

Manages process_fetch_jobs, process_documents and generated_quotes
with raw asyncpg (same pattern as manage_company.py).
"""
from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal
from uuid import UUID

import asyncpg

from app.config import Settings
from app.application.manage_company import get_pg_url

logger = logging.getLogger(__name__)


def _row(row) -> dict:
    out: dict = {}
    for k, v in dict(row).items():
        if isinstance(v, UUID):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out


# ── Fetch Jobs ────────────────────────────────────────────────────────────

async def create_job(
    user_id: str,
    proceso_id: str,
    url_proceso: str | None,
    status: str,
    settings: Settings,
) -> dict:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO contracts.process_fetch_jobs
              (user_id, proceso_id, url_proceso, status)
            VALUES ($1, $2, $3, $4)
            RETURNING *
            """,
            user_id, proceso_id, url_proceso, status,
        )
        return _row(row)
    finally:
        await conn.close()


async def get_job(job_id: str, settings: Settings) -> dict | None:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        row = await conn.fetchrow(
            "SELECT * FROM contracts.process_fetch_jobs WHERE id=$1", job_id
        )
        return _row(row) if row else None
    finally:
        await conn.close()


async def get_latest_job(
    user_id: str, proceso_id: str, settings: Settings
) -> dict | None:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        row = await conn.fetchrow(
            """
            SELECT * FROM contracts.process_fetch_jobs
            WHERE user_id=$1 AND proceso_id=$2
            ORDER BY created_at DESC LIMIT 1
            """,
            user_id, proceso_id,
        )
        return _row(row) if row else None
    finally:
        await conn.close()


async def update_job_status(
    job_id: str, status: str, error_msg: str | None = None, settings: Settings = None
) -> None:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        await conn.execute(
            """UPDATE contracts.process_fetch_jobs
               SET status=$1, error_msg=$2, updated_at=now()
               WHERE id=$3""",
            status, error_msg, job_id,
        )
    finally:
        await conn.close()


# ── Documents ─────────────────────────────────────────────────────────────

async def insert_document(
    job_id: str,
    proceso_id: str,
    user_id: str,
    file_name: str,
    file_type: str,
    s3_key: str,
    file_size_kb: int,
    settings: Settings,
) -> dict:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO contracts.process_documents
              (job_id, proceso_id, user_id, file_name, file_type, s3_key, file_size_kb)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING *
            """,
            job_id, proceso_id, user_id, file_name, file_type, s3_key, file_size_kb,
        )
        return _row(row)
    finally:
        await conn.close()


async def list_documents(
    user_id: str, proceso_id: str, settings: Settings
) -> list[dict]:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        rows = await conn.fetch(
            """
            SELECT * FROM contracts.process_documents
            WHERE user_id=$1 AND proceso_id=$2
            ORDER BY file_type, file_name
            """,
            user_id, proceso_id,
        )
        return [_row(r) for r in rows]
    finally:
        await conn.close()


# ── Generated Quotes ──────────────────────────────────────────────────────

async def create_quote(
    proceso_id: str,
    user_id: str,
    source_doc_id: str,
    s3_key: str,
    settings: Settings,
) -> dict:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO contracts.generated_quotes
              (proceso_id, user_id, source_doc_id, s3_key, status)
            VALUES ($1,$2,$3,$4,'PROCESSING')
            RETURNING *
            """,
            proceso_id, user_id, source_doc_id, s3_key,
        )
        return _row(row)
    finally:
        await conn.close()


async def update_quote(
    quote_id: str,
    status: str,
    fill_pct: int,
    cell_mapping: dict,
    settings: Settings,
) -> None:
    import json
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        await conn.execute(
            """UPDATE contracts.generated_quotes
               SET status=$1, fill_pct=$2, cell_mapping=$3
               WHERE id=$4""",
            status, fill_pct, json.dumps(cell_mapping), quote_id,
        )
    finally:
        await conn.close()


async def list_quotes(
    user_id: str, proceso_id: str, settings: Settings
) -> list[dict]:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        rows = await conn.fetch(
            """
            SELECT q.*, d.file_name AS source_file_name
            FROM contracts.generated_quotes q
            LEFT JOIN contracts.process_documents d ON d.id = q.source_doc_id
            WHERE q.user_id=$1 AND q.proceso_id=$2
            ORDER BY q.generated_at DESC
            """,
            user_id, proceso_id,
        )
        return [_row(r) for r in rows]
    finally:
        await conn.close()
