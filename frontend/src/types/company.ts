/**
 * Company profile and saved-process types for Sprint 3.
 *
 * WHY separate from secop.ts: company domain types belong to the authenticated
 * user context (profile, saved processes). SECOP types describe the public
 * procurement data source. Keeping them separate prevents coupling changes
 * to saved-process features from touching search-result types.
 */

/** Colombian company size classification per Decreto 957 de 2019 */
export type TamanoEmpresa = 'MICRO' | 'PEQUENA' | 'MEDIANA' | 'GRANDE';

export const TAMANO_EMPRESA_LABELS: Record<TamanoEmpresa, string> = {
  MICRO:   'Microempresa',
  PEQUENA: 'Pequeña empresa',
  MEDIANA: 'Mediana empresa',
  GRANDE:  'Gran empresa',
} as const;

export interface CompanyProfile {
  readonly id?: string;
  nit: string;
  digito_verificacion: string;
  razon_social: string;
  nombre_comercial: string;
  representante_legal: string;
  email_contacto: string;
  telefono: string;
  departamento: string;
  ciudad: string;
  sector: string;
  tamano_empresa: TamanoEmpresa | '';
  /** Capacidad de contratación en SMMLV (Salarios Mínimos Mensuales Legales Vigentes) */
  capacidad_k: number | null;
  /** UNSPSC commodity codes the company operates in */
  codigos_unspsc: string[];
  readonly created_at?: string;
  readonly updated_at?: string;
}

/** Shape returned by GET /api/v1/company/saved */
export interface SavedProcess {
  readonly id: string;
  readonly proceso_id: string;
  nombre_del_procedimiento: string;
  entidad: string;
  departamento_entidad: string;
  ciudad_entidad: string;
  precio_base: string | null;
  modalidad: string;
  estado: string;
  codigo_unspsc: string;
  url_proceso: string | null;
  alert_enabled: boolean;
  readonly saved_at: string;
}

/** Payload for POST /api/v1/company/saved */
export interface SaveProcessPayload {
  proceso_id: string;
  nombre_del_procedimiento: string;
  entidad: string;
  departamento_entidad: string;
  ciudad_entidad: string;
  precio_base: string | null;
  modalidad: string;
  estado: string;
  codigo_unspsc: string;
  url_proceso: string | null;
}
