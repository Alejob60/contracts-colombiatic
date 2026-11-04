-- =============================================================================
-- 001_create_schema.sql — ColombiaTIC Contracts database schema
--
-- Target: RDS PostgreSQL (realculture-postgres.c4zw8acc2goo.us-east-1.rds.amazonaws.com)
-- Schema: contracts  (same RDS instance as govdocs + realculture, separate schema)
-- Extensions: pgvector (vector similarity for document chunk embeddings)
-- Run as: psql -h <host> -U postgres -d colombiatic -f 001_create_schema.sql
--
-- Conventions:
--   - All tables use UUID primary keys (gen_random_uuid) for portability.
--   - Timestamps are TIMESTAMPTZ (always UTC), defaulting to NOW().
--   - VARCHAR lengths follow Colombian data constraints (NIT=12, etc.).
--   - Indexes are named ix_<table>_<columns> for clarity.
-- =============================================================================

-- ── Schema + Extension ──────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS contracts;
SET search_path TO contracts, public;

-- pgvector must exist in public (shared across schemas)
CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;

-- ── Enums ───────────────────────────────────────────────────────────────────

CREATE TYPE contracts.document_type AS ENUM (
    'RUP',              -- Registro Único de Proponentes
    'FINANCIAL',        -- Estados financieros / certificación
    'EXPERIENCE',       -- Certificados de experiencia
    'LEGAL_REP',        -- Certificado de existencia y representación legal
    'OTHER'
);

CREATE TYPE contracts.eval_status AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);

CREATE TYPE contracts.feasibility AS ENUM (
    'VIABLE',           -- company likely meets all requirements
    'PARTIAL',          -- meets some but not all
    'NOT_VIABLE',       -- critical gaps exist
    'INSUFFICIENT_DATA'
);

CREATE TYPE contracts.risk_severity AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

CREATE TYPE contracts.alert_frequency AS ENUM (
    'REALTIME',         -- push on match
    'DAILY',            -- daily digest
    'WEEKLY'            -- weekly digest
);

-- ── Tables ──────────────────────────────────────────────────────────────────

