# AGENTS.md — ColombiaTIC Contracts

## Qué es

Plataforma SaaS de inteligencia en contratación pública colombiana.
Dominio: `contracts.colombiatic.com.co`. Consulta procesos de SECOP II,
evalúa factibilidad con IA y ayuda a empresas a ganar licitaciones.

## Arquitectura

| Componente | Stack | Puerto | Ruta VM |
|---|---|---|---|
| Frontend | Vite + React 18, Tailwind, Framer Motion | `:3300` dev | `/opt/contracts-web/dist` |
| API SECOP | FastAPI, SQLAlchemy async, pgvector | `:8098` | `/opt/contracts-api` |
| Auth/Pagos | RealCulture NestJS (compartido) | `:3007` | `/opt/realculture` |
| Redis | Cache + freemium counter | `:6379` DB 2 | — |
| PostgreSQL | Schema `contracts` (mismo RDS) | RDS | — |
| AI | Bedrock: Haiku (evaluador) + Titan Embed v2 | — | — |

```
Browser → nginx (443) → /api/v1/* → FastAPI :8098
                       → /api/auth/* → NestJS :3007 (X-Tenant-ID: contracts)
                       → /assets/* → nginx static (Vite dist/, agresivo cache)
                       → /* → nginx sirve dist/index.html (SPA fallback)
```

> **Vite, no Node.js en producción**: nginx sirve `dist/` directamente.
> No hay proceso `node server.js`. El systemd `contracts-web.service` solo
> valida que `dist/index.html` exista.

## Dos sistemas — no mezclar

- **Contracts API** (`api/`) es FastAPI y gestiona su propio esquema PostgreSQL
  `contracts` vía Alembic. NestJS/TypeORM NUNCA toca este esquema.
- **RealCulture** (`../backend/`) gestiona auth, tenants, subscriptions y Wompi.
  Contracts es un tenant más: `slug = 'contracts'`.

## Monetización

| Capa | Acceso | Límite |
|---|---|---|
| Freemium (anónimo) | 3 búsquedas/día | Resultados parciales, sin URLs SECOP |
| Registrado FREE | Búsquedas ilimitadas parciales | Sin evaluador IA ni RAG |
| **PRO Licitador** | Todo | $149.000 COP/mes · $1.431.600/año (−20%) |

Pago vía Wompi (mismas credenciales que Atelier). Plan registrado como
`PRO_LICITADOR` en `realculture.pricing_plans`.

## Datos SECOP II

- API Socrata SODA v2: `https://www.datos.gov.co/resource/p6dx-8zbt.json`
- ~5M+ registros. Campos clave: `entidad`, `departamento_entidad`,
  `nombre_del_procedimiento`, `precio_base`, `modalidad_de_contratacion`,
  `codigo_principal_de_categoria` (UNSPSC), `urlproceso`.
- Cache en Redis: 15 min búsquedas, 6 h detalles.

## Reglas no negociables

- **JWT compartido**: el API verifica tokens localmente con `PyJWT` y el mismo
  `JWT_SECRET` de RealCulture. NO llama a RealCulture por HTTP (trampa de loopback
  documentada en `atelier.conf`).
- **`X-Tenant-ID: contracts`** lo inyecta nginx, NO el frontend. Previene spoofing.
- **Redis DB 2**: evita colisión con GovDocs (DB 0) y Atelier (DB 1).
- **pgvector**: embeddings Titan-1024 con índice HNSW/IVFFlat. Verificar que la
  extensión `vector` esté habilitada en RDS antes de correr migración.
- **VM sin aws-cli**: deploy por presigned URL (local `aws s3 presign` + `curl` en VM).
- **`AWS_REGION`** en `Environment=` de systemd, no solo en `.env` (se lee al importar
  `config.py` vía pydantic-settings).

## Desarrollo local

```bash
# API
cd contracts/api
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8098

# Frontend
cd contracts/frontend
npm install
npm run dev   # http://localhost:3300
```

## Deploy

```powershell
# Desde la raíz del monorepo
.\contracts\infra\deploy.ps1
```

El script: build frontend (standalone) → empaqueta API → sube S3 presigned →
SSH a VM → descarga, extrae, instala deps → copia systemd/nginx → habilita
servicios → smoke test.

## Estructura del proyecto

```
contracts/
├── AGENTS.md              ← este archivo
├── frontend/              ← Next.js 14 (App Router, standalone)
│   ├── src/app/           ← Páginas: /, /buscar, /auth, /dashboard, /pricing
│   ├── src/components/    ← search/, pricing/, layout/
│   └── src/lib/           ← constants (pricing, departamentos), utils
├── api/                   ← FastAPI (hex arch: domain/application/infrastructure)
│   ├── app/api/           ← Routers: secop, company, evaluation, alert, health
│   ├── app/domain/        ← Models (Pydantic frozen) + ports (ABC)
│   ├── app/infrastructure/← Adaptadores: SODA, Bedrock, PostgreSQL, Redis, S3
│   └── app/application/   ← Use cases
└── infra/                 ← nginx conf, systemd units, Route53, SQL, deploy.ps1
```
