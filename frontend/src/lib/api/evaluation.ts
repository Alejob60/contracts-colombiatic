/**
 * Evaluation API client — authenticated calls to /api/v1/evaluations/*.
 *
 * WHY separate from company.ts: evaluations are a distinct feature domain
 * (PRO-only AI analysis) with different request/response shapes. Keeping
 * them in their own module aligns with the backend's separate router and
 * use case module, and avoids company.ts from growing unboundedly.
 */
import type { BidEvaluation, EvaluationListResponse } from '@/types/evaluation';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Structured API error with status code for caller-side branching. */
export class EvaluationApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'EvaluationApiError';
  }
}

function authHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function handleResponse<T>(res: Response, context: string): Promise<T> {
  if (res.ok) return res.json() as Promise<T>;

  let detail: string | undefined;
  try {
    const body: unknown = await res.json();
    detail = (body as { detail?: string }).detail;
  } catch {
    /* response body not JSON — ignore */
  }

  const message = detail ?? `Error ${res.status} en ${context}`;

  if (res.status === 401) {
    throw new EvaluationApiError('Sesión expirada. Vuelve a iniciar sesión.', 401, detail);
  }
  if (res.status === 403) {
    throw new EvaluationApiError('Se requiere suscripción PRO Licitador.', 403, detail);
  }

  throw new EvaluationApiError(message, res.status, detail);
}

// ── Endpoints ─────────────────────────────────────────────────────────────

/**
 * Trigger an AI evaluation for a SECOP process.
 *
 * Idempotent: if an evaluation already exists for this proceso_id,
 * the backend returns the cached result instead of re-running analysis.
 */
export async function analyzeProcess(
  token: string,
  procesoId: string,
): Promise<BidEvaluation> {
  const res = await fetch(`${API_BASE}/api/v1/evaluations/analyze`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ proceso_id: procesoId }),
  });
  return handleResponse<BidEvaluation>(res, 'evaluar licitación');
}

/** Fetch all evaluations for the authenticated user. */
export async function fetchEvaluations(
  token: string,
): Promise<EvaluationListResponse> {
  const res = await fetch(`${API_BASE}/api/v1/evaluations/`, {
    headers: authHeaders(token),
  });
  return handleResponse<EvaluationListResponse>(res, 'listar evaluaciones');
}

/** Fetch a single evaluation by ID. */
export async function fetchEvaluation(
  token: string,
  evaluationId: string,
): Promise<BidEvaluation> {
  const res = await fetch(
    `${API_BASE}/api/v1/evaluations/${encodeURIComponent(evaluationId)}`,
    { headers: authHeaders(token) },
  );
  return handleResponse<BidEvaluation>(res, 'obtener evaluación');
}
