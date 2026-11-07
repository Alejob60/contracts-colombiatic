"""
EvaluateBidUseCase — Sprint 5 core feature.

Orchestrates the full AI bid-evaluation pipeline:
1. Fetch SECOP II process details via SODA API
2. Retrieve relevant company document chunks via RAG (cosine similarity)
3. Build a structured evaluation prompt
4. Call Claude Haiku for analysis
5. Persist the result to ``bid_evaluations``

WHY in-memory cosine instead of pgvector <->: the document_chunks table
stores embeddings as ``text`` (JSON-encoded float arrays) because pgvector
extension availability on RDS is not guaranteed at deploy time. Once
confirmed, this should migrate to ``vector(1024)`` with HNSW index and
use ``<=>`` operator for similarity. Until then, pulling chunks into
memory and computing cosine is correct for the expected corpus size
(< 500 chunks per company from ~10 documents).
"""
from __future__ import annotations

import asyncpg
import json
import logging
import math
from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

from app.config import Settings
from app.infrastructure.bedrock_embedding import BedrockEmbeddingService
from app.infrastructure.bedrock_llm import BedrockLlmService, LlmParseError
from app.infrastructure.secop_soda_gateway import SecopSodaGateway

logger = logging.getLogger(__name__)


def _get_pg_url(settings: Settings) -> str:
    """Strip asyncpg driver prefix and search_path for raw asyncpg connection."""
    return (
        settings.DATABASE_URL
        .replace("postgresql+asyncpg://", "postgresql://")
        .split("?")[0]
    )


# ── Output schema (Claude must return this JSON) ─────────────────────────

class RiskItem(BaseModel):
    category: str
    severity: Literal["ALTA", "MEDIA", "BAJA"]
    description: str
    recommendation: str


class QualItem(BaseModel):
    requirement: str
    met: bool
    evidence: str | None = None
    gap: str | None = None


class EvaluationAnalysis(BaseModel):
    """
    Structured analysis output from Claude Haiku.

    WHY match_score 0-100 instead of 0-1: 0-100 is more intuitive for
    the LLM prompt and the frontend display. The DB stores it as 0-1
    (match_score / 100) for consistency with other score fields.
    """
    summary: str
    match_score: float = Field(ge=0, le=100)
    feasibility: Literal["VIABLE", "PARCIAL", "NO_VIABLE", "DATOS_INSUFICIENTES"]
    strengths: list[str]
    weaknesses: list[str]
    risk_items: list[RiskItem]
    qualification_checklist: list[QualItem]
    action_plan: list[str]
    estimated_competition: Literal["BAJA", "MEDIA", "ALTA"]


# ── RAG retrieval ─────────────────────────────────────────────────────────

# Top-K chunks to include in the evaluation prompt context window
_RAG_TOP_K = 8

# Truncation limit for process description in the embedding query
_EMBED_QUERY_MAX_CHARS = 500

_NO_DOCS_FALLBACK = "(No hay documentos corporativos indexados)"


def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """Compute cosine similarity between two equal-length float vectors."""
    dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot_product / (norm_a * norm_b)


