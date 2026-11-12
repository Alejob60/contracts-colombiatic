"""
Profile completion score — Sprint 20.

Calculates a 0-100 score representing how complete the company profile is.
A higher score means better AI matching and more precise search results.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

import asyncpg

if TYPE_CHECKING:
    from app.config import Settings


# Weighted items — must sum to 100
_ITEMS = [
    # (key, label, points, check_fn)
    ("nit",               "NIT y razón social registrados",                    15, lambda p: bool(p.get("nit") and p.get("razon_social"))),
    ("unspsc",            "Códigos UNSPSC (actividad económica)",               25, lambda p: bool(p.get("unspsc_codes"))),
    ("documentos",        "Documentos corporativos subidos (RUP, financieros)", 20, lambda p: bool(p.get("_doc_count", 0))),
    ("capacidad_k",       "Capacidad residual K configurada",                   10, lambda p: bool(p.get("capacidad_k"))),
    ("presupuesto_min",   "Presupuesto mínimo de interés definido",             10, lambda p: bool(p.get("presupuesto_min_interes"))),
    ("experiencia",       "Años de experiencia declarados",                      5, lambda p: bool(p.get("experiencia_anos"))),
    ("departamento",      "Departamento de operación principal",                 5, lambda p: bool(p.get("departamento"))),
    ("representante",     "Representante legal registrado",                      5, lambda p: bool(p.get("representante"))),
    ("email",             "Email de contacto",                                   5, lambda p: bool(p.get("email_contacto"))),
]


async def get_completion_score(user_id: str, settings: "Settings") -> dict:
    """
    Returns:
      score          : int 0-100
      items          : list of {key, label, points, done}
      missing        : list of labels not yet done (ordered by impact)
      next_action    : single most impactful pending item, or None
    """
    from app.application.manage_company import get_pg_url

    conn = await asyncpg.connect(
        get_pg_url(settings),
        server_settings={"search_path": "contracts,public"},
    )
    try:
        profile_row = await conn.fetchrow(
            "SELECT * FROM company_profiles WHERE user_id=$1", user_id
        )
        doc_count = 0
        if profile_row:
            doc_count = await conn.fetchval(
                "SELECT COUNT(*) FROM company_documents WHERE company_id=$1",
                profile_row["id"],
            ) or 0

        profile = dict(profile_row) if profile_row else {}
        profile["_doc_count"] = int(doc_count)

        items = []
        score = 0
        missing = []

        for key, label, points, check in _ITEMS:
            done = check(profile)
            items.append({"key": key, "label": label, "points": points, "done": done})
            if done:
                score += points
            else:
                missing.append({"key": key, "label": label, "points": points})

        # Sort missing by points descending — highest impact first
        missing.sort(key=lambda x: x["points"], reverse=True)

        return {
            "score":       score,
            "items":       items,
            "missing":     missing,
            "next_action": missing[0] if missing else None,
            "has_profile": bool(profile_row),
        }
    finally:
        await conn.close()
