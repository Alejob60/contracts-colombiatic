# Sprint 9-B: Módulo "Workspace de Proceso" + "Asistente de Ejecución Contractual"

> **Reemplaza** el "SIA OBSERVA Auto-Reporter" descartado.  
> Versión corregida tras auditoría técnica de 10 hallazgos críticos.  
> Fecha: 2026-11-07

---

## Por qué el plan original fue descartado

El auditor encontró 10 problemas, 3 son plan-breaking:

| # | Severidad | Hallazgo |
|---|-----------|---------|
| 1 | 🔴 CRÍTICO | **SIA OBSERVA no es del contratista** — es el portal de rendición de cuentas de *entidades* ante la Auditoría General. Los contratistas NO tienen cuentas ahí. El módulo apuntaba al usuario equivocado. |
| 2 | 🔴 CRÍTICO | **SECOP II transaccional requiere Firma Digital (certificado .p12)** — no usuario/contraseña. Imposible automatizar login programáticamente. |
| 3 | 🔴 CRÍTICO | **Los selectores CSS `.valor-total`, `.acta-inicio-numero` son inventados** — SECOP II es una Angular SPA con clases ofuscadas. No existe selector verificado. |
| 4 | 🔴 ALTO | **Almacenar credenciales de portales del Estado viola Ley 1273/2009** — riesgo penal, SIC puede multar hasta 2.000 SMMLV. |
| 5 | 🔴 ALTO | **ScrapingBee ($199/mes) no sirve para sesiones autenticadas** — solo bypass de Cloudflare en páginas públicas (ya tenemos `curl_cffi` para eso, gratis). |
| 6 | 🔴 ALTO | **La "sesión Playwright → navegador del usuario" es imposible** — cookies `SameSite=Strict` + IP-bound no se pueden transferir. |
| 7 | 🟡 ALTO | **OCDS API `api.colombiacompra.gov.co` tiene timeout** — necesita validarse desde la VM antes de construir Sprint 10 sobre ella. |
| 8 | 🟡 ALTO | **Economía negativa**: $241/mes costo vs $220/mes ingreso por usuario Enterprise = pérdida. |

**Conclusión del auditor**: `BLOCK — plan-breaking issues confirmed with primary evidence`

---

## El problema real del contratista (re-investigado)

Lo que realmente duele al contratista colombiano mensualmente:

1. **Redactar el "Informe de Avance Mensual"** — documento que sube a SECOP II describiendo qué ejecutó ese mes, qué porcentaje lleva, qué evidencias tiene.
2. **Elaborar las "Actas"** — Acta de Inicio, Acta de Modificación, Acta de Liquidación — con lenguaje jurídico correcto según Ley 80/93 y Decreto 1082/2015.
3. **Armar el "Estudio de Mercado"** / cotización cuando la entidad lo solicita para un contrato nuevo.
4. **Completar la rendición ante la Contraloría** — si el contratista es también una entidad (municipios pequeños) SÍ usan SIA OBSERVA para sus propios contratos. Pero eso es un nicho Enterprise muy específico.

Nada de esto requiere login programático. Todo requiere **generación de texto con IA**.

---

## Módulo rediseñado: "Workspace de Proceso"

### Qué hace

Dado un proceso SECOP II que el usuario guarda en su watchlist:
1. **Descarga el ZIP** de documentos (páginas públicas — ya validado que funciona)
2. **Clasifica y muestra** los documentos descargados
3. **Genera borradores** de los documentos que el contratista debe producir:
   - Cotización / propuesta técnica-económica
   - Informe de avance mensual (si ya ganó el contrato)
   - Actas de ejecución
4. **Auto-llena Excel** de formatos con datos del perfil corporativo del usuario

El usuario **descarga el PDF/Excel generado** y lo sube manualmente a SECOP II.
Ningún login, ninguna credencial almacenada, ninguna automatización de portales del Estado.

### Comparación: plan original vs. plan optimizado

| Aspecto | Plan Original (descartado) | Plan Optimizado |
|---------|--------------------------|----------------|
| Login SECOP II | ✅ user/password en Secrets Manager | ❌ No necesario — datos públicos |
| CSS selectors SECOP | Inventados | ❌ No necesario — ZIP descarga directa |
| SIA OBSERVA | Login automatizado + pre-fill form | ❌ Fuera del scope — entidades, no contratistas |
| ScrapingBee $199/mes | ✅ Requerido | ❌ Eliminado — curl_cffi ya funciona |
| Break-even | Negativo (−$21/usuario) | ✅ Positivo (+$178/usuario PRO) |
| Riesgo legal | Ley 1273/2009 (penal) | ✅ Cero — solo documentos públicos |
| Tiempo entrega | 8 semanas | 2 semanas (Sprint 9) |

