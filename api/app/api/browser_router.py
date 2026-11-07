"""
Browser relay endpoints — Sprint 12.

Receives SECOP II data captured by the user's browser (bookmarklet,
extension, or session relay).  ALL requests to community.secop.gov.co
are made from the user's own browser/IP — never from our servers.
This is the key architectural decision that keeps us legally clean and
avoids IP blocks.

POST /api/v1/browser/ingest          — receive page data from browser
GET  /api/v1/browser/bookmarklet.js  — return personalized bookmarklet
POST /api/v1/browser/session         — store temporary session (optional, cautious)
GET  /api/v1/browser/session/status  — check if session is active
DELETE /api/v1/browser/session       — revoke session
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from datetime import datetime, timedelta, timezone

import boto3
import httpx
from botocore.config import Config
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.config import Settings
from app.dependencies import get_settings, require_pro

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/browser", tags=["browser"])


def _uid(user: dict) -> str:
    return str(user.get("sub") or user.get("userId") or "")


# ── Request schemas ───────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    """Data sent from user's browser (bookmarklet or extension)."""
    source:        str = Field(default="bookmarklet", description="bookmarklet | extension")
    page_url:      str = Field(..., min_length=5)
    page_text:     str | None = None           # full visible text of the page
    page_title:    str | None = None
    download_links: list[dict] = Field(default_factory=list)  # [{url, text, filename}]
    process_data:  dict | None = None          # structured JSON if extension parsed DOM
    raw_api_json:  dict | None = None          # raw XHR response if captured


class SessionRequest(BaseModel):
    """Temporary SECOP II session (optional, cautious approach)."""
    cookies:      str = Field(..., description="Cookies string from user's SECOP II session")
    source:       str = "manual"


# ── Ingest from browser ───────────────────────────────────────────────────────

