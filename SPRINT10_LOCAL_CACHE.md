# Sprint 10: Local SECOP Cache — Freshness < 2h sin depender de SODA

> Problema confirmado: SODA API tiene lag real de 2-7 días.
> El proceso EC-0702026 (SDA, publicado Nov 5) no aparece en SODA 2 días después.
> 
> Solución: cache incremental local en RDS + worker que sincroniza cada 2h.

---

## Diagnóstico de Frescura (investigación Nov 7 2026)

| Fuente | Frescura real | Nuestro uso |
|--------|--------------|-------------|
| `datos.gov.co/resource/p6dx-8zbt.json` (SODA) | **2-7 días lag** (docs dicen "diario" pero en práctica varía) | Actual — única fuente |
| `community.secop.gov.co` | **Tiempo real** | No usado — requiere sesión autenticada para documentos |
| `api.colombiacompra.gov.co` (OCDS) | ~24h lag + instable | No viable (timeouts) |

**Conclusión**: Para procesos publicados HOY, SODA los tendrá en 2-7 días.
Nuestro sistema es un "buscador del pasado", no del presente.

---

## Solución: Local SECOP Cache (Sprint 10)

### Arquitectura

```
SODA API (datos.gov.co)
      │  cada 2h
      ▼
SeceopSyncWorker (extiende secop_sync_worker.py)
  ├─ Strategy A: fecha_de_publicacion_del >= now-3h (captura procesos con fecha)
  ├─ Strategy B: COUNT total SODA vs COUNT local → si subió, fetch tail
  └─ UPSERT → contracts.secop_processes_cache (RDS PostgreSQL)
      │
      ▼
SearchSecop UseCase (MODIFICADO)
  ├─ 1. Query contracts.secop_processes_cache (< 1ms, pg_trgm)
  ├─ 2. Fallback SODA API si local vacío / primer arranque
  └─ 3. Muestra badge "Actualizado hace X horas" en resultados
```

### Por qué PostgreSQL y no Elasticsearch/Redis

- **Ya tenemos el RDS** — cero costo adicional de infraestructura
- `pg_trgm` + GIN index da full-text search comparable a Elasticsearch para 500K procesos
- `tsvector` en español maneja acentos, plurales, variaciones
- `$vectorSearch` con pgvector para búsqueda semántica futura (ya lo usamos)
- Costo: **$0 adicional** vs ~$150-400/mes de OpenSearch

### Tabla nueva

```sql
CREATE TABLE contracts.secop_processes_cache (
    proceso_id      VARCHAR(100) PRIMARY KEY,
    nombre          TEXT          NOT NULL DEFAULT '',
    entidad         VARCHAR(500)  NOT NULL DEFAULT '',
    nit_entidad     VARCHAR(30),
    departamento    VARCHAR(200),
    ciudad          VARCHAR(200),
    modalidad       VARCHAR(200),
    tipo_contrato   VARCHAR(200),
    estado          VARCHAR(100),
    precio_base     NUMERIC(18,2),
    unspsc          VARCHAR(100),
    url_proceso     TEXT,
    fecha_pub       TIMESTAMPTZ,
    -- Sync metadata
    soda_synced_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    raw_json        JSONB,        -- full SODA row, flexible for future fields
    -- Full-text search vector (auto-computed)
    search_tsv      TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('spanish',
            coalesce(nombre,'') || ' ' ||
            coalesce(entidad,'') || ' ' ||
            coalesce(departamento,'') || ' ' ||
            coalesce(modalidad,'')
        )
    ) STORED
);

-- Indexes for search
CREATE INDEX ix_secop_cache_tsv    ON contracts.secop_processes_cache USING GIN (search_tsv);
CREATE INDEX ix_secop_cache_estado  ON contracts.secop_processes_cache (estado, fecha_pub DESC NULLS LAST);
CREATE INDEX ix_secop_cache_dept    ON contracts.secop_processes_cache (departamento);
CREATE INDEX ix_secop_cache_unspsc  ON contracts.secop_processes_cache (unspsc);
CREATE INDEX ix_secop_cache_synced  ON contracts.secop_processes_cache (soda_synced_at DESC);

-- Metadata table: tracks last sync state
CREATE TABLE contracts.secop_sync_state (
    id              INT  PRIMARY KEY DEFAULT 1,  -- singleton
    last_soda_count BIGINT DEFAULT 0,
    last_synced_at  TIMESTAMPTZ DEFAULT now(),
    last_fetch_rows INT  DEFAULT 0
);
INSERT INTO contracts.secop_sync_state DEFAULT VALUES;
```

