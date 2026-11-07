"""
SECOP periodic alert worker — Sprint 6.

Runs as an asyncio background task attached to the FastAPI lifespan.
Every ALERT_WORKER_INTERVAL_H hours it:

  1. Fetches SECOP processes published in the last window
  2. Loads all active alert configs from the DB
  3. Scores each (process, config) pair against the config's filters
  4. For each match above min_match_score, sends an SES email and logs
     the event (UNIQUE constraint prevents duplicate deliveries).

WhatsApp channel is accepted in config but currently logs a warning —
it requires AWS End User Messaging setup (planned for Sprint 8).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import TYPE_CHECKING

import asyncpg
import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.application.manage_alerts import load_active_configs, record_alert_event
from app.application.manage_company import get_pg_url

if TYPE_CHECKING:
    from app.config import Settings
    from app.infrastructure.secop_soda_gateway import SecopSodaGateway

logger = logging.getLogger(__name__)

# Max processes to fetch per poll cycle (avoids huge memory spikes)
_MAX_FETCH = 500


# ── Matching ──────────────────────────────────────────────────────────────

def _score(process: dict, config: dict) -> int:
    """
    Return a 0-100 score for how well a process matches an alert config.

    Every configured filter is treated as a hard gate (match or score=0).
    The score itself is always 100 when all gates pass — we use the
    min_match_score threshold simply as a knob to let users raise the bar
    for what counts as a relevant result.
    """
    # UNSPSC codes — partial prefix match
    unspsc_filter: list[str] = config.get("unspsc_filter") or []
    if unspsc_filter:
        proc_code = (process.get("codigo_unspsc") or "").lower()
        if not any(proc_code.startswith(f.lower()) for f in unspsc_filter):
            return 0

    # Department — partial substring match
    dept_filter: list[str] = config.get("departamento_filter") or []
    if dept_filter:
        proc_dept = (process.get("departamento_entidad") or "").lower()
        if not any(f.lower() in proc_dept for f in dept_filter):
            return 0

    # Modalidad — exact substring match
    modal_filter: list[str] = config.get("modalidad_filter") or []
    if modal_filter:
        proc_modal = (process.get("modalidad") or "").lower()
        if not any(f.lower() in proc_modal for f in modal_filter):
            return 0

    # Price range
    try:
        price = Decimal(str(process.get("precio_base") or 0))
        if config.get("precio_min") and price < Decimal(str(config["precio_min"])):
            return 0
        if config.get("precio_max") and price > Decimal(str(config["precio_max"])):
            return 0
    except InvalidOperation:
        pass

    # Keywords — any keyword present in the process title
    keywords_raw: str = config.get("keywords") or ""
    if keywords_raw.strip():
        title = (process.get("nombre_del_procedimiento") or "").lower()
        kws = [k.strip().lower() for k in keywords_raw.split(",") if k.strip()]
        if kws and not any(k in title for k in kws):
            return 0

    return 100


# ── Email delivery ────────────────────────────────────────────────────────

def _format_cop(value) -> str:
    try:
        return f"$ {int(Decimal(str(value))):,}".replace(",", ".")
    except Exception:
        return str(value)


def _build_html_email(process: dict, config: dict) -> tuple[str, str]:
    """Return (subject, html_body) for the alert email."""
    nombre = process.get("nombre_del_procedimiento") or "Proceso sin nombre"
    entidad = process.get("entidad") or "Entidad desconocida"
    dept = process.get("departamento_entidad") or ""
    ciudad = process.get("ciudad_entidad") or ""
    precio = process.get("precio_base")
    estado = process.get("estado") or ""
    proceso_id = process.get("proceso_id") or ""

    location = ", ".join(filter(None, [ciudad, dept]))
    precio_str = _format_cop(precio) if precio else "No especificado"

    subject = f"📋 Nueva licitación: {nombre[:80]}"

    body = f"""<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#0d1117;color:#e6edf3;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto">
    <div style="background:#10b981;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <h1 style="margin:0;font-size:18px;color:#fff">⚡ Nueva alerta de licitación</h1>
      <p style="margin:4px 0 0;font-size:12px;color:#d1fae5">ColombiaTIC Contracts — SECOP II</p>
    </div>

    <div style="background:#161b22;border:1px solid #30363d;border-radius:8px;padding:20px;margin-bottom:16px">
      <h2 style="margin:0 0 12px;font-size:16px;color:#fff;line-height:1.4">{nombre}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="padding:6px 0;color:#8b949e;width:130px">Entidad</td>
            <td style="padding:6px 0;color:#e6edf3">{entidad}</td></tr>
        <tr><td style="padding:6px 0;color:#8b949e">Ubicación</td>
            <td style="padding:6px 0;color:#e6edf3">{location or "—"}</td></tr>
        <tr><td style="padding:6px 0;color:#8b949e">Presupuesto</td>
            <td style="padding:6px 0;color:#10b981;font-weight:bold">{precio_str} COP</td></tr>
        <tr><td style="padding:6px 0;color:#8b949e">Estado</td>
            <td style="padding:6px 0;color:#e6edf3">{estado}</td></tr>
        <tr><td style="padding:6px 0;color:#8b949e">ID Proceso</td>
            <td style="padding:6px 0;color:#8b949e;font-size:11px">{proceso_id}</td></tr>
      </table>
    </div>

    <div style="text-align:center;margin:24px 0">
      <a href="https://contracts.colombiatic.com.co/buscar"
         style="background:#10b981;color:#fff;padding:12px 28px;border-radius:8px;
                text-decoration:none;font-weight:bold;font-size:14px">
        Ver en ColombiaTIC Contracts →
      </a>
    </div>

    <p style="font-size:11px;color:#484f58;text-align:center;margin-top:24px">
      Recibiste esta alerta porque tienes alertas activas en ColombiaTIC Contracts.<br>
      <a href="https://contracts.colombiatic.com.co/dashboard/alertas"
         style="color:#8b949e">Gestionar alertas</a>
    </p>
  </div>
