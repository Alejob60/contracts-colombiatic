/**
 * Document types for Sprint 4 — RAG document management.
 *
 * WHY separate from company.ts: documents have their own lifecycle (upload →
 * chunking → embedding → indexed) and their own API surface. Coupling them
 * to the company profile types would force unnecessary rebuilds when one
 * domain changes independently of the other.
 */

/** Backend document processing states in order of progression */
export type DocumentStatus = 'UPLOADED' | 'CHUNKING' | 'EMBEDDING' | 'INDEXED' | 'FAILED';

/** Allowed document types matching the backend's DocType enum */
export type DocumentType = 'RUP' | 'FINANCIAL' | 'EXPERIENCE' | 'LEGAL_REP' | 'OTHER';

/** Human-readable labels for document types, in es-CO */
export const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  RUP:       'Registro Único de Proponentes',
  FINANCIAL: 'Estados Financieros',
  EXPERIENCE: 'Certificados de Experiencia',
  LEGAL_REP: 'Representación Legal',
  OTHER:     'Otro documento',
} as const;

/** All valid document types for iteration in selectors */
export const DOC_TYPES: readonly DocumentType[] = [
  'RUP', 'FINANCIAL', 'EXPERIENCE', 'LEGAL_REP', 'OTHER',
] as const;

/** Statuses that indicate processing is in progress (triggers polling) */
export const PENDING_STATUSES: readonly DocumentStatus[] = [
  'UPLOADED', 'CHUNKING', 'EMBEDDING',
] as const;

/** Shape returned by GET /api/v1/company/documents (each item) */
export interface CompanyDocument {
  readonly id: string;
  readonly filename: string;
  readonly doc_type: DocumentType;
  readonly status: DocumentStatus;
  readonly chunk_count: number;
  readonly created_at: string;
  readonly download_url: string | null;
  readonly file_size_bytes: number;
}

/** Shape returned by GET /api/v1/company/documents (envelope) */
export interface DocumentListResponse {
  readonly documents: CompanyDocument[];
  readonly total: number;
}

/** Shape returned by POST /api/v1/company/documents (upload response) */
export interface DocumentUploadResponse {
  readonly id: string;
  readonly filename: string;
  readonly status: DocumentStatus;
}
