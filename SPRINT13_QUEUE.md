# Sprint 13: Arquitectura de Queue Asíncrono

## El problema en detalle

```
Estado actual (1 uvicorn worker, sin queue):

[User 1] POST /evaluate → 10s Bedrock → responde  ← bloquea el worker 10s
[User 2] POST /evaluate → espera 10s (bloqueado)  ← timeout si hay 5+ usuarios
[User 3] POST /index-doc → 45s PDF+embed         ← otro bloqueo
[User 4] POST /workspace/upload → 30s ZIP        ← otro bloqueo

¿Qué pasa con 20 usuarios concurrentes evaluando?
→ El event loop se satura aunque asyncio maneje I/O concurrente:
  - asyncio.to_thread() para Bedrock funciona, pero crea N threads
  - BackgroundTasks en el mismo proceso compiten por CPU con las peticiones
  - asyncpg.connect() × 48 = 48 conexiones RDS en paralelo posible
```

## La solución: 3 capas

```
CAPA 1 — API (FastAPI, responde inmediato)
  Acepta petición → encola en Redis/ARQ → 202 inmediato
  
CAPA 2 — Job Workers (ARQ, proceso separado)  
  2-4 workers procesan jobs: Bedrock, ZIP, PDF, quote gen
  Desacoplado del API, escalable independientemente
  
CAPA 3 — Connection Pool (asyncpg pool)
  1 pool compartido vs 48 connexiones nuevas por request
  min=5 max=20 conexiones siempre disponibles
```

## Benchmarks estimados

| Escenario | Sin queue (actual) | Con queue + pool |
|-----------|-------------------|-----------------|
| 1 evaluación | ~10s respuesta | ~200ms (202) + 10s (worker) |
| 5 evaluaciones concurrentes | ~50s (serial) | ~10-15s (paralelo, 2 workers) |
| 10 evaluaciones concurrentes | timeout probable | ~25-30s |
| ZIP upload (10MB) | ~30s bloqueo | ~100ms (202) + 30s (worker) |
| 50 búsquedas SECOP concurrentes | OK (async HTTP) | OK (mejora con pool) |

## Qué hacer y en qué orden

### P0 — Hoy (alto impacto, bajo riesgo)
1. asyncpg connection pool en main.py
2. ARQ install + worker config  
3. Evaluaciones: POST /analyze → 202 inmediato + ARQ job
4. systemd service contracts-arq-worker

### P1 — Esta semana
5. Mover BackgroundTasks críticos a ARQ (ZIP, embedding, quote gen)
6. Alert worker → ARQ cron (sacar de uvicorn lifespan)
7. Aumentar uvicorn workers: 1 → 2

### P2 — Cuando escale
8. Mover ARQ workers a ECS Fargate (horizontal scaling)
9. RDS connection pooler (PgBouncer o RDS Proxy)
10. SQS para comunicación cross-service

## Tecnologías elegidas

### ARQ vs alternativas

| Opción | Pros | Contras | Encaje |
|--------|------|---------|--------|
| **ARQ** ✅ | asyncio nativo, Redis ya existe, minimal | Menos features que Celery | Perfecto |
| Celery | Maduro, muchas features | No asyncio nativo, bloat | Overkill |
| Huey | Simple | No async | No |
| SQS directo | AWS native | No polling nativo, más infra | Para fase 2 |
| FastAPI BackgroundTasks | Ya existe | Mismo proceso, no retry, no persistence | Insuficiente |

### asyncpg Pool vs connect()

| Patrón | Overhead | Conexiones RDS | Reconexión |
|--------|----------|---------------|------------|
| `asyncpg.connect()` actual | ~5-10ms por request | Ilimitadas (peligroso) | No retry |
| `asyncpg pool min=5 max=20` | ~0ms | Controladas | Auto-retry |

## Arquitectura final

```
nginx → FastAPI :8110 (2 uvicorn workers)
              │
              ├── Request Handler (responde < 200ms para jobs largos)
              ├── asyncpg Pool (5-20 conexiones RDS)
              └── ARQ Pool → Redis DB 3 (job queue)
                                │
                    ┌───────────┤
                    │           │
             ARQ Worker 1   ARQ Worker 2
             (evaluate_bid)  (embed + zip)
             (quote gen)     (external extract)
             Alert cron ←── (solo en worker 0)
```
