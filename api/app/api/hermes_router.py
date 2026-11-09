"""
Hermes Workspace Assistant — Sprint 15B.

Conversational agent embedded in the Workspace panel.
Context-aware: knows the process, company profile, uploaded documents,
evaluation results and competition data.

POST /api/v1/workspace/{proceso_id}/chat         — send message, get response
GET  /api/v1/workspace/{proceso_id}/chat/history — conversation history
DELETE /api/v1/workspace/{proceso_id}/chat       — clear history

Hermes stays in character as a procurement expert. Never mentions
Claude, Bedrock, AWS or internal infrastructure.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.application.manage_company import get_pg_url
from app.config import Settings
from app.dependencies import get_current_user, get_settings, require_pro

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/workspace", tags=["hermes"])

_HISTORY_TTL = 86_400        # 24 hours per conversation
_MAX_HISTORY = 20            # Max messages kept (cost control)
_MAX_INPUT_CHARS = 1_500     # Max chars per user message


# ── Hermes system prompt ──────────────────────────────────────────────────

def _build_system_prompt(ctx: dict) -> str:
    proceso = ctx.get("proceso", {})
    empresa = ctx.get("empresa", {})
    docs = ctx.get("docs", [])
    eval_data = ctx.get("evaluacion")
    competition = ctx.get("competition")

    doc_list = "\n".join(
        f"  - {d['file_name']} ({d['file_type']})"
        for d in docs[:10]
    ) or "  (Sin documentos subidos aún)"

    eval_section = ""
    if eval_data and eval_data.get("status") == "COMPLETED":
        a = eval_data.get("analysis", {})
        eval_section = f"""
Evaluación IA previa:
  Match Score: {a.get('match_score', '?')}%
  Viabilidad: {a.get('feasibility', '?')}
  Resumen: {str(a.get('summary', ''))[:300]}
"""

    comp_section = ""
    if competition and competition.get("evaluators_count", 0) > 0:
        comp_section = f"""
Competencia en plataforma:
  Empresas evaluando: {competition['evaluators_count']}
  Intensidad: {competition['intensity_label']}
  {f"Score promedio competidores: {competition['avg_match_score']}%" if competition.get('avg_match_score') else ''}
"""

    empresa_name = empresa.get('razon_social') or empresa.get('nombre_comercial') or 'la empresa'
    proceso_title = proceso.get('titulo') or proceso.get('nombre_del_procedimiento') or 'este proceso'

    precio_raw = proceso.get('precio_base')
    try:
        precio_str = f"${int(float(precio_raw)):,}" if precio_raw else 'No especificado'
    except (ValueError, TypeError):
        precio_str = str(precio_raw) if precio_raw else 'No especificado'

    return f"""Eres Hermes, asistente experto en contratación pública colombiana de ColombiaTIC Contracts.
Tu misión: ayudar a {empresa_name} a preparar la mejor propuesta para el proceso de contratación.

PROCESO DE CONTRATACIÓN:
  Título: {proceso_title}
  Entidad: {proceso.get('entidad', 'No especificada')}
  Modalidad: {proceso.get('modalidad', 'No especificada')}
  Presupuesto: {precio_str} COP
  UNSPSC: {', '.join(proceso.get('unspsc_codes', []) or [proceso.get('codigo_unspsc', '')][:1]) or 'No especificado'}
  Descripción: {str(proceso.get('descripcion', ''))[:400] or 'Ver documentos del proceso'}

PERFIL DE LA EMPRESA:
  Empresa: {empresa_name}
  NIT: {empresa.get('nit', 'No registrado')}
  Sector: {empresa.get('sector', 'No especificado')}
  Capacidad K: {empresa.get('capacidad_k', 'No especificada')} SMMLV
  Departamento: {empresa.get('departamento', 'No especificado')}

