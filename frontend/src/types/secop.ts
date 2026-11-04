export interface SecopProcessCard {
  proceso_id: string;
  entidad: string;
  nit_entidad: string;
  departamento_entidad: string;
  ciudad_entidad: string;
  nombre_del_procedimiento: string;
  descripcion: string | null;
  precio_base: string | null;
  modalidad: string;
  tipo_contrato: string;
  estado: string;
  codigo_unspsc: string;
  url_proceso: string | null;
  fecha_publicacion: string;
  duracion: number | null;
  unidad_duracion: string | null;
}

export interface SecopSearchFilters {
  query?: string;
  departamento?: string;
  modalidad?: string;
  tipo_contrato?: string;
  precio_min?: number;
  precio_max?: number;
  offset?: number;
  limit?: number;
}

export interface SecopSearchResponse {
  results: SecopProcessCard[];
  total: number;
  offset: number;
  limit: number;
  cached: boolean;
  response_time_ms: number;
  remaining_free_searches: number;
  is_gated: boolean;
  upgrade_url?: string;
}