</body>
</html>"""

    return subject, body


def _send_ses_email_sync(
    to_email: str,
    subject: str,
    html_body: str,
    from_email: str,
    region: str,
) -> None:
    """Synchronous SES send — must be called via asyncio.to_thread."""
    ses = boto3.client("ses", region_name=region)
    ses.send_email(
        Source=from_email,
        Destination={"ToAddresses": [to_email]},
        Message={
            "Subject": {"Data": subject, "Charset": "UTF-8"},
            "Body": {"Html": {"Data": html_body, "Charset": "UTF-8"}},
        },
    )


# ── Core poll cycle ───────────────────────────────────────────────────────

async def _fetch_recent_processes(
    gateway: "SecopSodaGateway",
    since: datetime,
) -> list[dict]:
    """
    Query SECOP for processes with fecha_publicacion >= since.

    Returns raw dicts (not SecopProcess models) to avoid Pydantic overhead
    in the worker's hot path.
    """
    from app.domain.models.secop import SecopFilter

    flt = SecopFilter(
        fecha_desde=since,
        estado="todos",
        limit=_MAX_FETCH,
        offset=0,
    )
    try:
        result = await gateway.search(flt)
        return [p.model_dump() for p in result.results]
    except Exception as exc:
        logger.error("Worker: SECOP fetch failed: %s", exc)
        return []


async def _run_once(settings: "Settings", gateway: "SecopSodaGateway") -> None:
    """Execute one full alert poll cycle."""
    configs = await load_active_configs(settings)
    if not configs:
        logger.debug("Worker: no active alert configs — skipping")
        return

    since = datetime.now(timezone.utc) - timedelta(
        hours=settings.ALERT_WORKER_INTERVAL_H + 1  # +1 h overlap for clock skew
    )
    processes = await _fetch_recent_processes(gateway, since)
    if not processes:
        logger.info("Worker: no recent SECOP processes since %s", since.isoformat())
        return

    logger.info(
        "Worker: %d configs × %d processes — matching started",
        len(configs), len(processes),
    )

    conn = await asyncpg.connect(
        get_pg_url(settings), server_settings={"search_path": "contracts,public"}
    )
    sent_total = 0
    try:
        for config in configs:
            user_id = str(config["user_id"])
            threshold = int(config.get("min_match_score") or 70)
            channels: list[str] = config.get("channels") or ["email"]

            for proc in processes:
                score = _score(proc, config)
                if score < threshold:
                    continue

                proceso_id = str(proc.get("proceso_id") or "")
                nombre = proc.get("nombre_del_procedimiento")
                entidad = proc.get("entidad")

                for channel in channels:
                    if channel == "whatsapp":
                        logger.debug(
                            "WhatsApp channel not yet implemented for user %s — skipping",
                            user_id,
                        )
                        continue

                    if channel != "email":
                        continue

                    to_email = config.get("email") or ""
                    if not to_email:
                        continue

                    inserted = await record_alert_event(
                        conn, user_id, proceso_id, nombre, entidad, score, channel
                    )
                    if not inserted:
                        continue  # already sent

                    subject, html_body = _build_html_email(proc, config)
                    try:
                        await asyncio.to_thread(
                            _send_ses_email_sync,
                            to_email,
                            subject,
                            html_body,
                            settings.SES_FROM_EMAIL,
                            settings.AWS_REGION,
                        )
                        sent_total += 1
                        logger.info(
                            "Alert sent → %s | proceso %s | user %s",
                            to_email, proceso_id, user_id,
                        )
                    except (BotoCoreError, ClientError) as ses_exc:
                        logger.error(
                            "SES delivery failed for user %s proceso %s: %s",
                            user_id, proceso_id, ses_exc,
                        )
    finally:
        await conn.close()

    logger.info("Worker cycle done — %d alerts sent", sent_total)


# ── Long-running task ─────────────────────────────────────────────────────

async def run_alert_worker(
    settings: "Settings",
    gateway: "SecopSodaGateway",
) -> None:
    """
    Perpetual background task attached to the FastAPI lifespan.

    Sleeps for ALERT_WORKER_INTERVAL_H hours between poll cycles.
    First run is delayed by 90 seconds so the app finishes starting
    before we hit SECOP.
    """
    interval_s = settings.ALERT_WORKER_INTERVAL_H * 3_600
    logger.info(
        "Alert worker starting — interval: %dh", settings.ALERT_WORKER_INTERVAL_H
    )
    await asyncio.sleep(90)  # let the app stabilise before the first poll

    while True:
        try:
            await _run_once(settings, gateway)
        except asyncio.CancelledError:
            logger.info("Alert worker cancelled — shutting down")
            return
        except Exception as exc:
            logger.error("Alert worker cycle unhandled exception: %s", exc)
        try:
            await asyncio.sleep(interval_s)
        except asyncio.CancelledError:
            logger.info("Alert worker cancelled during sleep — shutting down")
            return
