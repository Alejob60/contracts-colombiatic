import { useState, useEffect, useRef } from 'react';
import { Filter, X, Loader2 } from 'lucide-react';
import { DEPARTAMENTOS } from '@/lib/constants/departments';
import { MODALIDADES } from '@/lib/constants/modalities';

export interface FilterValues {
  departamento: string;
  municipio: string;
  modalidad: string;
  tipo_contrato: string;
  precio_min: string;
  precio_max: string;
}

const EMPTY_FILTERS: FilterValues = {
  departamento: '',
  municipio: '',
  modalidad: '',
  tipo_contrato: '',
  precio_min: '',
  precio_max: '',
};

const TIPOS_CONTRATO = [
  'Prestación de servicios',
  'Obra pública',
  'Suministro',
  'Consultoría',
  'Concesión',
  'Arrendamiento',
  'Compraventa',
  'Interadministrativo',
];

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface FilterPanelProps {
  onApply: (filters: FilterValues) => void;
  initialValues?: Partial<FilterValues>;
}

export function FilterPanel({ onApply, initialValues }: FilterPanelProps) {
  const [values, setValues] = useState<FilterValues>({ ...EMPTY_FILTERS, ...initialValues });
  const [municipalities, setMunicipalities] = useState<string[]>([]);
  const [loadingMunis, setLoadingMunis] = useState(false);

  // Keep a ref to abort in-flight requests when department changes fast
  const abortRef = useRef<AbortController | null>(null);

  // Fetch municipalities from API when department changes
  useEffect(() => {
    if (!values.departamento) {
      setMunicipalities([]);
      setValues((v) => ({ ...v, municipio: '' }));
      return;
    }

    // Abort previous in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoadingMunis(true);

    fetch(
      `${API_BASE}/api/v1/secop/municipios?departamento=${encodeURIComponent(values.departamento)}`,
      { signal: ctrl.signal },
    )
      .then((r) => r.json())
      .then((data: { municipios: string[] }) => {
        setMunicipalities(data.municipios ?? []);
        // Clear municipio if it's not in the new list
        setValues((v) => ({
          ...v,
          municipio: data.municipios.includes(v.municipio) ? v.municipio : '',
        }));
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('municipios fetch error:', err);
          setMunicipalities([]);
        }
      })
      .finally(() => setLoadingMunis(false));

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.departamento]);

  const set = (key: keyof FilterValues) => (
    e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>
  ) => setValues((v) => ({ ...v, [key]: e.target.value }));

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(values);
  };

  const handleClear = () => {
    setValues(EMPTY_FILTERS);
    onApply(EMPTY_FILTERS);
  };

  const hasFilters = Object.values(values).some((v) => v !== '');

  const selectClass = `w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
    focus:outline-none focus:border-emerald-500/50 transition-colors
    [&>option]:bg-[#0F1929] [&>option]:text-white`;

  return (
    <form onSubmit={handleApply} className="bg-[#0F1929] border border-white/8 rounded-2xl p-5 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Filter className="w-4 h-4 text-emerald-400" />
          Filtros
        </h3>
        {hasFilters && (
          <button
            type="button"
            onClick={handleClear}
            className="text-stone-500 hover:text-stone-300 text-xs flex items-center gap-1 transition-colors"
          >
            <X className="w-3 h-3" /> Limpiar
          </button>
        )}
      </div>

      {/* Departamento */}
      <div>
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider font-medium">
          Departamento
        </label>
        <select value={values.departamento} onChange={set('departamento')} className={selectClass}>
          <option value="">Todos los departamentos</option>
          {DEPARTAMENTOS.map((d) => (
            <option key={d.code} value={d.name}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Municipio — populated dynamically from API */}
      <div>
        <label className={`block text-xs mb-1.5 uppercase tracking-wider font-medium transition-colors flex items-center gap-2 ${
          values.departamento ? 'text-stone-500' : 'text-stone-700'
        }`}>
          Municipio
          {loadingMunis && <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />}
          {!loadingMunis && municipalities.length > 0 && (
            <span className="text-stone-600 normal-case font-normal">
              · {municipalities.length} disponibles
            </span>
          )}
        </label>
        <select
          value={values.municipio}
          onChange={set('municipio')}
          disabled={!values.departamento || loadingMunis}
          className={`${selectClass} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <option value="">
            {loadingMunis
              ? 'Cargando municipios...'
              : !values.departamento
              ? 'Selecciona un departamento primero'
              : municipalities.length === 0
              ? 'Sin municipios con contratos'
              : `Todos (${municipalities.length} municipios)`}
          </option>
          {municipalities.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {/* Modalidad */}
      <div>
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider font-medium">
          Modalidad
        </label>
        <select value={values.modalidad} onChange={set('modalidad')} className={selectClass}>
          <option value="">Todas</option>
          {MODALIDADES.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Tipo de contrato */}
      <div>
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider font-medium">
          Tipo de contrato
        </label>
        <select value={values.tipo_contrato} onChange={set('tipo_contrato')} className={selectClass}>
          <option value="">Todos</option>
          {TIPOS_CONTRATO.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {/* Presupuesto — stacked to avoid overflow */}
      <div>
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider font-medium">
          Presupuesto (COP)
        </label>
        <div className="flex flex-col gap-2">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Mínimo"
            value={values.precio_min}
            onChange={set('precio_min')}
            className="w-full min-w-0 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm
              text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Máximo"
            value={values.precio_max}
            onChange={set('precio_max')}
            className="w-full min-w-0 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm
              text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-semibold
          py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
      >
        Aplicar filtros
      </button>
    </form>
  );
}