DOCUMENTOS DEL PROCESO DISPONIBLES:
{doc_list}
{eval_section}
{comp_section}
INSTRUCCIONES:
- Responde en español colombiano, concreto y accionable
- Cita normas específicas cuando sea relevante (Ley 80/93, Decreto 1082/2015, Ley 1150/2007)
- Si el usuario no ha subido documentos del proceso, motívalo a hacerlo
- Cuando calcules capacidad financiera, usa los indicadores estándar del RUP
- Nunca menciones que eres Claude, Bedrock, AWS, ColombiaTIC Ingeniería o modelos de IA
- Si no tienes información suficiente, pídela al usuario
- Sé directivo: da recomendaciones claras de SÍ/NO cuando tengas datos suficientes"""


# ── Redis history helpers ─────────────────────────────────────────────────

def _history_key(user_id: str, proceso_id: str) -> str:
    return f"contracts:hermes:{user_id}:{proceso_id}"


async def _get_history(redis, user_id: str, proceso_id: str) -> list[dict]:
    raw = await redis.get(_history_key(user_id, proceso_id))
    if not raw:
        return []
    try:
        return json.loads(raw)
    except Exception:
        return []


async def _save_history(redis, user_id: str, proceso_id: str, history: list[dict]) -> None:
    trimmed = history[-_MAX_HISTORY:]
    await redis.setex(_history_key(user_id, proceso_id), _HISTORY_TTL, json.dumps(trimmed))


# ── Context builder ───────────────────────────────────────────────────────

async def _build_context(proceso_id: str, user_id: str, settings: Settings) -> dict:
    """Load process + company + docs + evaluation for the system prompt."""
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    ctx: dict = {}
    try:
        # Process data (try saved_processes, then external_processes, then search cache)
        proc_row = await conn.fetchrow(
            """
            SELECT nombre_proceso AS titulo, entidad, departamento, ciudad, precio_base,
                   estado, NULL AS unspsc_codes, NULL AS modalidad, NULL AS descripcion
            FROM contracts.saved_processes WHERE user_id=$1 AND proceso_id=$2
            """, user_id, proceso_id,
        )
        if not proc_row:
            proc_row = await conn.fetchrow(
                "SELECT titulo, entidad, departamento, ciudad, precio_base, estado, "
                "unspsc_codes, modalidad, descripcion "
                "FROM contracts.external_processes WHERE user_id=$1 AND proceso_id=$2",
                user_id, proceso_id,
            )
        ctx["proceso"] = dict(proc_row) if proc_row else {"titulo": proceso_id}

        # Company profile
        company_row = await conn.fetchrow(
            "SELECT * FROM contracts.company_profiles WHERE user_id=$1", user_id
        )
        ctx["empresa"] = dict(company_row) if company_row else {}

        # Documents
        doc_rows = await conn.fetch(
            "SELECT file_name, file_type FROM contracts.process_documents "
            "WHERE user_id=$1 AND proceso_id=$2 ORDER BY file_type, file_name LIMIT 20",
            user_id, proceso_id,
        )
        ctx["docs"] = [dict(r) for r in doc_rows]

        # Latest completed evaluation
        eval_row = await conn.fetchrow(
            "SELECT status, analysis_json FROM contracts.bid_evaluations "
            "WHERE user_id=$1 AND proceso_id=$2 AND status='COMPLETED' "
            "ORDER BY created_at DESC LIMIT 1",
            user_id, proceso_id,
        )
        if eval_row:
            try:
                ctx["evaluacion"] = {
                    "status": eval_row["status"],
                    "analysis": json.loads(eval_row["analysis_json"] or "{}"),
                }
            except Exception:
                pass

        # Competition (aggregate only)
        n_evals = await conn.fetchval(
            "SELECT COUNT(DISTINCT user_id)::int FROM contracts.bid_evaluations "
            "WHERE proceso_id=$1 AND status='COMPLETED'", proceso_id,
        ) or 0
        avg_score = await conn.fetchval(
            "SELECT AVG(match_score) FROM contracts.bid_evaluations "
            "WHERE proceso_id=$1 AND status='COMPLETED' AND user_id!=$2",
            proceso_id, user_id,
        )
        from app.api.competitive_router import _intensity, _intensity_label
        ctx["competition"] = {
            "evaluators_count": n_evals,
            "intensity": _intensity(n_evals),
            "intensity_label": _intensity_label(n_evals),
            "avg_match_score": round(float(avg_score), 1) if avg_score and n_evals >= 3 else None,
        }

    finally:
        await conn.close()
    return ctx


# ── Request schemas ───────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=_MAX_INPUT_CHARS)
    stream: bool = Field(default=False)


# ── Quick actions ─────────────────────────────────────────────────────────

QUICK_ACTIONS = [
    {"id": "requisitos",  "label": "¿Cumplo los requisitos?"},
    {"id": "documentos",  "label": "¿Qué documentos me faltan?"},
    {"id": "presupuesto", "label": "Analiza el presupuesto"},
    {"id": "propuesta",   "label": "¿Por dónde empiezo la propuesta?"},
    {"id": "riesgos",     "label": "¿Cuáles son los riesgos clave?"},
]

QUICK_ACTION_PROMPTS = {
    "requisitos":  "¿Cumple mi empresa con los requisitos habilitantes de este proceso? Analiza jurídicos, financieros, técnicos y de experiencia.",
    "documentos":  "Lista exactamente qué documentos necesito preparar para presentarme a este proceso. Incluye el formato de cada uno.",
    "presupuesto": "Analiza el presupuesto del proceso. ¿Es realista para el alcance? ¿Cuánto debería cobrar? ¿Hay AIU que considerar?",
    "propuesta":   "¿Por dónde debo empezar para preparar mi propuesta? Dame un plan de trabajo paso a paso con fechas.",
    "riesgos":     "¿Cuáles son los principales riesgos de presentarme a este proceso y cómo los mitigaría?",
}


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/{proceso_id}/chat")
async def chat_hermes(
    proceso_id: str,
    body: ChatRequest,
    request: Request,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """
    Send a message to Hermes and get a response.
    Hermes has full context of the process, company profile, docs and evaluation.
    """
    user_id = str(user.get("sub") or user.get("userId") or "")
    redis = request.app.state.redis

    # Resolve quick action to full prompt
    message = QUICK_ACTION_PROMPTS.get(body.message, body.message)

    # Load context + history
    ctx = await _build_context(proceso_id, user_id, settings)
    history = await _get_history(redis, user_id, proceso_id)
    system_prompt = _build_system_prompt(ctx)

    # Build messages for Bedrock
    messages = [*history, {"role": "user", "content": message}]

    import boto3
    bedrock = boto3.client("bedrock-runtime", region_name=settings.AWS_REGION)

    try:
        if body.stream:
            # Streaming response via SSE
            return StreamingResponse(
                _stream_response(bedrock, system_prompt, messages, redis, user_id, proceso_id),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            )
        else:
            # Non-streaming (simpler for MVP)
            resp = await asyncio.to_thread(
                bedrock.converse,
                modelId=settings.BEDROCK_MODEL_EVALUATOR,
                system=[{"text": system_prompt}],
                messages=[{"role": m["role"], "content": [{"text": m["content"]}]}
                          for m in messages],
                inferenceConfig={"maxTokens": 1500, "temperature": 0.3},
            )
            assistant_msg = resp["output"]["message"]["content"][0]["text"]

            # Save conversation
            history.append({"role": "user", "content": message})
            history.append({"role": "assistant", "content": assistant_msg})
            await _save_history(redis, user_id, proceso_id, history)

            return {
                "message":    assistant_msg,
                "proceso_id": proceso_id,
                "tokens":     resp.get("usage", {}),
            }
    except Exception as exc:
        logger.error("Hermes chat failed for proceso=%s: %s", proceso_id, exc)
        raise HTTPException(status_code=500, detail="Error del asistente. Intenta de nuevo.")


async def _stream_response(bedrock, system_prompt, messages, redis, user_id, proceso_id):
    """SSE streaming generator for Hermes responses."""
    from app.config import Settings as _S
    settings = _S()
    full_response = ""

    try:
        stream = await asyncio.to_thread(
            bedrock.converse_stream,
            modelId=settings.BEDROCK_MODEL_EVALUATOR,
            system=[{"text": system_prompt}],
            messages=[{"role": m["role"], "content": [{"text": m["content"]}]}
                      for m in messages],
            inferenceConfig={"maxTokens": 1500, "temperature": 0.3},
        )
        for event in stream["stream"]:
            if "contentBlockDelta" in event:
                text = event["contentBlockDelta"]["delta"].get("text", "")
                if text:
                    full_response += text
                    yield f"data: {json.dumps({'text': text})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

        # Save to history after streaming completes
        new_user_msg = messages[-1]["content"]
        history = await _get_history(redis, user_id, proceso_id)
        history.append({"role": "user", "content": new_user_msg})
        history.append({"role": "assistant", "content": full_response})
        await _save_history(redis, user_id, proceso_id, history)

    except Exception as exc:
        yield f"data: {json.dumps({'error': str(exc)})}\n\n"


@router.get("/{proceso_id}/chat/history")
async def get_chat_history(
    proceso_id: str,
    request: Request,
    user: dict = Depends(require_pro),
):
    user_id = str(user.get("sub") or user.get("userId") or "")
    redis = request.app.state.redis
    history = await _get_history(redis, user_id, proceso_id)
    return {
        "history": history,
        "process_id": proceso_id,
        "quick_actions": QUICK_ACTIONS,
    }


@router.delete("/{proceso_id}/chat")
async def clear_chat(
    proceso_id: str,
    request: Request,
    user: dict = Depends(require_pro),
):
    user_id = str(user.get("sub") or user.get("userId") or "")
    redis = request.app.state.redis
    await redis.delete(_history_key(user_id, proceso_id))
    return {"cleared": True}
