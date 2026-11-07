"""
Company profile and saved processes use cases — Sprint 3.

Uses raw asyncpg (no ORM) so it works with the contracts schema
alongside the main realculture DB.
"""
from __future__ import annotations

import asyncpg
from decimal import Decimal
from datetime import datetime
from uuid import UUID

from app.config import Settings


def get_pg_url(settings: Settings) -> str:
    return (settings.DATABASE_URL
            .replace("postgresql+asyncpg://", "postgresql://")
            .split("?")[0])


def _row_to_dict(row) -> dict:
    """Convert asyncpg Record to JSON-serializable dict."""
    result = {}
    for key, val in dict(row).items():
        if isinstance(val, UUID):
            result[key] = str(val)
        elif isinstance(val, datetime):
            result[key] = val.isoformat()
        elif isinstance(val, Decimal):
            result[key] = float(val)
        else:
            result[key] = val
    return result


# ── Company Profile ───────────────────────────────────────────────────────

async def get_company_profile(user_id: str, settings: Settings) -> dict | None:
    conn = await asyncpg.connect(get_pg_url(settings), server_settings={"search_path": "contracts,public"})
    try:
        row = await conn.fetchrow(
            "SELECT * FROM company_profiles WHERE user_id=$1", user_id
        )
        return _row_to_dict(row) if row else None
    finally:
        await conn.close()


async def upsert_company_profile(user_id: str, data: dict, settings: Settings) -> dict:
    conn = await asyncpg.connect(get_pg_url(settings), server_settings={"search_path": "contracts,public"})
    try:
        row = await conn.fetchrow("""
            INSERT INTO company_profiles
              (user_id, nit, nit_dv, razon_social, nombre_comercial, representante,
               email_contacto, telefono, departamento, ciudad, unspsc_codes,
               capacidad_k, sector, tamano)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::text[],$12,$13,$14)
            ON CONFLICT (user_id) DO UPDATE SET
              nit             = EXCLUDED.nit,
              nit_dv          = EXCLUDED.nit_dv,
              razon_social    = EXCLUDED.razon_social,
              nombre_comercial= EXCLUDED.nombre_comercial,
              representante   = EXCLUDED.representante,
              email_contacto  = EXCLUDED.email_contacto,
              telefono        = EXCLUDED.telefono,
              departamento    = EXCLUDED.departamento,
              ciudad          = EXCLUDED.ciudad,
              unspsc_codes    = EXCLUDED.unspsc_codes,
              capacidad_k     = EXCLUDED.capacidad_k,
              sector          = EXCLUDED.sector,
              tamano          = EXCLUDED.tamano,
              updated_at      = now()
            RETURNING *
        """,
            user_id,
            data.get("nit"),
            data.get("nit_dv"),
            data.get("razon_social"),
            data.get("nombre_comercial"),
            data.get("representante"),
            data.get("email_contacto"),
            data.get("telefono"),
            data.get("departamento"),
            data.get("ciudad"),
            data.get("unspsc_codes", []),
            data.get("capacidad_k"),
            data.get("sector"),
            data.get("tamano"),
        )
        return _row_to_dict(row)
    finally:
        await conn.close()


# ── Saved Processes ───────────────────────────────────────────────────────

async def get_saved_processes(user_id: str, settings: Settings) -> list[dict]:
    conn = await asyncpg.connect(get_pg_url(settings), server_settings={"search_path": "contracts,public"})
    try:
        rows = await conn.fetch(
            "SELECT * FROM saved_processes WHERE user_id=$1 ORDER BY created_at DESC",
            user_id,
        )
        return [_row_to_dict(r) for r in rows]
    finally:
        await conn.close()


async def save_process(user_id: str, data: dict, settings: Settings) -> dict:
    conn = await asyncpg.connect(get_pg_url(settings), server_settings={"search_path": "contracts,public"})
    try:
        row = await conn.fetchrow("""
            INSERT INTO saved_processes
              (user_id, proceso_id, nombre_proceso, entidad, precio_base,
               departamento, ciudad, estado, notes)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (user_id, proceso_id) DO UPDATE SET
              nombre_proceso = EXCLUDED.nombre_proceso,
              entidad        = EXCLUDED.entidad,
              precio_base    = EXCLUDED.precio_base,
              departamento   = EXCLUDED.departamento,
              ciudad         = EXCLUDED.ciudad,
              estado         = EXCLUDED.estado,
              notes          = COALESCE(EXCLUDED.notes, saved_processes.notes),
              updated_at     = now()
            RETURNING *
        """,
            user_id,
            data["proceso_id"],
            data.get("nombre_proceso"),
            data.get("entidad"),
            data.get("precio_base"),
            data.get("departamento"),
            data.get("ciudad"),
            data.get("estado"),
            data.get("notes"),
        )
        return _row_to_dict(row)
    finally:
        await conn.close()


async def unsave_process(user_id: str, proceso_id: str, settings: Settings) -> bool:
    conn = await asyncpg.connect(get_pg_url(settings), server_settings={"search_path": "contracts,public"})
    try:
        result = await conn.execute(
            "DELETE FROM saved_processes WHERE user_id=$1 AND proceso_id=$2",
            user_id, proceso_id,
        )
        return result == "DELETE 1"
    finally:
        await conn.close()


async def toggle_alert(user_id: str, proceso_id: str, enabled: bool, settings: Settings) -> dict | None:
    conn = await asyncpg.connect(get_pg_url(settings), server_settings={"search_path": "contracts,public"})
    try:
        row = await conn.fetchrow("""
            UPDATE saved_processes
            SET alert_enabled=$3, updated_at=now()
            WHERE user_id=$1 AND proceso_id=$2
            RETURNING *
        """, user_id, proceso_id, enabled)
        return _row_to_dict(row) if row else None
    finally:
        await conn.close()
