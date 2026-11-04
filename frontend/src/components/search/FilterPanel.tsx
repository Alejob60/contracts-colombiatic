import { useState, useEffect } from 'react';
import { Filter, X } from 'lucide-react';
import { DEPARTAMENTOS } from '@/lib/constants/departments';
import { MODALIDADES } from '@/lib/constants/modalities';
import { getMunicipalitiesByDepartment } from '@/lib/constants/municipalities';

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

interface FilterPanelProps {
  onApply: (filters: FilterValues) => void;
  initialValues?: Partial<FilterValues>;
}

export function FilterPanel({ onApply, initialValues }: FilterPanelProps) {
  const [values, setValues] = useState<FilterValues>({ ...EMPTY_FILTERS, ...initialValues });
  const [municipalities, setMunicipalities] = useState<string[]>([]);

  // Cascade: when department changes, repopulate municipalities and clear selected municipio
  useEffect(() => {
    if (values.departamento) {
      const munis = getMunicipalitiesByDepartment(values.departamento);
      setMunicipalities(munis);
      // Only clear municipio if the current one isn't in the new list
      if (!munis.includes(values.municipio)) {
        setValues((v) => ({ ...v, municipio: '' }));
      }
    } else {
      setMunicipalities([]);
      setValues((v) => ({ ...v, municipio: '' }));
    }
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

  return (
    <form
      onSubmit={handleApply}
      className="bg-[#0F1929] border border-white/8 rounded-2xl p-5 space-y-4"
    >
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
            <X className="w-3 h-3" />
            Limpiar
          </button>
        )}
      </div>

      {/* Departamento */}
      <div>
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider font-medium">
          Departamento
        </label>
        <select
          value={values.departamento}
          onChange={set('departamento')}
          className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
            focus:outline-none focus:border-emerald-500/50 transition-colors
            [&>option]:bg-[#0F1929] [&>option]:text-white"
        >
          <option value="">Todos los departamentos</option>
          {DEPARTAMENTOS.map((d) => (
            <option key={d.code} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Municipio — cascades from departamento */}
      <div>
        <label className={`block text-xs mb-1.5 uppercase tracking-wider font-medium transition-colors ${
          values.departamento ? 'text-stone-500' : 'text-stone-700'
        }`}>
          Municipio
          {!values.departamento && (
            <span className="ml-1 text-stone-700 normal-case font-normal">
              · selecciona un departamento
            </span>
          )}
        </label>
        <select
          value={values.municipio}
          onChange={set('municipio')}
          disabled={!values.departamento || municipalities.length === 0}
          className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm
            focus:outline-none focus:border-emerald-500/50 transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
            [&>option]:bg-[#0F1929] [&>option]:text-white
            text-white"
        >
          <option value="">
            {!values.departamento
              ? 'Selecciona un departamento primero'
              : municipalities.length === 0
              ? 'Sin municipios disponibles'
              : 'Todos los municipios'}
          </option>
          {municipalities.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {/* Modalidad */}
      <div>
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider font-medium">
          Modalidad
        </label>
        <select
          value={values.modalidad}
          onChange={set('modalidad')}
          className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
            focus:outline-none focus:border-emerald-500/50 transition-colors
            [&>option]:bg-[#0F1929] [&>option]:text-white"
        >
          <option value="">Todas</option>
          {MODALIDADES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      {/* Tipo de contrato */}
      <div>
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider font-medium">
          Tipo de contrato
        </label>
        <select
          value={values.tipo_contrato}
          onChange={set('tipo_contrato')}
          className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
            focus:outline-none focus:border-emerald-500/50 transition-colors
            [&>option]:bg-[#0F1929] [&>option]:text-white"
        >
          <option value="">Todos</option>
          {TIPOS_CONTRATO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Rango de presupuesto */}
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
            className="w-full min-w-0 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
              placeholder-stone-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Máximo"
            value={values.precio_max}
            onChange={set('precio_max')}
            className="w-full min-w-0 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
              placeholder-stone-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
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
