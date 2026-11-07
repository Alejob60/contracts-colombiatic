"""
Analytics use case — Sprint 7.

Returns a consolidated dashboard payload for a single user by running
parallel asyncpg queries against the contracts schema.  JSON parsing of
``bid_evaluations.analysis_json`` happens in Python (column is TEXT, not
JSONB) to avoid casting overhead on the DB.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

import asyncpg

from app.config import Settings
from app.application.manage_company import get_pg_url

logger = logging.getLogger(__name__)


def _to_float(v) -> float:
    try:
        return float(Decimal(str(v)))
    except Exception:
        return 0.0


def _row_to_dict(row) -> dict:
    out = {}
    for k, v in dict(row).items():
        if isinstance(v, UUID):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, date):
            out[k] = str(v)
        elif isinstance(v, Decimal):
            out[k] = float(v)
        else:
            out[k] = v
    return out


# ── SQL helpers ───────────────────────────────────────────────────────────

async def _count(conn: asyncpg.Connection, sql: str, *args) -> int:
    val = await conn.fetchval(sql, *args)
    return int(val or 0)


# ── Main query ────────────────────────────────────────────────────────────

async def get_user_analytics(user_id: str, settings: Settings) -> dict:
    pg_url = get_pg_url(settings)
    conn = await asyncpg.connect(pg_url, server_settings={"search_path": "contracts,public"})
    try:
        # ── Activity counts (sequential — asyncpg connections are not
        #    safe for concurrent use from multiple coroutines) ─────────
        saved_count  = await _count(conn,
            "SELECT COUNT(*) FROM contracts.saved_processes WHERE user_id=$1", user_id)
        eval_count   = await _count(conn,
            "SELECT COUNT(*) FROM contracts.bid_evaluations WHERE user_id=$1 AND status='COMPLETED'", user_id)
        alerts_count = await _count(conn,
            "SELECT COUNT(*) FROM contracts.alert_events WHERE user_id=$1", user_id)
        doc_count = await _count(conn, """
            SELECT COUNT(*) FROM contracts.company_documents
            WHERE company_id IN (
                SELECT id FROM contracts.company_profiles WHERE user_id=$1
            )
        """, user_id)

        # ── Evaluation breakdown ──────────────────────────────────────
        eval_rows = await conn.fetch("""
            SELECT proceso_id, analysis_json, created_at
            FROM contracts.bid_evaluations
            WHERE user_id=$1 AND status='COMPLETED'
            ORDER BY created_at DESC
            LIMIT 50
        """, user_id)

        scores: list[int] = []
        feasibility_counts: dict[str, int] = {
            "VIABLE": 0, "PARCIAL": 0, "NO_VIABLE": 0, "DATOS_INSUFICIENTES": 0,
        }
        risk_counts: dict[str, int] = {"ALTA": 0, "MEDIA": 0, "BAJA": 0}
        recent_evals: list[dict] = []

        for row in eval_rows:
            try:
                analysis = json.loads(row["analysis_json"] or "{}")
            except (json.JSONDecodeError, TypeError):
                analysis = {}

            score = int(analysis.get("match_score") or 0)
            scores.append(score)

            feasibility = analysis.get("feasibility") or "DATOS_INSUFICIENTES"
            feasibility_counts[feasibility] = feasibility_counts.get(feasibility, 0) + 1

            for risk in (analysis.get("risks") or []):
                sev = risk.get("severity") or "BAJA"
                risk_counts[sev] = risk_counts.get(sev, 0) + 1

            if len(recent_evals) < 5:
                recent_evals.append({
                    "proceso_id":  row["proceso_id"],
                    "match_score": score,
                    "feasibility": feasibility,
                    "created_at":  row["created_at"].isoformat(),
                })

        avg_score = round(sum(scores) / len(scores)) if scores else 0

        # ── Saved: by departamento ────────────────────────────────────
        dept_rows = await conn.fetch("""
            SELECT
                COALESCE(NULLIF(TRIM(departamento), ''), 'Sin departamento') AS dep,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(precio_base), 0) AS total_budget
            FROM contracts.saved_processes
            WHERE user_id=$1
            GROUP BY dep
            ORDER BY cnt DESC
            LIMIT 8
        """, user_id)

        # ── Saved: by estado ─────────────────────────────────────────
        estado_rows = await conn.fetch("""
            SELECT
                COALESCE(NULLIF(TRIM(estado), ''), 'Sin estado') AS estado,
                COUNT(*)::int AS cnt
            FROM contracts.saved_processes
            WHERE user_id=$1
            GROUP BY estado
            ORDER BY cnt DESC
        """, user_id)

        # ── Top 5 by budget ───────────────────────────────────────────
        top_rows = await conn.fetch("""
            SELECT nombre_proceso, entidad, precio_base, departamento, ciudad
            FROM contracts.saved_processes
            WHERE user_id=$1 AND precio_base IS NOT NULL
            ORDER BY precio_base DESC
            LIMIT 5
        """, user_id)

        # ── 30-day activity timeline (saved processes) ────────────────
        timeline_rows = await conn.fetch("""
            SELECT
                DATE(created_at AT TIME ZONE 'America/Bogota') AS day,
                COUNT(*)::int AS cnt
            FROM contracts.saved_processes
            WHERE user_id=$1
              AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY day
            ORDER BY day
        """, user_id)

    finally:
        await conn.close()

    return {
        "activity": {
            "saved_count":  saved_count,
            "eval_count":   eval_count,
            "doc_count":    doc_count,
            "alerts_sent":  alerts_count,
        },
        "evaluations": {
            "avg_score":        avg_score,
            "total":            len(scores),
            "by_feasibility":   feasibility_counts,
            "by_risk_severity": risk_counts,
            "recent":           recent_evals,
        },
        "saved_by_departamento": [
            {
                "departamento":  r["dep"],
                "count":         r["cnt"],
                "total_budget":  _to_float(r["total_budget"]),
            }
            for r in dept_rows
        ],
        "saved_by_estado": [
            {"estado": r["estado"], "count": r["cnt"]}
            for r in estado_rows
        ],
        "top_budget": [
            {
                "nombre_proceso": r["nombre_proceso"],
                "entidad":        r["entidad"],
                "precio_base":    _to_float(r["precio_base"]),
                "departamento":   r["departamento"],
                "ciudad":         r["ciudad"],
            }
            for r in top_rows
        ],
        "timeline": [
            {"date": str(r["day"]), "count": r["cnt"]}
            for r in timeline_rows
        ],
    }