---

## Sprint 9 Optimizado — Workspace de Proceso (2 semanas)

### Arquitectura corregida

```
Usuario PRO hace click "Abrir Workspace" en ProcessDetailModal
         │
         ▼
POST /api/v1/process/{id}/fetch-documents
         │
         ▼ (responde inmediatamente con job_id)
SQS: secop-docs-jobs
         │
         ▼
ECS Fargate Worker (curl_cffi, NO ScrapingBee, NO login)
  ├─ url_proceso del campo SODA (página pública)
  ├─ Localiza enlace "Descargar documentos del proceso"
  ├─ Descarga ZIP (1 request)
  └─ PUT S3 raw/{proceso_id}/docs.zip
         │
         ▼ S3 Event
Lambda ZIP Extractor
  ├─ Unzip en memoria
  ├─ Clasifica: EXCEL_TEMPLATE / PDF_PLIEGO / PDF_ANEXO / OTHER
  ├─ PUT S3 extracted/{proceso_id}/{filename}
  └─ INSERT process_documents (DB)
         │
         ▼ (usuario hace click "Generar cotización")
POST /api/v1/process/{id}/generate-quote
         │
         ▼
API Python (asyncio, en-process, NO Lambda adicional)
  ├─ GET S3 Excel template
  ├─ SELECT company_profiles WHERE user_id=$1
  ├─ openpyxl: mapea celdas → datos empresa
  ├─ asyncio.to_thread(Bedrock): analiza celdas ambiguas
  ├─ PUT S3 processed/{user_id}/{proceso_id}/cotizacion_prellenada.xlsx
  └─ Retorna: {download_url, fill_pct, cell_mapping}
         │
         ▼
Usuario descarga Excel pre-llenado (firma y sube a SECOP II manualmente)
```

### Tablas DB nuevas (sin cambio respecto al plan original)

```sql
CREATE TABLE contracts.process_fetch_jobs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proceso_id  VARCHAR(100) NOT NULL,
    user_id     UUID NOT NULL,
    url_proceso TEXT NOT NULL,
    status      VARCHAR(20) DEFAULT 'QUEUED'
                CHECK (status IN ('QUEUED','DOWNLOADING','EXTRACTING','READY','FAILED')),
    error_msg   TEXT,
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE contracts.process_documents (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id       UUID REFERENCES contracts.process_fetch_jobs(id),
    proceso_id   VARCHAR(100) NOT NULL,
    user_id      UUID NOT NULL,
    file_name    VARCHAR(500) NOT NULL,
    file_type    VARCHAR(20) NOT NULL
                 CHECK (file_type IN ('EXCEL_TEMPLATE','PDF_PLIEGO','PDF_ANEXO','OTHER')),
    s3_key       TEXT NOT NULL,
    file_size_kb INTEGER,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE contracts.generated_quotes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proceso_id    VARCHAR(100) NOT NULL,
    user_id       UUID NOT NULL,
    source_doc_id UUID REFERENCES contracts.process_documents(id),
    s3_key        TEXT NOT NULL,
    fill_pct      INTEGER DEFAULT 0,
    cell_mapping  JSONB,
    status        VARCHAR(20) DEFAULT 'PROCESSING'
                  CHECK (status IN ('PROCESSING','READY','FAILED')),
    generated_at  TIMESTAMPTZ DEFAULT now()
);
```

### Código del worker (versión producción corregida)