-- 1. Company profiles — one per bidder entity
CREATE TABLE contracts.company_profiles (
    company_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- owner_user_id links to realculture.users(id) for auth/subscription gating
    owner_user_id       UUID NOT NULL,
    nit                 VARCHAR(12) NOT NULL,
    razon_social        VARCHAR(300) NOT NULL,
    representante_legal VARCHAR(200),
    email               VARCHAR(254),
    telefono            VARCHAR(20),
    departamento        VARCHAR(80),
    ciudad              VARCHAR(80),
    -- UNSPSC codes stored as JSONB array: ["43211500", "72141000"]
    unspsc_codes        JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NIT is unique per tenant but companies can have multiple profiles (branches)
CREATE UNIQUE INDEX ix_company_profiles_nit
    ON contracts.company_profiles (nit);
CREATE INDEX ix_company_profiles_owner
    ON contracts.company_profiles (owner_user_id);

-- 2. Company documents — PDFs uploaded for RAG ingestion
CREATE TABLE contracts.company_documents (
    document_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES contracts.company_profiles(company_id) ON DELETE CASCADE,
    document_type   contracts.document_type NOT NULL,
    filename        VARCHAR(500) NOT NULL,
    s3_key          VARCHAR(1024) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    file_size_bytes BIGINT NOT NULL DEFAULT 0,
    chunk_count     INT NOT NULL DEFAULT 0,
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_company_documents_company
    ON contracts.company_documents (company_id);

-- 3. Document chunks — text extracted from PDFs, with pgvector embeddings
--    Embedding dimension 1024 matches Amazon Titan Embed Text v2
CREATE TABLE contracts.document_chunks (
    chunk_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES contracts.company_documents(document_id) ON DELETE CASCADE,
    company_id      UUID NOT NULL REFERENCES contracts.company_profiles(company_id) ON DELETE CASCADE,
    page_number     INT NOT NULL DEFAULT 0,
    chunk_index     INT NOT NULL DEFAULT 0,
    text            TEXT NOT NULL,
    token_count     INT NOT NULL DEFAULT 0,
    -- 1024-dimensional vector from Amazon Titan Embed Text v2
    embedding       vector(1024),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_document_chunks_document
    ON contracts.document_chunks (document_id);
CREATE INDEX ix_document_chunks_company
    ON contracts.document_chunks (company_id);
-- HNSW index for approximate nearest-neighbor vector search (cosine distance)
-- ef_construction=128, m=16 are production-grade defaults for ~100k vectors
CREATE INDEX ix_document_chunks_embedding
    ON contracts.document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- 4. Bid evaluations — AI-generated analysis of company vs. SECOP process
CREATE TABLE contracts.bid_evaluations (
    evaluation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES contracts.company_profiles(company_id) ON DELETE CASCADE,
    -- SECOP process ID (e.g. "CO1.PCCNTR.1234567") — external, not a FK
    proceso_id      VARCHAR(200) NOT NULL,
    status          contracts.eval_status NOT NULL DEFAULT 'PENDING',
    -- Full analysis stored as JSONB (EvaluationAnalysis schema)
    analysis        JSONB,
    model_id        VARCHAR(100),
    error_message   TEXT,
    requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX ix_bid_evaluations_company
    ON contracts.bid_evaluations (company_id);
CREATE INDEX ix_bid_evaluations_proceso
    ON contracts.bid_evaluations (proceso_id);
-- Compound index for "my evaluations" dashboard sorted by date
CREATE INDEX ix_bid_evaluations_company_date
    ON contracts.bid_evaluations (company_id, requested_at DESC);

-- 5. SECOP process cache — local cache of frequently accessed processes
--    to avoid hammering the Socrata API on repeated searches
CREATE TABLE contracts.secop_cache (
    proceso_id              VARCHAR(200) PRIMARY KEY,
    raw_json                JSONB NOT NULL,
    entidad                 VARCHAR(500),
    departamento            VARCHAR(80),
    modalidad               VARCHAR(100),
    precio_base             NUMERIC(18, 2),
    fecha_publicacion       TIMESTAMPTZ,
    fetched_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- TTL enforcement: cached entries older than SECOP_CACHE_TTL_DETAIL are stale
    expires_at              TIMESTAMPTZ NOT NULL
);

CREATE INDEX ix_secop_cache_expires
    ON contracts.secop_cache (expires_at);
CREATE INDEX ix_secop_cache_entidad
    ON contracts.secop_cache (entidad);

-- 6. Alert subscriptions — criteria-based notifications for new SECOP processes
CREATE TABLE contracts.alert_subscriptions (
    subscription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES contracts.company_profiles(company_id) ON DELETE CASCADE,
    owner_user_id   UUID NOT NULL,
    -- Filter criteria stored as JSONB (SecopFilter schema)
    filter_criteria JSONB NOT NULL,
    frequency       contracts.alert_frequency NOT NULL DEFAULT 'DAILY',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_checked_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_alert_subscriptions_company
    ON contracts.alert_subscriptions (company_id);
CREATE INDEX ix_alert_subscriptions_active
    ON contracts.alert_subscriptions (is_active) WHERE is_active = TRUE;

-- 7. Alert history — delivered alerts for audit trail
CREATE TABLE contracts.alert_history (
    alert_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES contracts.alert_subscriptions(subscription_id) ON DELETE CASCADE,
    proceso_id      VARCHAR(200) NOT NULL,
    -- Snapshot of key fields at alert time (SECOP data can change)
    proceso_snapshot JSONB NOT NULL,
    delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMPTZ
);

CREATE INDEX ix_alert_history_subscription
    ON contracts.alert_history (subscription_id, delivered_at DESC);

-- 8. Search audit log — tracks searches for analytics and rate limiting
CREATE TABLE contracts.search_audit (
    search_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID,  -- NULL for anonymous/freemium
    query_params    JSONB NOT NULL,
    result_count    INT NOT NULL DEFAULT 0,
    latency_ms      INT,
    ip_address      INET,
    searched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_search_audit_user
    ON contracts.search_audit (user_id, searched_at DESC);
-- For freemium rate-limit lookups: "how many searches has this IP done today?"
CREATE INDEX ix_search_audit_ip_date
    ON contracts.search_audit (ip_address, searched_at DESC);

-- ── RealCulture tenant + pricing_plans inserts ──────────────────────────────
-- These go into the realculture schema (shared auth backend).
-- The tenant row tells the NestJS backend to recognize X-Tenant-ID: contracts.
-- Pricing plans define the Contracts-specific tiers and Wompi amounts.

-- Tenant registration
INSERT INTO public.tenants (id, slug, name, domain, created_at)
VALUES (
    gen_random_uuid(),
    'contracts',
    'ColombiaTIC Contracts',
    'contracts.colombiatic.com.co',
    NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- Pricing plans (COP at 4000x USD, matching Atelier convention)
-- BUSCADOR_FREE:  0 COP — freemium (3 searches/day, no evaluations)
-- BUSCADOR_PRO:   79,000 COP/month — unlimited search + 10 evaluations/month
-- LICITADOR:      249,000 COP/month — unlimited search + evaluations + alerts + RAG
INSERT INTO public.pricing_plans (id, tenant_slug, tier, name, price_cop, interval, features, created_at)
VALUES
    (gen_random_uuid(), 'contracts', 'BUSCADOR_FREE', 'Buscador Gratis', 0, 'month',
     '{"searches_per_day": 3, "evaluations_per_month": 0, "alerts": false, "rag_profiles": false}'::jsonb, NOW()),
    (gen_random_uuid(), 'contracts', 'BUSCADOR_PRO', 'Buscador Pro', 79000, 'month',
     '{"searches_per_day": -1, "evaluations_per_month": 10, "alerts": false, "rag_profiles": false}'::jsonb, NOW()),
    (gen_random_uuid(), 'contracts', 'PRO_LICITADOR', 'Licitador Pro', 249000, 'month',
     '{"searches_per_day": -1, "evaluations_per_month": -1, "alerts": true, "rag_profiles": true}'::jsonb, NOW())
ON CONFLICT DO NOTHING;

-- ── Done ────────────────────────────────────────────────────────────────────
-- Verify:
--   SELECT table_name FROM information_schema.tables WHERE table_schema = 'contracts';
--   SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'contracts');
