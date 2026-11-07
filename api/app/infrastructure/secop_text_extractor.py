"""
External process text extractor — Sprint 10B.

Uses Bedrock Claude Haiku to extract structured process data from:
  1. Raw text pasted from a SECOP II process page (Ctrl+A → copy)
  2. A community.secop.gov.co URL (extracts PPI/ID hint only)

The extractor runs fast and cheap (Claude Haiku, ~$0.001 per call).
Falls back to regex patterns if Claude is unavailable or fails.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.config import Settings

logger = logging.getLogger(__name__)

# ── Prompt ────────────────────────────────────────────────────────────────────

_EXTRACT_PROMPT = """\
Eres un asistente especializado en contratación pública colombiana (SECOP II).

Del siguiente texto de una página de proceso SECOP II, extrae la información.
Devuelve ÚNICAMENTE JSON válido, sin texto adicional, sin markdown, sin explicaciones.

TEXTO DEL PROCESO:
{raw_text}

JSON requerido (usa null para campos no encontrados):
{{
  "titulo": "título completo del proceso",
  "entidad": "nombre de la entidad contratante",
  "nit_entidad": "NIT sin dígito verificador o null",
  "departamento": "departamento donde se ejecuta",
  "ciudad": "ciudad/municipio",
  "modalidad": "modalidad o tipo de proceso",
  "proceso_numero": "número del proceso como EC-0702026 o el número visible",
  "ppi": "código PPI como CO1.PPI.51015553 si aparece, sino null",
  "unspsc_codes": ["81111500", "81111800"],
  "precio_base": número_sin_formato_o_null,
  "fecha_cierre": "fecha límite en ISO 8601 con zona horaria Colombia (-05:00)",
  "fecha_publicacion": "fecha de publicación en ISO 8601 o null",
  "estado": "estado del proceso (Publicado/Abierto/etc.)",
  "descripcion": "descripción del objeto (máx 400 caracteres)",
  "confianza": 0.0_a_1.0
}}"""


# ── Regex fallbacks ───────────────────────────────────────────────────────────

def _regex_extract(text: str) -> dict:
    """Fast regex extraction as fallback when Claude is unavailable."""
    out: dict = {}

    # Process number
    m = re.search(r'Número del proceso\s*[:\|]\s*([A-Z0-9\-\.]+)', text, re.I)
    if m:
        out["proceso_numero"] = m.group(1).strip()

    # PPI
    m = re.search(r'(CO1\.PPI\.\d+)', text)
    if m:
        out["ppi"] = m.group(1)

    # Title
    m = re.search(r'Título\s*[:\|]\s*(.+?)(?:\n|Estado|Tipo)', text, re.I | re.S)
    if m:
        out["titulo"] = m.group(1).strip()[:300]

    # Entity
    m = re.search(r'SECRETAR[ÍI]A|ALCALD[ÍI]A|MINISTERIO|DEPARTAMENTO|MUNICIPIO.*?\n', text, re.I)
    if m:
        out["entidad"] = m.group(0).strip()

    # UNSPSC codes
    codes = re.findall(r'\b(\d{8})\s*-\s*[A-Za-z]', text)
    if codes:
        out["unspsc_codes"] = list(set(codes))

    # Dates with Colombian format DD/MM/YYYY HH:MM:SS
    dates = re.findall(r'(\d{1,2}/\d{1,2}/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*[AP]M)', text)
    if dates:
        out["fecha_cierre_raw"] = dates[0]

    # Price
    m = re.search(r'\$\s*([\d,\.]+)', text)
    if m:
        try:
            price_str = m.group(1).replace(',', '').replace('.', '')
            out["precio_base"] = float(price_str)
        except ValueError:
            pass

    out["confianza"] = 0.5 if out else 0.1
    return out


# ── Main extractor ────────────────────────────────────────────────────────────

async def extract_from_text(raw_text: str, settings: "Settings") -> dict:
    """
    Extract structured SECOP II process data from raw pasted text.

    Returns a dict with all extracted fields + 'confianza' (0-1 confidence)
    and 'source' = 'claude' | 'regex'.
    """
    # Always run regex as a baseline
    regex_result = _regex_extract(raw_text)

    # Try Claude for richer extraction
    try:
        from app.infrastructure.bedrock_llm import BedrockLlmService

        llm = BedrockLlmService(settings)
        prompt = _EXTRACT_PROMPT.format(raw_text=raw_text[:6000])  # cap at 6000 chars

        response = await asyncio.to_thread(
            llm._client.converse,
            modelId=settings.BEDROCK_MODEL_EVALUATOR,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 800, "temperature": 0},
        )
        raw_json = response["output"]["message"]["content"][0]["text"]

        # Extract JSON from response
        match = re.search(r'\{.*\}', raw_json, re.DOTALL)
        if match:
            result = json.loads(match.group())
            result["source"] = "claude"
            # Merge regex data for any missing fields
            for k, v in regex_result.items():
                if k not in result or result[k] is None:
                    result[k] = v
            logger.info(
                "Extraction via Claude: confianza=%.2f, fields=%d",
                result.get("confianza", 0), len([v for v in result.values() if v])
            )
            return result

    except Exception as exc:
        logger.warning("Claude extraction failed, falling back to regex: %s", exc)

    regex_result["source"] = "regex"
    return regex_result


def extract_from_url(url: str) -> dict:
    """
    Extract process identifiers from a community.secop.gov.co URL.

    Example:
      https://community.secop.gov.co/Public/Tendering/ContractNoticePhases/View
        ?PPI=CO1.PPI.51015553

    Returns {ppi, proceso_id_hint, source: 'url'}
    """
    out: dict = {"source": "url"}

    # PPI parameter
    m = re.search(r'[?&]PPI=([^&]+)', url, re.I)
    if m:
        out["ppi"] = m.group(1)
        out["proceso_id_hint"] = m.group(1)

    # Number of constancia pattern
    m = re.search(r'(CO1\.[A-Z]+\.\d+)', url)
    if m:
        out["constancia"] = m.group(1)

    out["url_secop"] = url
    return out
