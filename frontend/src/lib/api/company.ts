/**
 * Company API client — authenticated calls to /api/v1/company/*.
 *
 * WHY a thin fetch wrapper instead of axios: the project uses native fetch
 * in useSecopSearch.ts and useAuthStore.ts. Keeping the same pattern avoids
 * mixing two HTTP clients with different error semantics. Axios is in
 * package.json but unused at runtime.
 *
 * Every function requires a token obtained via getContractsToken(). The token
 * is read from cookie first, then Zustand persist (see useAuthStore).
 */
import type { CompanyProfile, SavedProcess, SaveProcessPayload } from '@/types/company';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Structured API error with status code for caller-side branching */
export class CompanyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'CompanyApiError';
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
    throw new CompanyApiError('Sesión expirada. Vuelve a iniciar sesión.', 401, detail);
  }
  if (res.status === 404) {
    throw new CompanyApiError(message, 404, detail);
  }

  throw new CompanyApiError(message, res.status, detail);
}

// ── Profile ────────────────────────────────────────────────────────────────

export async function fetchCompanyProfile(token: string): Promise<CompanyProfile | null> {
  const res = await fetch(`${API_BASE}/api/v1/company/profile`, {
    headers: authHeaders(token),
  });
  if (res.status === 404) return null;
  return handleResponse<CompanyProfile>(res, 'perfil de empresa');
}

export async function upsertCompanyProfile(
  token: string,
  profile: CompanyProfile,
): Promise<CompanyProfile> {
  const res = await fetch(`${API_BASE}/api/v1/company/profile`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(profile),
  });
  return handleResponse<CompanyProfile>(res, 'guardar perfil');
}

// ── Saved Processes ────────────────────────────────────────────────────────

export async function fetchSavedProcesses(token: string): Promise<SavedProcess[]> {
  const res = await fetch(`${API_BASE}/api/v1/company/saved`, {
    headers: authHeaders(token),
  });
  return handleResponse<SavedProcess[]>(res, 'procesos guardados');
}

export async function saveProcess(
  token: string,
  payload: SaveProcessPayload,
): Promise<SavedProcess> {
  const res = await fetch(`${API_BASE}/api/v1/company/saved`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload),
  });
  return handleResponse<SavedProcess>(res, 'guardar proceso');
}

export async function removeSavedProcess(
  token: string,
  procesoId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/company/saved/${encodeURIComponent(procesoId)}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok) {
    await handleResponse<never>(res, 'eliminar proceso guardado');
  }
}

export async function toggleProcessAlert(
  token: string,
  procesoId: string,
): Promise<{ alert_enabled: boolean }> {
  const res = await fetch(
    `${API_BASE}/api/v1/company/saved/${encodeURIComponent(procesoId)}/alert`,
    { method: 'PUT', headers: authHeaders(token) },
  );
  return handleResponse<{ alert_enabled: boolean }>(res, 'toggle alerta');
}

// ── Documents (Sprint 4) ──────────────────────────────────────────────────

import type {
  DocumentListResponse,
  DocumentUploadResponse,
  DocumentType,
} from '@/types/document';

/**
 * Fetches all documents for the authenticated company.
 * Used both for initial load and polling during processing.
 */
export async function fetchCompanyDocuments(
  token: string,
): Promise<DocumentListResponse> {
  const res = await fetch(`${API_BASE}/api/v1/company/documents`, {
    headers: authHeaders(token),
  });
  return handleResponse<DocumentListResponse>(res, 'listar documentos');
}

/**
 * Uploads a PDF document for RAG processing.
 *
 * WHY FormData without explicit Content-Type: the browser must set the
 * multipart boundary automatically. Setting Content-Type manually omits the
 * boundary string and causes a 422 on the backend.
 */
export async function uploadCompanyDocument(
  token: string,
  file: File,
  docType: DocumentType,
): Promise<DocumentUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(
    `${API_BASE}/api/v1/company/documents?doc_type=${encodeURIComponent(docType)}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    },
  );
  return handleResponse<DocumentUploadResponse>(res, 'subir documento');
}

/**
 * Deletes a document by ID. Returns void on success (204).
 */
export async function deleteCompanyDocument(
  token: string,
  documentId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/v1/company/documents/${encodeURIComponent(documentId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(token),
    },
  );
  if (!res.ok) {
    await handleResponse<never>(res, 'eliminar documento');
  }
}
