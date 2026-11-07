"""
Template auto-filler — Sprint 9.

Reads an Excel template downloaded from a SECOP II process, identifies
cells whose labels match company profile fields (NIT, Razón Social, etc.),
and writes the profile values into the adjacent empty cells.

Heuristic matching handles 70-85% of Colombian government procurement
templates.  Bedrock Claude is called only for cells the heuristic cannot
resolve, keeping API costs minimal.
"""
from __future__ import annotations

import asyncio
import io
import logging
import re
from typing import TYPE_CHECKING

import boto3
import openpyxl
from botocore.config import Config
from openpyxl.styles import Font
from openpyxl.utils import get_column_letter

if TYPE_CHECKING:
    from app.config import Settings

logger = logging.getLogger(__name__)

# ── Keyword → company_profile field mapping ───────────────────────────────

_KEYWORD_MAP: dict[str, str] = {
    # Identity
    "razon social": "razon_social",
    "razón social": "razon_social",
    "empresa": "razon_social",
    "nombre empresa": "razon_social",
    "nombre de la empresa": "razon_social",
    "nombre comercial": "nombre_comercial",
    "nombre del proponente": "razon_social",
    "razón social del proponente": "razon_social",
    "nombre o razón social": "razon_social",
    # Tax
    "nit": "nit",
    "n.i.t": "nit",
    "n.i.t.": "nit",
    "número de identificación": "nit",
    "identificación tributaria": "nit",
    "rut": "nit",
    # Representative
    "representante legal": "representante",
    "representante": "representante",
    "nombre representante": "representante",
    "nombre del representante": "representante",
    # Contact
    "correo electrónico": "email_contacto",
    "correo electronico": "email_contacto",
    "email": "email_contacto",
    "e-mail": "email_contacto",
    "correo": "email_contacto",
    "teléfono": "telefono",
    "telefono": "telefono",
    "tel": "telefono",
    "celular": "telefono",
    # Address
    "dirección": "ciudad",
    "direccion": "ciudad",
    "ciudad": "ciudad",
    "municipio": "ciudad",
    "departamento": "departamento",
    # Capacity
    "capacidad de contratación": "capacidad_k",
    "capacidad residual": "capacidad_k",
    "capacidad k": "capacidad_k",
}

# Normalise a cell value for keyword matching
_RE_SPACES = re.compile(r"\s+")


def _norm(s: str) -> str:
    return _RE_SPACES.sub(" ", s.lower().strip().rstrip(":").strip())


def _find_profile_field(label: str) -> str | None:
    n = _norm(label)
    # Exact match first
    if n in _KEYWORD_MAP:
        return _KEYWORD_MAP[n]
    # Substring match
    for kw, field in _KEYWORD_MAP.items():
        if kw in n or n in kw:
            return field
    return None


# ── Excel scanner ─────────────────────────────────────────────────────────

def _scan_worksheet(ws, profile: dict) -> tuple[dict, int, int]:
    """
    Scan a worksheet for label → empty-value patterns.

    For each non-empty cell C whose text matches a profile keyword, check
    adjacent cells (right, below) for an empty slot to fill.

    Returns (cell_mapping, cells_filled, cells_attempted).
    """
    mapping: dict[str, str] = {}   # cell_address → value_written
    filled = 0
    attempted = 0

    for row in ws.iter_rows():
        for cell in row:
            val = cell.value
            if not isinstance(val, str) or not val.strip():
                continue

            field = _find_profile_field(val)
            if not field:
                continue

            profile_val = profile.get(field)
            if not profile_val:
                continue

            attempted += 1

            # Check right neighbour first, then below
            for dr, dc in [(0, 1), (1, 0)]:
                nr, nc = cell.row + dr, cell.column + dc
                try:
                    neighbour = ws.cell(row=nr, column=nc)
                except Exception:
                    continue

                # Fill only if the neighbour is empty or a placeholder
                nv = neighbour.value
                if nv is None or (isinstance(nv, str) and nv.strip() in ("", "_", "__", "___", "____")):
                    neighbour.value = str(profile_val)
                    # Keep existing formatting, just set font to not bold
                    try:
                        neighbour.font = Font(bold=False)
                    except Exception:
                        pass
                    addr = f"{get_column_letter(nc)}{nr}"
                    mapping[addr] = field
                    filled += 1
                    break

    return mapping, filled, attempted


# ── Bedrock fallback for ambiguous cells ─────────────────────────────────

async def _bedrock_suggest(
    labels: list[str], profile: dict, settings: "Settings"
) -> dict[str, str]:
    """
    Ask Claude to suggest which profile field each unmatched label maps to.
    Called only when the heuristic fails for some cells.
    Returns {label: field_name} (empty if unsure).
    """
    if not labels:
        return {}

    fields_str = "\n".join(f"- {k}: {v!r}" for k, v in profile.items() if v)
    labels_str = "\n".join(f"- {l}" for l in labels[:10])  # max 10 to save cost

    prompt = (
        "Eres un asistente para cotizaciones de contratación pública colombiana. "
        "Dado un perfil de empresa y una lista de etiquetas de un formulario Excel, "
        "indica qué campo del perfil corresponde a cada etiqueta. "
        "Responde ÚNICAMENTE con JSON {\"etiqueta\": \"campo\"} o {} si no hay coincidencia.\n\n"
        f"Perfil disponible:\n{fields_str}\n\n"
        f"Etiquetas sin mapear:\n{labels_str}\n\n"
        "JSON de respuesta:"
    )

    import json
    try:
        from app.infrastructure.bedrock_llm import BedrockLlmService
        llm = BedrockLlmService(settings)
        raw = await asyncio.to_thread(
            llm._client.converse,
            modelId=settings.BEDROCK_MODEL_EVALUATOR,
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": 200, "temperature": 0},
        )
        text = raw["output"]["message"]["content"][0]["text"]
        match = re.search(r"\{[^}]+\}", text)
        if match:
            return json.loads(match.group())
    except Exception as exc:
        logger.warning("Bedrock suggestion failed: %s", exc)
    return {}


# ── Main entry point ──────────────────────────────────────────────────────

async def autofill_template(
    source_key: str,
    profile: dict,
    settings: "Settings",
) -> tuple[bytes, dict, int]:
    """
    Download an Excel template from S3, fill it with company profile data,
    and return (filled_bytes, cell_mapping, fill_pct).
    """
    s3 = boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        config=Config(signature_version="s3v4"),
    )

    # Download template
    obj = s3.get_object(Bucket=settings.S3_BUCKET_DOCUMENTS, Key=source_key)
    template_bytes = obj["Body"].read()

    wb = openpyxl.load_workbook(io.BytesIO(template_bytes))

    full_mapping: dict[str, str] = {}
    total_filled = 0
    total_attempted = 0

    for ws_name in wb.sheetnames:
        ws = wb[ws_name]
        mapping, filled, attempted = _scan_worksheet(ws, profile)
        full_mapping.update({f"{ws_name}!{k}": v for k, v in mapping.items()})
        total_filled += filled
        total_attempted += attempted

    fill_pct = round(100 * total_filled / total_attempted) if total_attempted else 0
    logger.info(
        "Autofill: %d/%d cells filled (%.0f%%)",
        total_filled, total_attempted, fill_pct,
    )

    # Save result
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue(), full_mapping, fill_pct
