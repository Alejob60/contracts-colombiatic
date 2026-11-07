"""
B2B network use cases — Sprint 8.

Manages:
  * b2b_profiles  — per-user opt-in visibility + bio
  * b2b_connections — directional connection requests (PENDING/ACCEPTED/REJECTED)
  * directory search — public company listing with viewer's connection status
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


def _to_dict(row) -> dict:
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


# ── B2B Profile ───────────────────────────────────────────────────────────

async def get_b2b_profile(user_id: str, settings: Settings) -> dict:
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        row = await conn.fetchrow(
            "SELECT * FROM contracts.b2b_profiles WHERE user_id=$1", user_id
        )
        if row:
            return _to_dict(row)
        return {"user_id": user_id, "is_public": False, "bio": None, "website": None}
    finally:
        await conn.close()


async def upsert_b2b_profile(user_id: str, data: dict, settings: Settings) -> dict:
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO contracts.b2b_profiles (user_id, is_public, bio, website)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id) DO UPDATE SET
                is_public  = EXCLUDED.is_public,
                bio        = EXCLUDED.bio,
                website    = EXCLUDED.website,
                updated_at = now()
            RETURNING *
            """,
            user_id,
            bool(data.get("is_public", False)),
            data.get("bio"),
            data.get("website"),
        )
        return _to_dict(row)
    finally:
        await conn.close()


# ── Directory ─────────────────────────────────────────────────────────────

async def search_directory(
    viewer_user_id: str,
    q: str | None,
    sector: str | None,
    departamento: str | None,
    limit: int,
    offset: int,
    settings: Settings,
) -> dict:
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        # Build dynamic WHERE clause (excluding viewer + public only)
        params: list = [viewer_user_id]
        extra: list[str] = []

        if q:
            params.append(f"%{q}%")
            p = len(params)
            extra.append(
                f"(cp.razon_social ILIKE ${p} OR cp.nombre_comercial ILIKE ${p})"
            )
        if sector:
            params.append(f"%{sector}%")
            extra.append(f"cp.sector ILIKE ${len(params)}")
        if departamento:
            params.append(departamento)
            extra.append(f"cp.departamento = ${len(params)}")

        extra_sql = ("AND " + " AND ".join(extra)) if extra else ""

        # Append LIMIT/OFFSET params
        params += [limit, offset]
        lim_p, off_p = len(params) - 1, len(params)

        base_where = f"""
            cp.user_id != $1
            AND bp.is_public = true
            AND cp.razon_social IS NOT NULL AND cp.razon_social != ''
            {extra_sql}
        """

        rows = await conn.fetch(
            f"""
            SELECT
                cp.user_id,
                cp.razon_social,
                cp.nombre_comercial,
                cp.sector,
                cp.tamano,
                cp.departamento,
                cp.ciudad,
                cp.unspsc_codes,
                cp.capacidad_k,
                bp.bio,
                bp.website,
                c_out.id     AS conn_out_id,
                c_out.status AS conn_out_status,
                c_in.id      AS conn_in_id,
                c_in.status  AS conn_in_status,
                CASE
                    WHEN c_out.status = 'ACCEPTED' OR c_in.status = 'ACCEPTED'
                    THEN cp.email_contacto ELSE NULL
                END AS email_contacto,
                CASE
                    WHEN c_out.status = 'ACCEPTED' OR c_in.status = 'ACCEPTED'
                    THEN cp.telefono ELSE NULL
                END AS telefono
            FROM contracts.company_profiles cp
            INNER JOIN contracts.b2b_profiles bp ON bp.user_id = cp.user_id
            LEFT JOIN contracts.b2b_connections c_out
                ON c_out.requester_id = $1 AND c_out.target_id = cp.user_id
            LEFT JOIN contracts.b2b_connections c_in
                ON c_in.target_id = $1 AND c_in.requester_id = cp.user_id
            WHERE {base_where}
            ORDER BY cp.razon_social
            LIMIT ${lim_p} OFFSET ${off_p}
            """,
            *params,
        )

        # Count (reuse params without LIMIT/OFFSET)
        count_params = params[:-2]
        total = await conn.fetchval(
            f"""
            SELECT COUNT(*)
            FROM contracts.company_profiles cp
            INNER JOIN contracts.b2b_profiles bp ON bp.user_id = cp.user_id
            WHERE {base_where}
            """,
            *count_params,
        )

        companies: list[dict] = []
        for row in rows:
            d = _to_dict(row)
            if not d.get("unspsc_codes"):
                d["unspsc_codes"] = []
            # Flatten connection status
            if d.get("conn_out_id"):
                d["connection_id"]     = d["conn_out_id"]
                d["connection_status"] = d["conn_out_status"]
                d["is_requester"]      = True
            elif d.get("conn_in_id"):
                d["connection_id"]     = d["conn_in_id"]
                d["connection_status"] = d["conn_in_status"]
                d["is_requester"]      = False
            else:
                d["connection_id"]     = None
                d["connection_status"] = None
                d["is_requester"]      = False
            for k in ("conn_out_id", "conn_out_status", "conn_in_id", "conn_in_status"):
                d.pop(k, None)
            companies.append(d)

        return {"companies": companies, "total": int(total or 0)}
    finally:
        await conn.close()


