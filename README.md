# ColombiaTIC Contracts

**Inteligencia en Contratación Pública con IA**

Plataforma SaaS que conecta empresas colombianas con oportunidades de
contratación pública en SECOP II. Búsqueda inteligente, evaluación de
factibilidad con IA y gestión de licitaciones.

## URL

- **Producción**: https://contracts.colombiatic.com.co
- **API**: https://contracts.colombiatic.com.co/api/v1/
- **Health**: https://contracts.colombiatic.com.co/health

## Stack

| Componente | Tecnología | Puerto |
|---|---|---|
| Frontend | Next.js 14, Tailwind CSS, Framer Motion | 3300 |
| API | FastAPI, SQLAlchemy async, pgvector | 8098 |
| Auth & Pagos | RealCulture NestJS (tenant `contracts`) | 3007 |
| Base de datos | PostgreSQL (schema `contracts`) | RDS |
| Cache | Redis DB 2 | 6379 |
| IA | AWS Bedrock (Claude Haiku + Titan Embed v2) | — |

## Desarrollo local

```bash
# Backend API
cd api && python -m venv .venv && .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env  # completar variables
uvicorn app.main:app --reload --port 8098

# Frontend
cd frontend && npm install
cp .env.example .env.local  # completar variables
npm run dev
```

## Deploy a producción

```powershell
.\infra\deploy.ps1
```

## Documentación

- [`AGENTS.md`](./AGENTS.md) — contexto para agentes IA
- [`infra/`](./infra/) — nginx, systemd, Route53, SQL, deploy
- [`api/`](./api/) — FastAPI (arquitectura hexagonal)
- [`frontend/`](./frontend/) — Next.js 14 (App Router)
