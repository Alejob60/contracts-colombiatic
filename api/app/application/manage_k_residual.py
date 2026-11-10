"""
Capacidad Residual (K) — Sprint 11A.

The K (Capacidad de Contratación) is a Colombian procurement metric:
  K_total    = maximum contracting capacity in SMMLV (from RUP)
  K_utilizado = sum of active contracts / SMMLV_year
  K_residual  = K_total - K_utilizado

This tells a contractor the maximum additional value they can bid for.
It is a key requirement in many tender habilitación requirements.

Farolic already shows this; we implement it here to close the gap.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

import asyncpg

from app.config import Settings
from app.application.manage_company import get_pg_url

logger = logging.getLogger(__name__)

# Fallback SMMLV when DB value not available
_SMMLV_FALLBACK_COP = Decimal("1423500")  # 2025/2026 Colombia


def _row(row) -> dict:
    out: dict = {}
    for k, v in dict(row).items():
        if isinstance(v, UUID):           out[k] = str(v)
        elif isinstance(v, datetime):     out[k] = v.isoformat()
        elif isinstance(v, date):         out[k] = v.isoformat()
        elif isinstance(v, Decimal):      out[k] = float(v)
        else:                             out[k] = v
    return out


# ── SMMLV ─────────────────────────────────────────────────────────────────

async def get_smmlv(year: int, settings: Settings) -> Decimal:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        val = await conn.fetchval(
            "SELECT valor FROM contracts.smmlv WHERE year = $1", year
        )
        return Decimal(str(val)) if val else _SMMLV_FALLBACK_COP
    finally:
        await conn.close()


# ── K Residual ────────────────────────────────────────────────────────────

async def get_k_residual(user_id: str, settings: Settings) -> dict:
    """
    Calculate Capacidad Residual for the user's company.

    Returns:
      k_total_smmlv:    company's total K in SMMLV (from company_profiles)
      k_utilizado_smmlv: sum of active contracts' K
      k_residual_smmlv:  remaining K
      k_total_cop:       K total in COP
      k_residual_cop:    K residual in COP
      smmlv_year:        year used for SMMLV value
      smmlv_valor:       SMMLV value used (COP)
      active_contracts:  list of active contracts
      semaforo:          VERDE / AMARILLO / ROJO
    """
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        # Company K total
        profile = await conn.fetchrow(
            "SELECT capacidad_k FROM contracts.company_profiles WHERE user_id=$1", user_id
        )
        k_total = Decimal(str(profile["capacidad_k"])) if (profile and profile["capacidad_k"]) else None

        # SMMLV for current year
        year = datetime.now().year
        smmlv_val = await conn.fetchval(
            "SELECT valor FROM contracts.smmlv WHERE year=$1", year
        ) or _SMMLV_FALLBACK_COP
        smmlv = Decimal(str(smmlv_val))

        # Active contracts
        today = date.today()
        active = await conn.fetch(
            """
            SELECT * FROM contracts.active_contracts
            WHERE user_id=$1 AND estado='ACTIVO'
              AND fecha_fin >= $2
            ORDER BY fecha_inicio DESC
            """,
            user_id, today,
        )

        # K utilizado = sum(valores activos) / smmlv
        total_activo_cop = sum(Decimal(str(r["valor_cop"])) for r in active)
        k_utilizado = total_activo_cop / smmlv if smmlv else Decimal("0")

        k_residual = (k_total - k_utilizado) if k_total is not None else None

        # Traffic light
        if k_total is None or k_residual is None:
            semaforo = "SIN_DATOS"
        elif k_residual <= 0:
            semaforo = "ROJO"
        elif k_residual < k_total * Decimal("0.3"):
            semaforo = "AMARILLO"
        else:
            semaforo = "VERDE"

        return {
            "k_total_smmlv":      float(k_total) if k_total else None,
            "k_utilizado_smmlv":  float(k_utilizado),
            "k_residual_smmlv":   float(k_residual) if k_residual is not None else None,
            "k_total_cop":        float(k_total * smmlv) if k_total else None,
            "k_residual_cop":     float(k_residual * smmlv) if k_residual is not None else None,
            "smmlv_year":         year,
            "smmlv_valor":        float(smmlv),
            "active_contracts_count": len(active),
            "total_activo_cop":   float(total_activo_cop),
            "semaforo":           semaforo,
            "semaforo_label": {
                "VERDE":    "Capacidad disponible",
                "AMARILLO": "Capacidad limitada (< 30% libre)",
                "ROJO":     "Capacidad agotada",
                "SIN_DATOS":"Configure su Capacidad K en el perfil",
            }.get(semaforo, semaforo),
        }
    finally:
        await conn.close()


# ── Active contracts CRUD ─────────────────────────────────────────────────

async def list_active_contracts(user_id: str, settings: Settings) -> list[dict]:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        rows = await conn.fetch(
            """
            SELECT * FROM contracts.active_contracts
            WHERE user_id=$1
            ORDER BY estado, fecha_fin DESC
            """, user_id,
        )
        return [_row(r) for r in rows]
    finally:
        await conn.close()


async def upsert_active_contract(user_id: str, data: dict, settings: Settings) -> dict:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        contract_id = data.get("id")
        if contract_id:
            row = await conn.fetchrow(
                """
                UPDATE contracts.active_contracts
                SET entidad=$2, descripcion=$3, valor_cop=$4,
                    fecha_inicio=$5, fecha_fin=$6, estado=$7,
                    proceso_id=$8, updated_at=now()
                WHERE id=$1 AND user_id=$9
                RETURNING *
                """,
                contract_id,
                data["entidad"], data.get("descripcion"),
                data["valor_cop"], data["fecha_inicio"], data["fecha_fin"],
                data.get("estado", "ACTIVO"), data.get("proceso_id"),
                user_id,
            )
        else:
            row = await conn.fetchrow(
                """
                INSERT INTO contracts.active_contracts
                  (user_id, entidad, descripcion, valor_cop,
                   fecha_inicio, fecha_fin, estado, proceso_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING *
                """,
                user_id,
                data["entidad"], data.get("descripcion"),
                data["valor_cop"], data["fecha_inicio"], data["fecha_fin"],
                data.get("estado", "ACTIVO"), data.get("proceso_id"),
            )
        return _row(row) if row else {}
    finally:
        await conn.close()


async def delete_active_contract(contract_id: str, user_id: str, settings: Settings) -> bool:
    conn = await asyncpg.connect(get_pg_url(settings),
                                 server_settings={"search_path": "contracts,public"})
    try:
        result = await conn.execute(
            "DELETE FROM contracts.active_contracts WHERE id=$1 AND user_id=$2",
            contract_id, user_id,
        )
        return result == "DELETE 1"
    finally:
        await conn.close()
