"""
Asesor de Contratos — Sprint 21.

Consejero estratégico IA para contratistas colombianos.
Diferente de Hermes (workspace per-process): el Asesor opera a nivel
de búsqueda y sesión — conoce el perfil de la empresa, la búsqueda
activa y cualquier proceso que el usuario esté mirando.

POST /api/v1/advisor/chat   — enviar mensaje (streaming SSE)
DELETE /api/v1/advisor/chat — limpiar historial
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import asyncpg
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.application.manage_company import get_pg_url
from app.application.profile_completion import get_completion_score
from app.config import Settings
from app.dependencies import get_current_user, get_settings, require_pro

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/advisor", tags=["advisor"])

_HISTORY_TTL = 43_200   # 12 h
_MAX_HISTORY = 16
_MAX_INPUT   = 1_200


# ── System prompt ─────────────────────────────────────────────────────────

def _fmt_cop(val) -> str:
    try:
        return f"${int(float(val)):,} COP" if val else "No especificado"
    except Exception:
        return str(val) if val else "No especificado"


def _build_system_prompt(profile: dict, completion: dict, ctx: dict) -> str:
    unspsc = ", ".join(profile.get("unspsc_codes") or []) or "No registrados"
    missing_labels = [m["label"] for m in completion.get("missing", [])][:4]
    missing_str = "; ".join(missing_labels) if missing_labels else "Perfil completo"

    search_section = ""
    if ctx.get("search"):
        s = ctx["search"]
        ent_line = f'  Entidad filtrada: "{s["entidad"]}"' if s.get("entidad") else ""
        search_section = f"""
BÚSQUEDA ACTIVA:
  Consulta: "{s.get('query', '')}"
{ent_line}
  Resultados encontrados: {s.get('total', 0)} procesos
"""

    process_section = ""
    if ctx.get("process"):
        p = ctx["process"]
        process_section = f"""
PROCESO BAJO ANÁLISIS:
  ID: {p.get('proceso_id', '')}
  Título: {p.get('nombre_del_procedimiento', '')[:200]}
  Entidad: {p.get('entidad', '')}
  Presupuesto: {_fmt_cop(p.get('precio_base'))}
  Modalidad: {p.get('modalidad', 'No especificada')}
  UNSPSC: {p.get('codigo_unspsc', 'No especificado')}
  Estado: {p.get('estado', '')}
  Descripción: {str(p.get('descripcion') or '')[:350] or '(no disponible — el usuario puede subir los documentos)'}
"""

    empresa = profile.get("razon_social") or profile.get("nombre_comercial") or "la empresa"

    return f"""Eres el Asesor de Contratos de ColombiaTIC Contracts.

Rol: Consejero estratégico para {empresa} en contratación pública colombiana (SECOP II).

