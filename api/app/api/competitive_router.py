"""
Competitive intelligence endpoints — Sprint 15A.

Shows aggregate competition data for a SECOP process within the
ColombiaTIC platform.  Privacy rules:
  - Never reveal which specific companies are competing (unless B2B connected)
  - Show aggregate counts + intensity level (LOW/MEDIUM/HIGH)
  - B2B-connected companies with ACCEPTED status CAN see each other's interest
  - Average match scores are shown only when ≥ 3 evaluations exist (k-anonymity)

GET /api/v1/competition/{proceso_id}
"""
from __future__ import annotations

import logging

import asyncpg
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.application.manage_company import get_pg_url
from app.config import Settings
from app.dependencies import get_current_user, get_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/competition", tags=["competition"])


def _intensity(n: int) -> str:
    if n == 0:   return "SIN_DATOS"
    if n <= 2:   return "BAJA"
    if n <= 5:   return "MEDIA"
    if n <= 10:  return "ALTA"
    return "MUY_ALTA"


def _intensity_label(n: int) -> str:
    return {
        "SIN_DATOS": "Sin datos suficientes",
        "BAJA":      "Competencia baja (≤ 2 empresas)",
        "MEDIA":     "Competencia media (3–5 empresas)",
        "ALTA":      "Competencia alta (6–10 empresas)",
        "MUY_ALTA":  "Muy alta competencia (10+ empresas)",
    }.get(_intensity(n), "")


@router.get("/{proceso_id}")
async def get_competition(
    proceso_id: str,
    user: dict = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
):
    """
    Return competition intelligence for a SECOP process.

    Requires authentication (any plan — this is a network effect feature
    that rewards having an account, not a PRO gate).
    """
    user_id = str(user.get("sub") or user.get("userId") or "")
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        # ── Aggregate evaluations (count + avg score) ─────────────────
        eval_row = await conn.fetchrow(
            """
            SELECT
                COUNT(DISTINCT user_id)::int          AS evaluators,
                AVG(match_score)                      AS avg_score,
                COUNT(CASE WHEN match_score >= 70 THEN 1 END)::int AS high_match
            FROM contracts.bid_evaluations
            WHERE proceso_id = $1 AND status = 'COMPLETED'
            """,
            proceso_id,
        )

        # ── Aggregate saved processes ──────────────────────────────────
        savers = await conn.fetchval(
            "SELECT COUNT(DISTINCT user_id)::int FROM contracts.saved_processes WHERE proceso_id=$1",
            proceso_id,
        ) or 0

        # ── B2B connected companies also evaluating (with consent) ─────
        # Only surfaces companies that:
        # 1. Have an ACCEPTED B2B connection with the viewer
        # 2. Have a PUBLIC B2B profile (is_public=true) → they opted in
        # 3. Also evaluated this process
        b2b_competitors = await conn.fetch(
            """
            SELECT
                cp.razon_social,
                cp.sector,
                cp.departamento,
                bp.bio,
                be.match_score
            FROM contracts.bid_evaluations be
            JOIN contracts.company_profiles cp ON cp.user_id = be.user_id
            JOIN contracts.b2b_profiles bp ON bp.user_id = be.user_id AND bp.is_public = true
            WHERE be.proceso_id = $1
              AND be.status = 'COMPLETED'
              AND be.user_id != $2
              AND be.user_id IN (
                  SELECT CASE
                      WHEN c.requester_id = $2 THEN c.target_id
                      ELSE c.requester_id
                  END
                  FROM contracts.b2b_connections c
                  WHERE (c.requester_id = $2 OR c.target_id = $2)
                    AND c.status = 'ACCEPTED'
              )
            ORDER BY be.match_score DESC NULLS LAST
            LIMIT 10
            """,
            proceso_id, user_id,
        )

        # ── User's own evaluation on this process ─────────────────────
        own_eval = await conn.fetchrow(
            """
            SELECT match_score, feasibility, status
            FROM contracts.bid_evaluations
            WHERE proceso_id = $1 AND user_id = $2
            ORDER BY created_at DESC LIMIT 1
            """,
            proceso_id, user_id,
        )

    finally:
        await conn.close()

    n_evals = eval_row["evaluators"] or 0
    avg_score = float(eval_row["avg_score"]) if eval_row["avg_score"] else None
    high_match = eval_row["high_match"] or 0

    # Apply k-anonymity: only show avg score if ≥ 3 evaluations
    visible_avg = round(avg_score, 1) if (avg_score and n_evals >= 3) else None

    competitors = [
        {
            "razon_social": r["razon_social"],
            "sector":       r["sector"],
            "departamento": r["departamento"],
            "bio":          (r["bio"] or "")[:120],
            "match_score":  float(r["match_score"]) if r["match_score"] else None,
        }
        for r in b2b_competitors
    ]

    intensity = _intensity(n_evals)

    return {
        "proceso_id":        proceso_id,
        "evaluators_count":  n_evals,
        "savers_count":      savers or 0,
        "intensity":         intensity,
        "intensity_label":   _intensity_label(n_evals),
        "avg_match_score":   visible_avg,
        "high_match_count":  high_match if n_evals >= 3 else None,
        "b2b_competitors":   competitors,
        "own_evaluation": {
            "match_score": float(own_eval["match_score"]) if own_eval and own_eval["match_score"] else None,
            "feasibility": own_eval["feasibility"] if own_eval else None,
            "status":      own_eval["status"] if own_eval else None,
        } if own_eval else None,
        "recommendation": _recommendation(intensity, visible_avg, own_eval),
    }


def _recommendation(intensity: str, avg_score: float | None, own_eval) -> str:
    """Generate a strategic recommendation based on competition data."""
    if intensity == "SIN_DATOS":
        return "Sé el primero en evaluar este proceso en la plataforma."

    if intensity in ("MUY_ALTA",) and avg_score and avg_score >= 75:
        return "Alta competencia con empresas bien calificadas. Evalúa si es estratégico presentarte."

    if intensity == "BAJA":
        return "Pocos competidores detectados. Oportunidad favorable si cumples los requisitos."

    if own_eval and own_eval["match_score"] and float(own_eval["match_score"]) >= 70:
        return "Tu score es competitivo. Continúa preparando tu propuesta."

    return "Competencia moderada. El diferenciador será la calidad técnica de tu propuesta."
