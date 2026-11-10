"""
SECOP Cache Sync Worker — Sprint 10A.

Syncs SECOP II processes from datos.gov.co (SODA) into a local
PostgreSQL table every 2 hours, reducing search freshness from
2-7 days (SODA lag) to < 2 hours.

Two sync strategies run on each cycle:
  A) Date-based: fetch processes published in last 3h
     → catches most new processes
  B) Count-based: detect if SODA total count increased
     → catches null-dated recent records (SODA exports them without dates)

Initial warmup (first run): syncs last 180 days in batches.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

import asyncpg

if TYPE_CHECKING:
    from app.config import Settings
    from app.infrastructure.secop_soda_gateway import SecopSodaGateway
    from app.domain.models.secop import SecopProcess

logger = logging.getLogger(__name__)

_WARMUP_DAYS   = 180   # initial warmup: last N days
_WARMUP_BATCH  = 100   # records per SODA call during warmup
_SYNC_LIMIT    = 100   # records per cycle (steady-state)
_MIN_WARM_SIZE = 5_000 # cache is "warm" when it has this many records


# ── Upsert helpers ────────────────────────────────────────────────────────

def _proc_to_row(proc: "SecopProcess") -> dict:
    return {
        "proceso_id":           proc.proceso_id,
        "nombre":               proc.nombre_del_procedimiento or "",
        "entidad":              proc.entidad or "",
        "nit_entidad":          proc.nit_entidad or None,
        "departamento":         proc.departamento_entidad or None,
        "ciudad":               proc.ciudad_entidad or None,
        "modalidad":            proc.modalidad or None,
        "tipo_contrato":        proc.tipo_contrato or None,
        "estado":               proc.estado or None,
        "precio_base":          float(proc.precio_base) if proc.precio_base else None,
        "unspsc":               proc.codigo_unspsc or None,
        "url_proceso":          proc.url_proceso or None,
        "fecha_pub":            proc.fecha_publicacion,
        "proveedor_adjudicado": proc.proveedor_adjudicado or None,
        "fecha_cierre":         proc.fecha_cierre or None,
    }


async def _upsert_processes(
    conn: asyncpg.Connection,
    processes: list["SecopProcess"],
) -> int:
    if not processes:
        return 0

    rows = [_proc_to_row(p) for p in processes]
    upserted = 0

    for row in rows:
        try:
            await conn.execute(
                """
                INSERT INTO contracts.secop_processes_cache
                  (proceso_id, nombre, entidad, nit_entidad, departamento, ciudad,
                   modalidad, tipo_contrato, estado, precio_base, unspsc,
                   url_proceso, fecha_pub, proveedor_adjudicado, fecha_cierre,
                   soda_synced_at)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
                ON CONFLICT (proceso_id) DO UPDATE SET
                  nombre              = EXCLUDED.nombre,
                  entidad             = EXCLUDED.entidad,
                  nit_entidad         = EXCLUDED.nit_entidad,
                  departamento        = EXCLUDED.departamento,
                  ciudad              = EXCLUDED.ciudad,
                  modalidad           = EXCLUDED.modalidad,
                  tipo_contrato       = EXCLUDED.tipo_contrato,
                  estado              = EXCLUDED.estado,
                  precio_base         = EXCLUDED.precio_base,
                  unspsc              = EXCLUDED.unspsc,
                  url_proceso         = EXCLUDED.url_proceso,
                  fecha_pub           = EXCLUDED.fecha_pub,
                  proveedor_adjudicado= EXCLUDED.proveedor_adjudicado,
                  fecha_cierre        = EXCLUDED.fecha_cierre,
                  soda_synced_at      = now()
                """,
                row["proceso_id"], row["nombre"], row["entidad"],
                row["nit_entidad"], row["departamento"], row["ciudad"],
                row["modalidad"], row["tipo_contrato"], row["estado"],
                row["precio_base"], row["unspsc"], row["url_proceso"],
                row["fecha_pub"], row["proveedor_adjudicado"], row["fecha_cierre"],
            )
            upserted += 1
        except Exception as exc:
            logger.debug("Upsert skipped for %s: %s", row["proceso_id"], exc)

    return upserted


# ── Warmup (runs once on first cycle) ────────────────────────────────────

async def _run_warmup(
    conn: asyncpg.Connection,
    gateway: "SecopSodaGateway",
    settings: "Settings",
) -> int:
    """
    Bulk sync of the last WARMUP_DAYS days.
    Runs in batches to avoid SODA rate limits.
    """
    from app.domain.models.secop import SecopFilter

    logger.info("Cache warmup started — last %d days", _WARMUP_DAYS)
    cutoff = datetime.now(timezone.utc) - timedelta(days=_WARMUP_DAYS)
    total_synced = 0
    offset = 0

    while True:
        result = await gateway.search(SecopFilter(
            fecha_desde=cutoff,
            estado="todos",
            limit=_WARMUP_BATCH,
            offset=offset,
        ))
        if not result.results:
            break

        synced = await _upsert_processes(conn, result.results)
        total_synced += synced
        offset += len(result.results)

        logger.info(
            "Warmup progress: %d/%d synced so far",
            total_synced, result.total,
        )

        # Don't hammer SODA — brief pause between batches
        await asyncio.sleep(1.0)

        if offset >= min(result.total, 50_000):  # cap at 50K for initial warmup
            break

    await conn.execute(
        "UPDATE contracts.secop_sync_state SET warmup_done=true WHERE id=1"
    )
    logger.info("Cache warmup done: %d processes synced", total_synced)
    return total_synced


# ── Steady-state sync cycle ───────────────────────────────────────────────

async def sync_cycle(
    settings: "Settings",
    gateway: "SecopSodaGateway",
) -> int:
    """
    One incremental sync cycle. Returns number of new/updated processes.
    Called every 30min via ARQ cron.

    Smart sync: checks Socrata metadata first. If the government hasn't
    updated the dataset since our last sync, skips the expensive SODA calls.
    Government update pattern: once daily at ~13:30 UTC (8:30 AM COT).
    """
    import asyncio as _asyncio
    from app.domain.models.secop import SecopFilter
    from app.application.manage_company import get_pg_url
    from app.infrastructure.soda_metadata import get_soda_last_updated

    conn = await asyncpg.connect(
        get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    try:
        state = await conn.fetchrow(
            "SELECT * FROM contracts.secop_sync_state WHERE id=1"
        )

        # ── Run warmup on first cycle ──────────────────────────────────
        if not state or not state["warmup_done"]:
            synced = await _run_warmup(conn, gateway, settings)
            cache_total = await conn.fetchval(
                "SELECT COUNT(*) FROM contracts.secop_processes_cache"
            )
            await conn.execute(
                """UPDATE contracts.secop_sync_state
                   SET last_synced_at=now(), last_fetch_rows=$1,
                       cache_total=$2, warmup_done=true WHERE id=1""",
                synced, cache_total,
            )
            return synced

        # ── Smart sync: check if government actually updated ──────────
        # The Socrata metadata endpoint tells us exactly when datos.gov.co
        # last updated the SECOP dataset. If it hasn't changed since our
        # last sync, skip all the expensive SODA API calls.
        gov_last_updated = None
        try:
            import asyncio as _asyncio
            gov_meta = await _asyncio.to_thread(get_soda_last_updated)
            gov_last_updated = gov_meta.get("rows_updated_at")
            logger.info(
                "Govt dataset last updated: %s (lag=%.1fh)",
                gov_meta.get("last_updated_display"), gov_meta.get("lag_hours"),
            )

            # Store government update time for UI display
            await conn.execute(
                """UPDATE contracts.secop_sync_state
                   SET last_soda_count = CASE WHEN $1 IS NOT NULL THEN $1 ELSE last_soda_count END
                   WHERE id=1""",
                gov_meta.get("row_count"),
            )

            # Skip sync if government hasn't updated since we last synced
            last_synced = state["last_synced_at"] if state else None
            if (last_synced and gov_last_updated and
                    gov_last_updated <= last_synced and
                    state and state["warmup_done"]):
                logger.info(
                    "Smart skip: govt updated at %s, last sync at %s — no new data",
                    gov_last_updated.isoformat(), last_synced.isoformat(),
                )
                return 0
        except Exception as meta_exc:
            logger.warning("Metadata check failed, proceeding with sync: %s", meta_exc)

        # ── Strategy A: date-based (last 3 hours + overlap) ───────────
        since = datetime.now(timezone.utc) - timedelta(hours=3)
        result_a = await gateway.search(SecopFilter(
            fecha_desde=since,
            estado="todos",
            limit=_SYNC_LIMIT,
            offset=0,
        ))
        synced_a = await _upsert_processes(conn, result_a.results)
        soda_total = result_a.total

        # ── Strategy B: count-based (catch null-dated new records) ─────
        last_count = state["last_soda_count"] or 0
        synced_b = 0

        if soda_total > last_count:
            new_recs = soda_total - last_count
            if 0 < new_recs <= 500:
                # Fetch most recent records (no date filter)
                result_b = await gateway.search(SecopFilter(
                    estado="todos",
                    limit=min(new_recs + 50, _SYNC_LIMIT),
                    offset=0,
                ))
                synced_b = await _upsert_processes(conn, result_b.results)
                logger.info(
                    "Strategy B: %d new SODA records → %d upserted",
                    new_recs, synced_b,
                )

        # ── Update sync state ──────────────────────────────────────────
        cache_total = await conn.fetchval(
            "SELECT COUNT(*) FROM contracts.secop_processes_cache"
        )
        total_synced = synced_a + synced_b

        await conn.execute(
            """UPDATE contracts.secop_sync_state
               SET last_soda_count=$1, last_synced_at=now(),
                   last_fetch_rows=$2, cache_total=$3
               WHERE id=1""",
            soda_total, total_synced, cache_total,
        )

        logger.info(
            "Cache sync done: A=%d B=%d total_cache=%d",
            synced_a, synced_b, cache_total,
        )
        return total_synced

    finally:
        await conn.close()