# ── Connections ───────────────────────────────────────────────────────────

async def send_connection(
    requester_id: str,
    target_id: str,
    message: str | None,
    settings: Settings,
) -> dict:
    """Create a PENDING connection request.  409 if already exists."""
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO contracts.b2b_connections (requester_id, target_id, message)
            VALUES ($1, $2, $3)
            ON CONFLICT (requester_id, target_id) DO NOTHING
            RETURNING *
            """,
            requester_id, target_id, message,
        )
        if row is None:
            # Already exists — return current state
            row = await conn.fetchrow(
                "SELECT * FROM contracts.b2b_connections WHERE requester_id=$1 AND target_id=$2",
                requester_id, target_id,
            )
        return _to_dict(row) if row else {}
    finally:
        await conn.close()


async def respond_connection(
    connection_id: str,
    responder_id: str,
    accept: bool,
    settings: Settings,
) -> dict | None:
    """Accept or reject an incoming connection.  Only the target_id may respond."""
    new_status = "ACCEPTED" if accept else "REJECTED"
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        row = await conn.fetchrow(
            """
            UPDATE contracts.b2b_connections
            SET status=$1, updated_at=now()
            WHERE id=$2 AND target_id=$3 AND status='PENDING'
            RETURNING *
            """,
            new_status, connection_id, responder_id,
        )
        return _to_dict(row) if row else None
    finally:
        await conn.close()


async def get_my_connections(user_id: str, settings: Settings) -> list[dict]:
    """Return outgoing + incoming connections with the other party's company info."""
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        rows = await conn.fetch(
            """
            -- Outgoing: I sent the request
            SELECT
                c.id, c.status, c.message, c.created_at,
                'OUTGOING'  AS direction,
                cp.user_id  AS other_user_id,
                cp.razon_social, cp.nombre_comercial, cp.sector, cp.departamento, cp.ciudad,
                CASE WHEN c.status='ACCEPTED' THEN cp.email_contacto ELSE NULL END AS email,
                CASE WHEN c.status='ACCEPTED' THEN cp.telefono       ELSE NULL END AS telefono
            FROM contracts.b2b_connections c
            JOIN contracts.company_profiles cp ON cp.user_id = c.target_id
            WHERE c.requester_id = $1

            UNION ALL

            -- Incoming: someone sent me a request
            SELECT
                c.id, c.status, c.message, c.created_at,
                'INCOMING'  AS direction,
                cp.user_id  AS other_user_id,
                cp.razon_social, cp.nombre_comercial, cp.sector, cp.departamento, cp.ciudad,
                CASE WHEN c.status='ACCEPTED' THEN cp.email_contacto ELSE NULL END AS email,
                CASE WHEN c.status='ACCEPTED' THEN cp.telefono       ELSE NULL END AS telefono
            FROM contracts.b2b_connections c
            JOIN contracts.company_profiles cp ON cp.user_id = c.requester_id
            WHERE c.target_id = $1

            ORDER BY created_at DESC
            """,
            user_id,
        )
        return [_to_dict(r) for r in rows]
    finally:
        await conn.close()
