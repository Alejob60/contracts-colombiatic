"""
AI bid-evaluation endpoints — Sprint 5.

Endpoints:
  POST /api/v1/evaluations/analyze  — run AI evaluation (PRO only)
  GET  /api/v1/evaluations          — list user's evaluations (PRO only)
  GET  /api/v1/evaluations/{id}     — get single evaluation (PRO only)

WHY a separate ``/analyze`` POST instead of bare ``POST /``: the action
is expensive (5-15 s Bedrock call + RAG retrieval) and idempotent (same
user + proceso_id returns the cached result). A verb path communicates
the intent better than a bare resource POST, and clients can distinguish
"start analysis" from potential future "create draft evaluation" flows.
"""
from __future__ import annotations

import asyncpg
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.application.evaluate_bid import evaluate_bid
from app.application.manage_company import get_pg_url
from app.config import Settings
from app.dependencies import get_settings, require_pro

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/evaluations", tags=["evaluations"])


# ── Request models ─────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    """Body for POST /analyze — only the SECOP process ID is required."""
    proceso_id: str


# ── Helpers ────────────────────────────────────────────────────────────────

def _user_id(user: dict[str, Any]) -> str:
    """Extract user ID from JWT payload, raising 401 if absent."""
    uid = str(user.get("sub") or user.get("userId") or "")
    if not uid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No user ID in token",
        )
    return uid


async def _get_company_id(user_id: str, settings: Settings) -> str | None:
    """
    Look up the company_profiles row for *user_id*.
    Returns None (not an error) when no profile exists — the evaluation
    will proceed without RAG context from company documents.
    """
    conn = await asyncpg.connect(
        get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    try:
        row = await conn.fetchrow(
            "SELECT id FROM company_profiles WHERE user_id = $1",
            user_id,
        )
    finally:
        await conn.close()

    return str(row["id"]) if row else None


def _row_to_json(row: asyncpg.Record) -> dict:
    """Convert an asyncpg Record to a JSON-safe dict."""
    from datetime import datetime
    from decimal import Decimal
    from uuid import UUID

    result: dict = {}
    for key, val in dict(row).items():
        if isinstance(val, UUID):
            result[key] = str(val)
        elif isinstance(val, datetime):
            result[key] = val.isoformat()
        elif isinstance(val, Decimal):
            result[key] = float(val)
        elif key == "analysis_json" and isinstance(val, str):
            try:
                result["analysis"] = json.loads(val)
            except json.JSONDecodeError:
                result["analysis"] = None
        else:
            result[key] = val
    return result


# ── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/analyze")
async def analyze_bid(
    body: AnalyzeRequest,
    request: Request,
    user: dict[str, Any] = Depends(require_pro),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    """
    Start an AI evaluation of the user's company against a SECOP process.

    Sprint 13: If the ARQ pool is available, enqueues the job and returns
    202 immediately. The evaluation runs in a separate worker process.
    Frontend polls GET /evaluations/{id} for the COMPLETED status.

    Fallback: if ARQ is not available, runs synchronously (original behaviour).
    """
    uid = _user_id(user)
    company_id = await _get_company_id(uid, settings)
    gateway = request.app.state.secop_gateway
    arq_pool = getattr(request.app.state, "arq_pool", None)

    # ── Fast path: enqueue to ARQ worker ──────────────────────────────
    if arq_pool:
        # Create the ANALYZING record synchronously so frontend can poll
        conn = await asyncpg.connect(
            get_pg_url(settings), server_settings={"search_path": "contracts,public"}
        )
        try:
            # Check for cached COMPLETED result first
            existing = await conn.fetchrow(
                """SELECT * FROM bid_evaluations
                   WHERE user_id=$1 AND proceso_id=$2 AND status='COMPLETED'
                   ORDER BY created_at DESC LIMIT 1""",
                uid, body.proceso_id,
            )
            if existing:
                return JSONResponse(content=_row_to_json(existing))

            # Create ANALYZING record
            eval_row = await conn.fetchrow(
                """INSERT INTO bid_evaluations (user_id, company_id, proceso_id, status)
                   VALUES ($1, $2, $3, 'ANALYZING') RETURNING *""",
                uid, company_id, body.proceso_id,
            )
        finally:
            await conn.close()

        eval_id = str(eval_row["id"])

        # Enqueue to ARQ — returns immediately
        await arq_pool.enqueue_job(
            "task_evaluate_bid",
            uid, company_id, body.proceso_id,
            _job_id=eval_id,  # use eval_id as ARQ job ID for tracking
        )
        logger.info("Evaluation queued via ARQ: eval=%s proceso=%s", eval_id[:8], body.proceso_id)
        return JSONResponse(
            status_code=202,
            content={**_row_to_json(eval_row), "queued": True},
        )

    # ── Fallback: run synchronously (no ARQ worker running) ───────────
    logger.info("ARQ not available — running evaluation synchronously")
    try:
        result = await evaluate_bid(
            user_id=uid,
            company_id=company_id,
            proceso_id=body.proceso_id,
            settings=settings,
            gateway=gateway,
        )
        return JSONResponse(content=result)
    except Exception as exc:
        logger.error("Evaluation endpoint failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno al evaluar la licitación.",
        ) from exc


@router.get("/")
async def list_evaluations(
    user: dict[str, Any] = Depends(require_pro),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    """List all evaluations for the authenticated user, newest first."""
    uid = _user_id(user)
    conn = await asyncpg.connect(
        get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    try:
        rows = await conn.fetch(
            """
            SELECT id::text, proceso_id, match_score, feasibility,
                   status, analysis_json, created_at
            FROM bid_evaluations
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            uid,
        )
        evaluations = [_row_to_json(r) for r in rows]
    finally:
        await conn.close()

    return JSONResponse(content={
        "evaluations": evaluations,
        "total": len(evaluations),
    })


@router.get("/{evaluation_id}")
async def get_evaluation(
    evaluation_id: str,
    user: dict[str, Any] = Depends(require_pro),
    settings: Settings = Depends(get_settings),
) -> JSONResponse:
    """Retrieve a single evaluation by ID. Must belong to the authenticated user."""
    uid = _user_id(user)
    conn = await asyncpg.connect(
        get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    try:
        row = await conn.fetchrow(
            """
            SELECT * FROM bid_evaluations
            WHERE id = $1 AND user_id = $2
            """,
            evaluation_id,
            uid,
        )
    finally:
        await conn.close()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Evaluación no encontrada.",
        )

    return JSONResponse(content=_row_to_json(row))