### Worker incremental (2 estrategias en paralelo)

```python
async def _sync_cycle(settings: Settings, gateway: SecopSodaGateway) -> int:
    """
    One sync cycle. Returns number of new/updated processes stored.

    Strategy A: Fetch by recent fecha_de_publicacion_del (catches dated processes)
    Strategy B: Detect SODA count increase (catches null-dated recent processes)
    """
    conn = await asyncpg.connect(get_pg_url(settings))
    try:
        synced = 0

        # ── Strategy A: date-based ────────────────────────────────────────
        since = datetime.now(timezone.utc) - timedelta(hours=3)
        result_a = await gateway.search(SecopFilter(
            fecha_desde=since,
            estado='todos',    # all states
            limit=100,
            offset=0,
        ))
        synced += await _upsert_processes(conn, result_a.results)

        # ── Strategy B: count-based (catches null-dated new records) ─────
        soda_count = await _get_soda_total_count(gateway)
        state = await conn.fetchrow("SELECT * FROM contracts.secop_sync_state WHERE id=1")
        last_count = state['last_soda_count'] if state else 0

        if soda_count > last_count:
            # New records were added — fetch the tail
            new_records = soda_count - last_count
            if new_records < 500:  # sanity check
                result_b = await gateway.search(SecopFilter(
                    estado='todos',
                    limit=min(new_records + 50, 100),
                    offset=max(0, last_count - 20),  # slight overlap
                ))
                synced += await _upsert_processes(conn, result_b.results)

        # Update sync state
        await conn.execute(
            """UPDATE contracts.secop_sync_state
               SET last_soda_count=$1, last_synced_at=now(), last_fetch_rows=$2
               WHERE id=1""",
            soda_count, synced,
        )
        return synced
    finally:
        await conn.close()
```

### Search endpoint (modificado)

```python
async def execute(filters, plan_tier, client_ip):
    # 1. Try local cache first (fast, always fresh to last 2h)
    if await cache.has_local_data():
        local_results = await search_local_cache(filters)
        if local_results.total > 0:
            return local_results

    # 2. Fallback: SODA API (for cache warmup or cache miss)
    return await self._gateway.search(filters)
```

---

## Plan de implementación (1 semana)

### Día 1-2: Tablas + Worker
- Crear `secop_processes_cache` y `secop_sync_state` en RDS
- Implementar `secop_cache_sync_worker.py`
- Warm-up inicial: sync últimas 4 semanas desde SODA (~10K procesos)
- Wire en `main.py` (alongside existing alert_worker)

### Día 3-4: Search desde cache
- Modificar `SearchSecop` use case para consultar la tabla local primero
- Implementar `search_local_cache()` con `to_tsquery('spanish', q)` + filtros
- Fallback transparente a SODA si cache está vacío

### Día 5: Frontend
- Añadir "Actualizado hace X horas" en la barra de búsqueda
- Botón "Abrir en SECOP II" en `ProcessDetailModal` (ya existe el `url_proceso`)
- Para procesos MUY recientes (últimas 2h): badge "⚡ Nuevo"

### Resultado esperado
- Proceso publicado hoy → en nuestra búsqueda en ≤ 2 horas
- Búsquedas: sub-2ms (vs 300-3000ms actual con SODA)
- No se pierden procesos con fechas nulas (Estrategia B los captura)

---

## Respuesta a las preguntas del usuario

### ¿La API está fallando o está fallando nuestro modo de extraer?

**La SODA API funciona, pero tiene lag estructural de 2-7 días.**
Nuestro extractor está correcto — encontramos 4 procesos de SDA de Nov 3.
El problema es que `EC-0702026` (publicado Nov 5) simplemente no llegó todavía a SODA.

### ¿Es razonable hacer scraping diario del SECOP?

**No** en el sentido de scraping de la web (HTML). Pero sí es razonable:
- **Sincronización incremental del SODA** (tabla local) → lo que proponemos
- El SODA es una API pública legítima, no scraping web
- Nosotros somos consumidores legítimos de datos abiertos

### ¿Agente observador (Strands)?

Los Bedrock Agents / Strands son para orquestación de LLM. Lo que necesitamos aquí es un **worker de sincronización de datos** — que ya tenemos con el patrón del `secop_sync_worker.py`. Lo extendemos.

### ¿Copias diarias y procesamos internamente?

**Sí — exactamente lo que propone este sprint.** Cada 2 horas (no diarias) sincronizamos los nuevos procesos de SODA a nuestro RDS. Los usuarios buscan en nuestra copia local (rápida y reciente) en vez de golpear SODA directamente en cada búsqueda.
