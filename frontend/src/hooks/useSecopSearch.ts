import { useState, useCallback } from 'react';
import type { FilterValues } from '@/components/search/FilterPanel';
import { getContractsToken } from '@/store/useAuthStore';

export interface SecopSearchResult {
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

interface UseSecopSearchReturn {
  data: SecopSearchResult | null;
  loading: boolean;
  error: string | null;
  search: (query: string, filters?: FilterValues, offset?: number) => Promise<void>;
  reset: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function useSecopSearch(): UseSecopSearchReturn {
  const [data, setData] = useState<SecopSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(
    async (query: string, filters: FilterValues = {} as FilterValues, offset = 0) => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (query) params.set('q', query);
      if (filters.departamento) params.set('departamento', filters.departamento);
      if (filters.municipio)    params.set('municipio',    filters.municipio);
      if (filters.modalidad)    params.set('modalidad',    filters.modalidad);
      if (filters.tipo_contrato) params.set('tipo_contrato', filters.tipo_contrato);
      if (filters.precio_min)   params.set('precio_min',   filters.precio_min);
      if (filters.precio_max)   params.set('precio_max',   filters.precio_max);
      // Estado: map UI selector value to API param
      const estadoMap: Record<string, string> = {
        activos:  '',          // API default shows Abierto/Convocado
        todos:    'todos',     // all historical records
        cerrados: 'Cerrado',
      };
      const estadoApi = estadoMap[filters.estado_view ?? 'activos'] ?? '';
      if (estadoApi) params.set('estado', estadoApi);
      // Year filter (specific year overrides date range)
      if (filters.year) params.set('year', filters.year);
      params.set('offset', String(offset));
      params.set('limit', '20');

      try {
        // getContractsToken reads from cookie first, then from Zustand persist
        const token = getContractsToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${API_BASE}/api/v1/secop/search?${params}`, { headers });
        const json = await res.json();

        // 402 = freemium gate hit — still set data so UI can show gate modal
        if (res.ok || res.status === 402) {
          setData(json as SecopSearchResult);
        } else if (res.status === 401) {
          setError('Sesión expirada. Vuelve a iniciar sesión.');
        } else {
          setError((json as { detail?: string }).detail ?? `Error del servidor (${res.status})`);
        }
      } catch (err) {
        setError('Error al conectar con el servidor. Intenta de nuevo.');
        if (import.meta.env.DEV) console.error('SECOP search error:', err);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, search, reset };
}