PERFIL DE LA EMPRESA:
  Empresa: {empresa}
  Sector: {profile.get('sector') or 'No especificado'}
  UNSPSC registrados: {unspsc}
  Capacidad K: {profile.get('capacidad_k') or 'No especificada'} SMMLV
  Departamento: {profile.get('departamento') or 'No especificado'}
  Años de experiencia: {profile.get('experiencia_anos') or 'No declarados'}
  Presupuesto mínimo de interés: {_fmt_cop(profile.get('presupuesto_min_interes'))}
  Completitud del perfil: {completion.get('score', 0)}%
  Pendiente: {missing_str}
{search_section}{process_section}
INSTRUCCIONES:
- Eres consejero estratégico experto en contratación pública colombiana
- Das recomendaciones directas y concretas: "SÍ puedes ganar porque..." o "NO recomiendo porque..."
- Conoces Ley 80/1993, Decreto 1082/2015, Ley 1150/2007, Ley 2069/2020
- Para evaluar viabilidad siempre consideras: match UNSPSC, capacidad financiera K, experiencia mínima
- Sugieres búsquedas específicas y útiles (términos concretos en español)
- Si el perfil está incompleto, señalas exactamente cómo afecta al análisis
- Si un proceso no tiene descripción, dile al usuario que suba los documentos al workspace
- Respuestas concisas: máximo 4 párrafos, usa viñetas cuando aclare
- NUNCA menciones Claude, Bedrock, AWS, Anthropic, ColombiaTIC Ingeniería ni tecnología interna
- Hablas en primera persona plural ("te recomendamos", "evaluamos"), como asesor de la empresa"""


# ── Redis helpers ─────────────────────────────────────────────────────────

def _rkey(uid: str) -> str:
    return f"contracts:advisor:{uid}"


async def _get_history(redis, uid: str) -> list[dict]:
    raw = await redis.get(_rkey(uid))
    if not raw:
        return []
    try:
        return json.loads(raw)
    except Exception:
        return []


async def _save_history(redis, uid: str, history: list[dict]) -> None:
    await redis.setex(_rkey(uid), _HISTORY_TTL, json.dumps(history[-_MAX_HISTORY:]))


# ── Quick actions ─────────────────────────────────────────────────────────

QUICK_ACTIONS_SEARCH = [
    {"id": "mejores",    "label": "¿Cuál proceso me conviene más?"},
    {"id": "afinar",     "label": "Ayúdame a afinar la búsqueda"},
    {"id": "unspsc",     "label": "¿Qué UNSPSC debo usar?"},
    {"id": "perfil",     "label": "¿Qué me falta en el perfil?"},
]

QUICK_ACTIONS_PROCESS = [
    {"id": "viabilidad", "label": "¿Puedo ganar este proceso?"},
    {"id": "faltantes",  "label": "¿Qué me falta para habilitar?"},
    {"id": "presupuesto","label": "¿Es realista el presupuesto?"},
    {"id": "similares",  "label": "Dame procesos similares"},
]

QUICK_PROMPTS = {
    "mejores":    "Basándote en mi perfil (UNSPSC, sector, capacidad K), ¿cuál de los procesos en la búsqueda actual me recomiendas priorizar y por qué?",
    "afinar":     "La búsqueda actual tiene muchos resultados genéricos. ¿Qué términos de búsqueda o filtros me recomiendas usar para encontrar contratos más precisos para mi empresa?",
    "unspsc":     "¿Qué códigos UNSPSC debería registrar en mi perfil según el sector de mi empresa? Dame los más relevantes con su descripción.",
    "perfil":     "Analiza mi perfil actual y dime qué datos faltan y cómo cada campo pendiente afecta la precisión de las búsquedas y la evaluación IA.",
    "viabilidad": "Analiza el proceso bajo análisis y dime directamente si mi empresa puede ganar. Evalúa match UNSPSC, capacidad financiera y experiencia mínima.",
    "faltantes":  "Para el proceso que estoy mirando, ¿qué documentos y requisitos me faltan para poder habilitar? Sé específico.",
    "presupuesto":"Analiza el presupuesto del proceso. ¿Es coherente con el alcance? ¿Cuánto debería proponer? ¿Hay AIU que considerar?",
    "similares":  "¿Qué términos de búsqueda me recomiendas para encontrar procesos similares a este en SECOP II? Dame 3 búsquedas concretas.",
}


# ── Schemas ───────────────────────────────────────────────────────────────

class SearchCtx(BaseModel):
    query:   str = ""
    entidad: str = ""
    total:   int = 0

class ProcessCtx(BaseModel):
    proceso_id:             str = ""
    nombre_del_procedimiento: str = ""
    entidad:                str = ""
    precio_base:            str | None = None
    modalidad:              str = ""
    codigo_unspsc:          str = ""
    estado:                 str = ""
    descripcion:            str | None = None

class AdvisorRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=_MAX_INPUT)
    search:  SearchCtx  | None = None
    process: ProcessCtx | None = None


# ── Endpoint ──────────────────────────────────────────────────────────────

@router.post("/chat")
async def advisor_chat(
    body:     AdvisorRequest,
    request:  Request,
    user:     dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """
    Advisor chat — streaming SSE.
    Context is supplied by the frontend (current search state + process if any).
    """
    uid = str(user.get("sub") or user.get("userId") or "")
    redis = request.app.state.redis

    # Resolve quick-action id to full prompt
    message = QUICK_PROMPTS.get(body.message, body.message)

    # Load profile + completion
    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    try:
        prof_row = await conn.fetchrow(
            "SELECT * FROM company_profiles WHERE user_id=$1", uid
        )
    finally:
        await conn.close()

    profile    = dict(prof_row) if prof_row else {}
    completion = await get_completion_score(uid, settings)

    ctx: dict[str, Any] = {}
    if body.search:  ctx["search"]  = body.search.model_dump()
    if body.process: ctx["process"] = body.process.model_dump()

    system_prompt = _build_system_prompt(profile, completion, ctx)
    history       = await _get_history(redis, uid)
    messages      = [*history, {"role": "user", "content": message}]

    import boto3
    bedrock = boto3.client("bedrock-runtime", region_name=settings.AWS_REGION)

    return StreamingResponse(
        _stream(bedrock, system_prompt, messages, redis, uid, message, settings),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream(bedrock, system_prompt, messages, redis, uid, user_msg, settings):
    full = ""
    try:
        stream = await asyncio.to_thread(
            bedrock.converse_stream,
            modelId=settings.BEDROCK_MODEL_EVALUATOR,
            system=[{"text": system_prompt}],
            messages=[{"role": m["role"], "content": [{"text": m["content"]}]}
                      for m in messages],
            inferenceConfig={"maxTokens": 1200, "temperature": 0.35},
        )
        for event in stream["stream"]:
            if "contentBlockDelta" in event:
                text = event["contentBlockDelta"]["delta"].get("text", "")
                if text:
                    full += text
                    yield f"data: {json.dumps({'text': text})}\n\n"
        yield f"data: {json.dumps({'done': True})}\n\n"

        history = await _get_history(redis, uid)
        history.append({"role": "user",      "content": user_msg})
        history.append({"role": "assistant",  "content": full})
        await _save_history(redis, uid, history)

    except Exception as exc:
        logger.error("Advisor stream error: %s", exc)
        yield f"data: {json.dumps({'error': 'Error del asistente. Intenta de nuevo.'})}\n\n"


@router.delete("/chat")
async def clear_advisor(
    request: Request,
    user:    dict = Depends(require_pro),
):
    uid = str(user.get("sub") or user.get("userId") or "")
    await request.app.state.redis.delete(_rkey(uid))
    return {"cleared": True}


@router.get("/quick-actions")
async def get_quick_actions(has_process: bool = False):
    return {
        "actions": QUICK_ACTIONS_PROCESS if has_process else QUICK_ACTIONS_SEARCH
    }