async def _retrieve_rag_context(
    query: str,
    company_id: str,
    settings: Settings,
    top_k: int = _RAG_TOP_K,
) -> str:
    """
    Embed *query* with Titan v2 and retrieve the top-k most similar
    document chunks belonging to *company_id*.
    """
    embedder = BedrockEmbeddingService(settings)
    try:
        query_embedding = embedder.embed(query[:_EMBED_QUERY_MAX_CHARS])
    except Exception as embed_exc:
        logger.warning("RAG embed failed — proceeding without docs: %s", embed_exc)
        return _NO_DOCS_FALLBACK

    conn = await asyncpg.connect(
        _get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    try:
        rows = await conn.fetch(
            """
            SELECT chunk_text, embedding::text, page_num
            FROM document_chunks
            WHERE company_id = $1 AND embedding IS NOT NULL
            """,
            company_id,
        )
    finally:
        await conn.close()

    if not rows:
        return _NO_DOCS_FALLBACK

    scored_chunks: list[tuple[float, str]] = []
    for row in rows:
        try:
            stored_embedding = json.loads(row["embedding"])
            similarity = _cosine_similarity(query_embedding, stored_embedding)
            scored_chunks.append((similarity, row["chunk_text"]))
        except (json.JSONDecodeError, TypeError, KeyError):
            continue

    scored_chunks.sort(key=lambda pair: pair[0], reverse=True)
    top_chunks = [text for _, text in scored_chunks[:top_k]]
    return "\n\n---\n\n".join(top_chunks) if top_chunks else _NO_DOCS_FALLBACK


# ── Prompt construction ───────────────────────────────────────────────────

_SYSTEM_PROMPT = """Eres un experto en contratación pública colombiana. Analiza si una empresa puede ganar una licitación de SECOP II.
Responde ÚNICAMENTE con un objeto JSON válido sin texto adicional ni markdown.
El JSON debe seguir exactamente el esquema especificado."""

_USER_PROMPT_TEMPLATE = """Analiza si la empresa puede ganar esta licitación.

=== LICITACIÓN SECOP II ===
{process_desc}

=== PERFIL DE LA EMPRESA ===
{company_info}

=== DOCUMENTOS CORPORATIVOS (RUP, EEFF, CERTIFICADOS) ===
{rag_context}

Responde con este JSON exacto (sin texto antes ni después):
{{
  "summary": "Resumen ejecutivo de 2-3 oraciones",
  "match_score": <número 0-100>,
  "feasibility": "VIABLE|PARCIAL|NO_VIABLE|DATOS_INSUFICIENTES",
  "strengths": ["fortaleza1", "fortaleza2"],
  "weaknesses": ["debilidad1", "debilidad2"],
  "risk_items": [
    {{"category": "Categoría", "severity": "ALTA|MEDIA|BAJA", "description": "...", "recommendation": "..."}}
  ],
  "qualification_checklist": [
    {{"requirement": "Requisito del pliego", "met": true|false, "evidence": "de qué documento", "gap": "qué falta si no cumple"}}
  ],
  "action_plan": ["Paso 1 concreto", "Paso 2 concreto"],
  "estimated_competition": "BAJA|MEDIA|ALTA"
}}"""

# Truncation limit for process description inside the prompt
_PROCESS_DESC_MAX_CHARS = 2000


def _build_process_description(process: object) -> str:
    """Format a SecopProcess into a human-readable block for the prompt."""
    precio_str = f"${process.precio_base:,.0f} COP" if process.precio_base else "No especificado"
    desc_text = (process.descripcion or "")[:_PROCESS_DESC_MAX_CHARS]
    return f"""PROCESO: {process.nombre_del_procedimiento}
ENTIDAD: {process.entidad} ({process.ciudad_entidad}, {process.departamento_entidad})
PRESUPUESTO: {precio_str}
MODALIDAD: {process.modalidad}
TIPO: {process.tipo_contrato}
ESTADO: {process.estado}
CÓDIGO UNSPSC: {process.codigo_unspsc}
DESCRIPCIÓN: {desc_text}""".strip()


def _build_company_info(company_row: asyncpg.Record | None) -> str:
    """Format a company_profiles row into a prompt block."""
    if not company_row:
        return "(Perfil no configurado)"

    unspsc_codes = company_row.get("unspsc_codes") or []
    unspsc_str = ", ".join(unspsc_codes) if unspsc_codes else "No especificados"
    capacidad = company_row.get("capacidad_k")
    capacidad_str = f"{capacidad} SMMLV" if capacidad else "No especificada"

    return f"""EMPRESA: {company_row['razon_social']} (NIT: {company_row['nit']})
SECTOR: {company_row.get('sector', '') or ''}
TAMAÑO: {company_row.get('tamano', '') or ''}
CÓDIGOS UNSPSC: {unspsc_str}
CAPACIDAD K: {capacidad_str}""".strip()


# ── Main use case ─────────────────────────────────────────────────────────

# Score divisor: LLM outputs 0-100, DB stores 0.0-1.0
_SCORE_DIVISOR = 100.0


async def evaluate_bid(
    user_id: str,
    company_id: str,
    proceso_id: str,
    settings: Settings,
    gateway: SecopSodaGateway,
) -> dict:
    """
    Full bid evaluation pipeline.

    Returns a dict suitable for JSON serialisation. Idempotent: if a
    COMPLETED evaluation already exists for (user_id, proceso_id), the
    cached result is returned without re-running the analysis.
    """
    conn = await asyncpg.connect(
        _get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    eval_id: str | None = None
    try:
        # ── Check for existing completed evaluation ──────────────────
        existing = await conn.fetchrow(
            """
            SELECT * FROM bid_evaluations
            WHERE user_id = $1 AND proceso_id = $2
            ORDER BY created_at DESC LIMIT 1
            """,
            user_id,
            proceso_id,
        )
        if existing and existing["status"] == "COMPLETED":
            return _evaluation_row_to_dict(existing)

        # ── Create ANALYZING record ──────────────────────────────────
        eval_row = await conn.fetchrow(
            """
            INSERT INTO bid_evaluations (user_id, company_id, proceso_id, status)
            VALUES ($1, $2, $3, 'ANALYZING')
            RETURNING *
            """,
            user_id,
            company_id,
            proceso_id,
        )
        if eval_row is None:
            raise RuntimeError("INSERT INTO bid_evaluations returned no row")
        eval_id = str(eval_row["id"])

        # ── 1. Fetch SECOP process ───────────────────────────────────
        process = await gateway.get_process(proceso_id)
        if not process:
            await conn.execute(
                """
                UPDATE bid_evaluations
                SET status = 'FAILED', analysis_json = $1
                WHERE id = $2
                """,
                json.dumps({"error": "Proceso no encontrado en SECOP II"}),
                eval_id,
            )
            return {"id": eval_id, "status": "FAILED", "error": "Proceso no encontrado"}

        process_desc = _build_process_description(process)

        # ── 2. Retrieve company context via RAG (skip if no profile) ─────
        rag_context = await _retrieve_rag_context(
            process_desc[:_EMBED_QUERY_MAX_CHARS],
            company_id or "",   # empty string = no docs, graceful fallback
            settings,
        ) if company_id else "(No hay perfil de empresa configurado — sube tu RUP y documentos para análisis personalizado)"

        # ── 3. Get company profile ───────────────────────────────────
        company_row = await conn.fetchrow(
            "SELECT * FROM company_profiles WHERE id = $1",
            company_id,
        ) if company_id else None
        company_info = _build_company_info(company_row)

        # ── 4. Build prompt and call Claude Haiku ────────────────────
        user_prompt = _USER_PROMPT_TEMPLATE.format(
            process_desc=process_desc,
            company_info=company_info,
            rag_context=rag_context,
        )

        llm = BedrockLlmService(settings)
        try:
            # Run synchronous boto3 call in a thread to avoid blocking the event loop
            analysis = await asyncio.to_thread(
                llm.generate_structured,
                _SYSTEM_PROMPT,
                user_prompt,
                EvaluationAnalysis,
            )
            analysis_dict = analysis.model_dump()
        except (LlmParseError, Exception) as llm_exc:
            logger.error("LLM evaluation failed for proceso %s: %s", proceso_id, llm_exc)
            await conn.execute(
                """
                UPDATE bid_evaluations
                SET status = 'FAILED', analysis_json = $1
                WHERE id = $2
                """,
                json.dumps({"error": str(llm_exc)[:500]}),
                eval_id,
            )
            return {"id": eval_id, "status": "FAILED", "error": "Error en el análisis IA"}

        # ── 5. Persist result ────────────────────────────────────────
        await conn.execute(
            """
            UPDATE bid_evaluations
            SET match_score = $1,
                feasibility = $2,
                status = 'COMPLETED',
                analysis_json = $3,
                updated_at = now()
            WHERE id = $4
            """,
            analysis.match_score / _SCORE_DIVISOR,
            analysis.feasibility,
            json.dumps(analysis_dict, ensure_ascii=False),
            eval_id,
        )

        return {
            "id": eval_id,
            "proceso_id": proceso_id,
            "status": "COMPLETED",
            "match_score": analysis.match_score,
            "feasibility": analysis.feasibility,
            "analysis": analysis_dict,
        }

    except Exception as exc:
        logger.error("evaluate_bid failed for proceso %s: %s", proceso_id, exc)
        if eval_id:
            try:
                await conn.execute(
                    "UPDATE bid_evaluations SET status = 'FAILED' WHERE id = $1",
                    eval_id,
                )
            except Exception as cleanup_exc:
                logger.warning("Failed to mark evaluation as FAILED: %s", cleanup_exc)
        raise
    finally:
        await conn.close()


def _evaluation_row_to_dict(row: asyncpg.Record) -> dict:
    """Convert a bid_evaluations row to a JSON-serializable dict."""
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
            result[key] = val
        else:
            result[key] = val
    return result