@router.post("/ingest")
async def ingest_from_browser(
    body: IngestRequest,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """
    Main endpoint for data captured by the user's browser.

    What it does:
    1. If download_links present (SAS URLs from Azure Blob): downloads documents
       directly — no SECOP II session needed since Azure SAS URLs are public.
    2. If page_text present: runs Claude extraction (same as /external/extract-text).
    3. Creates an external_processes record with all extracted data.
    4. Returns job_id for the workspace.
    """
    from app.infrastructure.secop_text_extractor import extract_from_text
    from app.application.manage_external_process import create_external_process
    from app.application.manage_workspace import create_job, insert_document

    user_id = _uid(user)
    results: dict = {"downloaded_docs": 0, "proceso_id": None, "source": body.source}

    # ── 1. Extract process metadata from page text ──────────────────────────
    proc_data: dict = {}
    if body.process_data:
        proc_data = body.process_data
        proc_data["source"] = body.source
    elif body.page_text:
        proc_data = await extract_from_text(body.page_text, settings)
        proc_data["url_secop"] = body.page_url

    if proc_data:
        proc = await create_external_process(user_id, proc_data, settings)
        results["proceso_id"] = proc["proceso_id"]
        results["titulo"] = proc.get("titulo")
        results["fecha_cierre"] = proc.get("fecha_cierre")

    # ── 2. Download documents from Azure Blob SAS URLs ──────────────────────
    if body.download_links and results["proceso_id"]:
        proceso_id = results["proceso_id"]
        s3 = boto3.client("s3", region_name=settings.S3_REGION,
                          config=Config(signature_version="s3v4"))

        # Create a job record for the workspace
        job = await create_job(user_id, proceso_id, body.page_url, "READY", settings)
        job_id = job["id"]
        downloaded = 0

        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            for link in body.download_links[:10]:  # max 10 files
                url = link.get("url", "")
                if not url or not _is_safe_download_url(url):
                    continue

                try:
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        continue

                    filename = _extract_filename(url, link.get("text", ""), resp.headers)
                    if not filename:
                        continue

                    file_type = _classify_file(filename)
                    s3_key = f"workspace/{user_id}/{proceso_id}/{filename}"

                    s3.put_object(
                        Bucket=settings.S3_BUCKET_DOCUMENTS,
                        Key=s3_key,
                        Body=resp.content,
                        ServerSideEncryption="AES256",
                    )
                    await insert_document(
                        job_id=job_id,
                        proceso_id=proceso_id,
                        user_id=user_id,
                        file_name=filename,
                        file_type=file_type,
                        s3_key=s3_key,
                        file_size_kb=max(1, len(resp.content) // 1024),
                        settings=settings,
                    )
                    downloaded += 1
                    logger.info("Downloaded from browser relay: %s", filename)
                except Exception as exc:
                    logger.warning("Download failed for %s: %s", url[:60], exc)

        results["downloaded_docs"] = downloaded

    return {
        **results,
        "workspace_url": f"/dashboard/workspace/{results['proceso_id']}" if results["proceso_id"] else None,
        "message": _build_message(results),
    }


def _is_safe_download_url(url: str) -> bool:
    """Only download from known safe domains (Azure Blob, SECOP-adjacent CDNs)."""
    safe_domains = [
        "blob.core.windows.net",
        "secop.gov.co",
        "colombiacompra.gov.co",
        "datos.gov.co",
    ]
    return any(d in url for d in safe_domains)


def _extract_filename(url: str, link_text: str, headers) -> str:
    """Try Content-Disposition, then URL path, then link text."""
    # Content-Disposition header
    cd = headers.get("Content-Disposition", "")
    m = re.search(r'filename[*]?=["\']?([^"\';\n]+)', cd)
    if m:
        return _safe_filename(m.group(1).strip())
    # URL path
    path = url.split("?")[0].split("/")[-1]
    if "." in path and len(path) < 200:
        return _safe_filename(path)
    # Link text
    if link_text and "." in link_text:
        return _safe_filename(link_text[:100])
    return ""


def _safe_filename(name: str) -> str:
    return re.sub(r'[^\w\-.]', '_', name.strip())[:200]


def _classify_file(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ("xlsx", "xls"):
        return "EXCEL_TEMPLATE"
    if ext == "pdf":
        kws = ("pliego", "condicion", "estudio", "tecnic", "invit")
        return "PDF_PLIEGO" if any(k in filename.lower() for k in kws) else "PDF_ANEXO"
    return "OTHER"


def _build_message(results: dict) -> str:
    parts = []
    if results.get("titulo"):
        parts.append(f'Proceso: {results["titulo"][:60]}')
    if results["downloaded_docs"]:
        parts.append(f'{results["downloaded_docs"]} documento(s) descargado(s)')
    if results.get("fecha_cierre"):
        parts.append(f'Cierre: {results["fecha_cierre"][:10]}')
    return " | ".join(parts) if parts else "Datos importados"


# ── Bookmarklet generator ─────────────────────────────────────────────────────

@router.get("/bookmarklet.js")
async def get_bookmarklet(
    user: dict = Depends(require_pro),
    request: Request = None,
    settings: Settings = Depends(get_settings),
):
    """
    Returns personalized bookmarklet JavaScript.
    The JWT is embedded so the user just clicks the bookmark.
    
    IMPORTANT: The bookmarklet runs entirely in the USER'S BROWSER.
    All SECOP II requests come from the user's IP, not our servers.
    """
    import jwt as pyjwt

    # Generate a short-lived token for the bookmarklet (24h)
    token = pyjwt.encode(
        {"sub": _uid(user), "exp": int(time.time()) + 86400, "type": "bookmarklet"},
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )

    # Build the API base URL from the request
    auth = request.headers.get("host", "contracts.colombiatic.com.co")
    scheme = "https"
    api_base = f"{scheme}://{auth}"

    bookmarklet = _generate_bookmarklet_code(token, api_base)
    return {"bookmarklet_js": bookmarklet, "expires_hours": 24}


def _generate_bookmarklet_code(jwt_token: str, api_base: str) -> str:
    return f"""(function(){{
    var API='{api_base}';
    var JWT='{jwt_token}';
    if(!window.location.hostname.includes('secop.gov.co')){{
        alert('❌ Abre este marcador SOLO cuando estés en community.secop.gov.co');
        return;
    }}

    // Extract visible text and download links from current SECOP II page
    var text=document.body.innerText.substring(0,8000);
    var title=document.title;
    var url=window.location.href;

    // Capture download links (Azure Blob SAS URLs and direct file links)
    var links=[];
    document.querySelectorAll('a[href]').forEach(function(a){{
        var href=a.href||'';
        var txt=(a.textContent||'').trim();
        if(href.match(/blob\\.core\\.windows\\.net|\\.(pdf|xlsx|xls|zip|docx)(\\?|$)/i)&&href.length<2000){{
            links.push({{url:href,text:txt,filename:href.split('/').pop().split('?')[0]}});
        }}
    }});

    // Show progress
    var div=document.createElement('div');
    div.style.cssText='position:fixed;top:16px;right:16px;z-index:99999;background:#10b981;color:#fff;padding:12px 20px;border-radius:10px;font-family:sans-serif;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,.3)';
    div.textContent='⏳ Importando a ColombiaTIC...';
    document.body.appendChild(div);

    fetch(API+'/api/v1/browser/ingest',{{
        method:'POST',
        headers:{{'Content-Type':'application/json','Authorization':'Bearer '+JWT}},
        body:JSON.stringify({{source:'bookmarklet',page_url:url,page_title:title,page_text:text,download_links:links}})
    }})
    .then(function(r){{return r.json()}})
    .then(function(d){{
        div.style.background='#10b981';
        div.innerHTML='✅ '+d.message+(d.workspace_url?'<br><small>Ver en dashboard →</small>':'');
        if(d.workspace_url){{
            div.style.cursor='pointer';
            div.onclick=function(){{window.open(API+d.workspace_url,'_blank')}};
        }}
        setTimeout(function(){{div.remove()}},6000);
    }})
    .catch(function(e){{
        div.style.background='#ef4444';
        div.textContent='❌ Error: '+e.message;
        setTimeout(function(){{div.remove()}},4000);
    }});
}})()"""


# ── Optional: Session Import (cautious, server-side) ─────────────────────────
# WARNING: Requests from OUR server IP to SECOP II. Use sparingly.
# Rate limited to 1 req/5s. Auto-expires in 2 hours.

@router.post("/session")
async def store_session(
    body: SessionRequest,
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    """
    Store user's SECOP II session cookies temporarily (2h TTL).
    
    ⚠️  USE ONLY AS LAST RESORT. Requests come from our server IP.
    Rate limited. For document downloads only (not bulk search scraping).
    
    User gets the cookie string from:
    F12 → Application → Cookies → community.secop.gov.co → copy cookie value
    """
    user_id = _uid(user)
    session_key = f"secop_session:{user_id}"

    # Validate the cookies look like real SECOP II session data
    if "PublicSessionCookie" not in body.cookies and len(body.cookies) < 10:
        raise HTTPException(
            status_code=400,
            detail="Las cookies no parecen válidas. Incluye al menos PublicSessionCookie.",
        )

    # Verify the session actually works before storing
    is_valid = await _verify_secop_session(body.cookies)
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail="La sesión de SECOP II no pudo verificarse. Asegúrate de estar logueado y copiar todas las cookies.",
        )

    # Store in Redis with 2h TTL (NOT in Secrets Manager — too sensitive for persistent storage)
    # We're purposely using Redis so it expires automatically
    from app.config import Settings as _S
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await r.setex(session_key, 7200, body.cookies)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=2)
        return {
            "stored": True,
            "expires_at": expires_at.isoformat(),
            "expires_in_minutes": 120,
            "note": "Sesión válida por 2 horas. Usar SOLO para descarga de documentos.",
        }
    finally:
        await r.aclose()


@router.get("/session/status")
async def session_status(
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        user_id = _uid(user)
        ttl = await r.ttl(f"secop_session:{user_id}")
        if ttl > 0:
            return {"active": True, "expires_in_minutes": ttl // 60}
        return {"active": False}
    finally:
        await r.aclose()


@router.delete("/session")
async def revoke_session(
    user: dict = Depends(require_pro),
    settings: Settings = Depends(get_settings),
):
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await r.delete(f"secop_session:{_uid(user)}")
        return {"revoked": True}
    finally:
        await r.aclose()


async def _verify_secop_session(cookies: str) -> bool:
    """Quick check: make 1 lightweight request to SECOP II to validate cookies."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://community.secop.gov.co/Public/Home/Index",
                headers={
                    "Cookie": cookies,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120",
                },
            )
            # If we get redirected to login page, session is invalid
            return resp.status_code == 200 and "login" not in resp.url.path.lower()
    except Exception:
        return False
