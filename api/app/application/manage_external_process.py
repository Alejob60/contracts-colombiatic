"""
External process management — Sprint 10B.

Stores process data entered manually by the user when the process
hasn't arrived in SODA yet (or is missing from datos.gov.co entirely).

IDs always start with 'EXT-' to distinguish from SODA-sourced processes.
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from decimal import Decimal
from uuid import UUID

import asyncpg

from app.config import Settings
from app.application.manage_company import get_pg_url

logger = logging.getLogger(__name__)


def _make_proceso_id() -> str:
    return f"EXT-{str(uuid.uuid4())[:8].upper()}"


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


# ── CRUD ─────────────────────────────────────────────────────────────────────

async def create_external_process(
    user_id: str, data: dict, settings: Settings
) -> dict:
    proceso_id = data.get("proceso_id") or _make_proceso_id()
    if not proceso_id.startswith("EXT-"):
        proceso_id = f"EXT-{proceso_id}"

    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO contracts.external_processes
              (proceso_id, user_id, titulo, entidad, nit_entidad, departamento,
               ciudad, modalidad, tipo_contrato, estado, precio_base, unspsc_codes,
               url_secop, fecha_pub, fecha_cierre, descripcion, source,
               raw_input, extraction_json)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::text[],$13,$14,$15,$16,$17,$18,$19)
            ON CONFLICT (proceso_id) DO UPDATE SET
              titulo          = EXCLUDED.titulo,
              entidad         = EXCLUDED.entidad,
              nit_entidad     = EXCLUDED.nit_entidad,
              departamento    = EXCLUDED.departamento,
              ciudad          = EXCLUDED.ciudad,
              modalidad       = EXCLUDED.modalidad,
              tipo_contrato   = EXCLUDED.tipo_contrato,
              estado          = EXCLUDED.estado,
              precio_base     = EXCLUDED.precio_base,
              unspsc_codes    = EXCLUDED.unspsc_codes,
              url_secop       = EXCLUDED.url_secop,
              fecha_pub       = EXCLUDED.fecha_pub,
              fecha_cierre    = EXCLUDED.fecha_cierre,
              descripcion     = EXCLUDED.descripcion,
              source          = EXCLUDED.source,
              raw_input       = EXCLUDED.raw_input,
              extraction_json = EXCLUDED.extraction_json,
              updated_at      = now()
            RETURNING *
            """,
            proceso_id,
            user_id,
            data.get("titulo"),
            data.get("entidad"),
            data.get("nit_entidad"),
            data.get("departamento"),
            data.get("ciudad"),
            data.get("modalidad"),
            data.get("tipo_contrato"),
            data.get("estado", "Publicado"),
            data.get("precio_base"),
            data.get("unspsc_codes", []),
            data.get("url_secop"),
            _parse_dt(data.get("fecha_pub")),
            _parse_dt(data.get("fecha_cierre")),
            data.get("descripcion"),
            data.get("source", "paste"),
            data.get("raw_input"),
            json.dumps(data.get("extraction_json")) if data.get("extraction_json") else None,
        )
        return _row(row)
    finally:
        await conn.close()


async def get_external_process(
    proceso_id: str, user_id: str, settings: Settings
) -> dict | None:
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        row = await conn.fetchrow(
            "SELECT * FROM contracts.external_processes WHERE proceso_id=$1 AND user_id=$2",
            proceso_id, user_id,
        )
        return _row(row) if row else None
    finally:
        await conn.close()


async def list_external_processes(user_id: str, settings: Settings) -> list[dict]:
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        rows = await conn.fetch(
            """
            SELECT * FROM contracts.external_processes
            WHERE user_id=$1
            ORDER BY
                CASE WHEN fecha_cierre IS NOT NULL THEN 0 ELSE 1 END,
                fecha_cierre ASC,
                created_at DESC
            LIMIT 50
            """,
            user_id,
        )
        return [_row(r) for r in rows]
    finally:
        await conn.close()


def _parse_dt(val) -> datetime | None:
    if not val:
        return None
    if isinstance(val, datetime):
        return val
    try:
        from datetime import timezone
        s = str(val).strip()
        # Handle Colombian timezone offset
        s = s.replace("(UTC-05:00)", "-05:00").replace("UTC-5", "-05:00")
        # Remove parenthetical descriptions
        import re
        s = re.sub(r'\(.*?\)', '', s).strip()
        return datetime.fromisoformat(s)
    except Exception:
        logger.warning("Could not parse date: %r", val)
        return None