```python
# secop_zip_worker.py — ECS Fargate worker, sin ScrapingBee, sin login
"""
Descarga el ZIP de documentos de un proceso SECOP II usando curl_cffi
(bypass de Cloudflare sin costo). Solo accede a páginas PÚBLICAS.
Sin credenciales de usuario. Sin Secrets Manager.
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
import re
import zipfile
from typing import TYPE_CHECKING

import boto3
from curl_cffi.requests import AsyncSession

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)
s3 = boto3.client("s3")
BUCKET = "contracts-documents-520847769480"


async def fetch_process_zip(
    proceso_id: str,
    url_proceso: str,
    job_id: str,
) -> list[str]:
    """
    Navega la URL pública del proceso en SECOP II, localiza el botón
    "Descargar todos los documentos", descarga el ZIP y lo sube a S3.

    Returns: lista de s3_keys de archivos extraídos.
    """
    raw_key = f"raw/{proceso_id}/docs.zip"

    async with AsyncSession(impersonate="chrome110") as session:
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "es-CO,es;q=0.9,en;q=0.8",
            "Referer": "https://www.secop.gov.co/",
        }

        # Paso 1: navegar a la página del proceso (pública, sin login)
        resp = await session.get(url_proceso, headers=headers, timeout=30)
        resp.raise_for_status()

        # Paso 2: buscar el enlace de descarga del ZIP en el HTML
        # Patrón real: href que contiene "DownloadAll" o "documentos" + ".zip"
        # NOTA: los selectores exactos deben verificarse inspeccionando
        # una página real de SECOP II en navegador.
        zip_url = _extract_download_link(url_proceso, resp.text)
        if not zip_url:
            raise RuntimeError(
                f"No se encontró enlace de descarga ZIP en {url_proceso}. "
                "Revisar selectores en _extract_download_link."
            )

        # Paso 3: descargar el ZIP (puede pesar 10-50 MB)
        logger.info("Descargando ZIP desde %s", zip_url)
        zip_resp = await session.get(zip_url, headers=headers, timeout=120)
        zip_resp.raise_for_status()

    # Paso 4: subir ZIP crudo a S3
    s3.put_object(
        Bucket=BUCKET,
        Key=raw_key,
        Body=zip_resp.content,
        ServerSideEncryption="aws:kms",
    )
    logger.info("ZIP subido a s3://%s/%s (%d KB)", BUCKET, raw_key, len(zip_resp.content) // 1024)

    # Paso 5: extraer y clasificar archivos
    extracted_keys: list[str] = []
    with zipfile.ZipFile(io.BytesIO(zip_resp.content)) as zf:
        for name in zf.namelist():
            if zf.getinfo(name).is_dir():
                continue
            file_bytes = zf.read(name)
            file_type = _classify(name)
            s3_key = f"extracted/{proceso_id}/{name}"
            s3.put_object(
                Bucket=BUCKET,
                Key=s3_key,
                Body=file_bytes,
                ServerSideEncryption="aws:kms",
                Metadata={"file_type": file_type, "proceso_id": proceso_id},
            )
            extracted_keys.append(s3_key)
            logger.info("Extraído: %s (%s, %d KB)", name, file_type, len(file_bytes) // 1024)

    return extracted_keys


def _extract_download_link(base_url: str, html: str) -> str | None:
    """
    Extrae el URL del botón de descarga de documentos del proceso.

    ⚠️ TAREA PENDIENTE DE INVESTIGACIÓN:
    Antes de producción, abrir Chrome DevTools en una URL real de SECOP II
    y buscar el enlace que descarga el ZIP. Actualizar este método con el
    patrón real. Opciones comunes:
    - href que contenga "DownloadAll", "descargar-todo", "GetDocuments"
    - Botón con texto "Descargar documentos del proceso"
    - Endpoint tipo: /Process/DownloadDocuments?id=XXXXX
    """
    # Patrones candidatos (verificar contra HTML real)
    patterns = [
        r'href="([^"]*[Dd]ownload[Aa]ll[^"]*)"',
        r'href="([^"]*[Gg]et[Dd]ocuments[^"]*)"',
        r'href="([^"]*descargar[^"]*\.zip[^"]*)"',
        r'href="([^"]*download[^"]*documents[^"]*)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            href = match.group(1)
            if href.startswith("http"):
                return href
            # Relativo → absoluto
            from urllib.parse import urljoin
            return urljoin(base_url, href)
    return None


def _classify(filename: str) -> str:
    name_lower = filename.lower()
    ext = name_lower.rsplit(".", 1)[-1] if "." in name_lower else ""
    if ext in ("xlsx", "xls"):
        # Cotizaciones, formatos, matrices
        return "EXCEL_TEMPLATE"
    if ext == "pdf":
        kws_pliego = ("pliego", "condiciones", "estudios_previos", "invitacion")
        if any(k in name_lower for k in kws_pliego):
            return "PDF_PLIEGO"
        return "PDF_ANEXO"
    return "OTHER"
```

### Tasks del Sprint 9 (corregidas)

