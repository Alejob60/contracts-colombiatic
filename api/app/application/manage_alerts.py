"""
Alert configuration CRUD — Sprint 6.

One alert config per user (UNIQUE user_id). Stores filter preferences
(UNSPSC, department, modalidad, price range, keywords) plus delivery
channels (email / whatsapp).
"""
from __future__ import annotations

import asyncpg

from app.config import Settings
from app.application.manage_company import get_pg_url, _row_to_dict


# ── Config CRUD ───────────────────────────────────────────────────────────

async def get_alert_config(user_id: str, settings: Settings) -> dict | None:
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        row = await conn.fetchrow(
            "SELECT * FROM contracts.alert_configs WHERE user_id=$1", user_id
        )
        return _row_to_dict(row) if row else None
    finally:
        await conn.close()


async def upsert_alert_config(user_id: str, data: dict, settings: Settings) -> dict:
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        row = await conn.fetchrow(
            """
            INSERT INTO contracts.alert_configs
              (user_id, is_active, min_match_score, channels, whatsapp_number, email,
               unspsc_filter, departamento_filter, modalidad_filter,
               precio_min, precio_max, keywords)
            VALUES ($1,$2,$3,$4::text[],$5,$6,$7::text[],$8::text[],$9::text[],$10,$11,$12)
            ON CONFLICT (user_id) DO UPDATE SET
              is_active           = EXCLUDED.is_active,
              min_match_score     = EXCLUDED.min_match_score,
              channels            = EXCLUDED.channels,
              whatsapp_number     = EXCLUDED.whatsapp_number,
              email               = EXCLUDED.email,
              unspsc_filter       = EXCLUDED.unspsc_filter,
              departamento_filter = EXCLUDED.departamento_filter,
              modalidad_filter    = EXCLUDED.modalidad_filter,
              precio_min          = EXCLUDED.precio_min,
              precio_max          = EXCLUDED.precio_max,
              keywords            = EXCLUDED.keywords,
              updated_at          = now()
            RETURNING *
            """,
            user_id,
            data.get("is_active", True),
            data.get("min_match_score", 70),
            data.get("channels", ["email"]),
            data.get("whatsapp_number"),
            data.get("email"),
            data.get("unspsc_filter", []),
            data.get("departamento_filter", []),
            data.get("modalidad_filter", []),
            data.get("precio_min"),
            data.get("precio_max"),
            data.get("keywords"),
        )
        return _row_to_dict(row)
    finally:
        await conn.close()


# ── Events ────────────────────────────────────────────────────────────────

async def get_alert_events(
    user_id: str, settings: Settings, limit: int = 30
) -> list[dict]:
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        rows = await conn.fetch(
            """
            SELECT * FROM contracts.alert_events
            WHERE user_id = $1
            ORDER BY sent_at DESC
            LIMIT $2
            """,
            user_id, limit,
        )
        return [_row_to_dict(r) for r in rows]
    finally:
        await conn.close()


# ── Worker helpers ────────────────────────────────────────────────────────

async def load_active_configs(settings: Settings) -> list[dict]:
    """Load all configs with is_active=true and a delivery channel configured."""
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        rows = await conn.fetch(
            """
            SELECT * FROM contracts.alert_configs
            WHERE is_active = true
              AND array_length(channels, 1) > 0
            """
        )
        return [_row_to_dict(r) for r in rows]
    finally:
        await conn.close()


async def record_alert_event(
    conn: asyncpg.Connection,
    user_id: str,
    proceso_id: str,
    nombre_proceso: str | None,
    entidad: str | None,
    match_score: int,
    channel: str,
) -> bool:
    """
    Insert an alert event if it has not been sent before (UNIQUE guard).

    Returns True when a new row was inserted (email should be sent),
    False when already sent (duplicate — skip).
    """
    row_id = await conn.fetchval(
        """
        INSERT INTO contracts.alert_events
          (user_id, proceso_id, nombre_proceso, entidad, match_score, channel)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, proceso_id, channel) DO NOTHING
        RETURNING id
        """,
        user_id, proceso_id, nombre_proceso, entidad, match_score, channel,
    )
    return row_id is not None