| ID | Task | Descripción | Prioridad |
|----|------|-------------|-----------|
| S9-T1 | Script DB + ejecutar | `create_sprint9_tables.py` — 3 tablas vía asyncpg | P0 |
| S9-T2 | **Investigación de selectores** (Día 1) | Abrir Chrome DevTools en 5 URLs reales de `url_proceso` de nuestra BD, documentar el enlace de descarga ZIP real. Sin esto T3 no se puede escribir. | P0 🔴 |
| S9-T3 | Worker `secop_zip_worker.py` | curl_cffi (NO ScrapingBee), `_extract_download_link` con selectores reales del T2 | P0 |
| S9-T4 | Lambda ZIP extractor | S3 trigger → unzip → clasificar → `process_documents` DB | P0 |
| S9-T5 | `template_autofiller.py` | openpyxl + Bedrock Haiku para celdas ambiguas → `generated_quotes` | P0 |
| S9-T6 | API endpoints | POST fetch, GET documents, POST generate-quote, GET job status | P0 |
| S9-T7 | Presigned URLs S3 | `generate_presigned_url(sigv4)`, 15 min TTL, solo para `user_id` propietario | P0 |
| S9-T8 | Docker + ECR + ECS | Playwright + curl_cffi container, Fargate 0.5vCPU 1GB, SPOT | P0 |
| S9-T9 | IAM: política mínimo privilegio | ECS task role: S3 solo bucket contracts-documents, SQS solo cola secop-docs | P0 |
| S9-T10 | Frontend `ProcesoWorkspacePage` | Progress states, lista docs con iconos, botón generar cotización, download | P0 |
| S9-T11 | Tests end-to-end | 5 procesos reales con Excel → validar fill_pct ≥ 70% | P1 |
| S9-T12 | CloudWatch métricas | `zip_download_success_rate`, alertar si < 90% | P1 |

### Criterio de éxito

- [ ] Investigación de selectores CSS documentada con screenshots reales **antes de escribir código**
- [ ] Pipeline ZIP → extract → autofill funciona en ≥ 3 tipos de Excel de entidades distintas
- [ ] `fill_pct ≥ 70%` en promedio sobre 5 contratos reales
- [ ] Cero credenciales de usuario almacenadas
- [ ] Cero llamadas a ScrapingBee (→ $0 costo adicional)
- [ ] Tiempo total usuario (click → descarga cotización): < 3 minutos

### Costo corregido Sprint 9

| Servicio | Uso mensual | Costo |
|----------|------------|-------|
| ECS Fargate (curl_cffi worker) | 50h × $0.04 | ~$2 |
| Lambda (ZIP processor) | 500 inv. | ~$0 |
| S3 (docs + quotes) | 20 GB | ~$0.46 |
| SQS | 10K msgs | ~$0.01 |
| Bedrock Haiku (autofill) | 200 calls | ~$0.10 |
| **Total Sprint 9 incremental** | | **~$3/mes** |

Con el costo total acumulado de ~$170/mes y cualquier usuario PRO a $149k COP (~$35/mes):
**Break-even en 5 usuarios PRO. Margen positivo con ≥ 6.**

---

## Sprint 10 (condicional): OCDS API + Capacidad Residual

**BLOQUEADO hasta validar la OCDS API desde la VM de producción.**

```bash
# Validar desde la VM antes de arrancar Sprint 10
curl -v "https://api.colombiacompra.gov.co/releases/?status=active&limit=1" 2>&1
```

Si responde en < 5s: Sprint 10 procede como planeado.  
Si timeout: Sprint 10 se replantea solo con datos SODA + datos que el usuario suba.

---

## Módulo "Asistente de Ejecución Contractual" (añadido al backlog Sprint 11)

Este es el módulo que SÍ resuelve el dolor de la ejecución mensual, sin tocar portales del Estado:

### Qué hace
1. Usuario llena un formulario en nuestro dashboard: "Qué ejecutaste este mes"
   - Actividades completadas (texto libre)
   - % de avance físico estimado
   - Valor ejecutado este periodo
   - Fecha de inicio real, plazo vigente
2. Sistema genera (Bedrock Claude Sonnet):
   - **Informe de Avance Mensual** — con lenguaje jurídico (Ley 80, D. 1082/2015)
   - **Acta de Ejecución** — formato estándar con los campos que pide SECOP II
   - **Resumen para Supervisión** — documento que el supervisor del contrato aprueba
3. Usuario descarga el Word/PDF y lo sube manualmente a SECOP II

### Por qué no es SIA OBSERVA
- SIA OBSERVA es para **entidades** que rinden cuentas a la **Contraloría General**
- Los contratistas individuales reportan su ejecución directamente **en SECOP II**
- Si el usuario es una **entidad pública pequeña** (alcaldía, fondo, etc.) que también contrata, entonces SÍ usa SIA OBSERVA — pero eso es un nicho Enterprise separado que requiere investigación adicional antes de construir

---

## Resumen ejecutivo

| Plan original | Plan optimizado |
|---|---|
| SIA OBSERVA (portal equivocado) | Ejecución en SECOP II (portal correcto) |
| Login con credenciales (ilegal) | Documentos públicos (sin credenciales) |
| ScrapingBee $199/mes | curl_cffi $0 |
| CSS selectors inventados | Investigación real antes de código |
| Economía negativa | Break-even con 5 usuarios |
| 8 semanas, riesgo alto | 2 semanas, riesgo bajo |
| Riesgo penal Ley 1273/2009 | Cero riesgo legal |
