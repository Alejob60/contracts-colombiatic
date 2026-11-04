import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { DEPARTAMENTOS } from '@/lib/constants/departments';
import { MODALIDADES } from '@/lib/constants/modalities';

export interface FilterValues {
  departamento: string;
  modalidad: string;
  tipo_contrato: string;
  precio_min: string;
  precio_max: string;
}

const EMPTY_FILTERS: FilterValues = {
  departamento: '',
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
      className="bg-brand-card border border-white/8 rounded-2xl p-5 space-y-4"
    >
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
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider">
          Departamento
        </label>
        <select
          value={values.departamento}
          onChange={set('departamento')}
          className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
            focus:outline-none focus:border-emerald-500/50 transition-colors
            [&>option]:bg-brand-dark [&>option]:text-white"
        >
          <option value="">Todos</option>
          {DEPARTAMENTOS.map((d) => (
            <option key={d.code} value={d.name}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {/* Modalidad */}
      <div>
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider">
          Modalidad
        </label>
        <select
          value={values.modalidad}
          onChange={set('modalidad')}
          className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
            focus:outline-none focus:border-emerald-500/50 transition-colors
            [&>option]:bg-brand-dark [&>option]:text-white"
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
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider">
          Tipo de contrato
        </label>
        <select
          value={values.tipo_contrato}
          onChange={set('tipo_contrato')}
          className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
            focus:outline-none focus:border-emerald-500/50 transition-colors
            [&>option]:bg-brand-dark [&>option]:text-white"
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
        <label className="block text-xs text-stone-500 mb-1.5 uppercase tracking-wider">
          Presupuesto (COP)
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Mínimo"
            value={values.precio_min}
            onChange={set('precio_min')}
            min={0}
            className="flex-1 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
              placeholder-stone-600 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
          <input
            type="number"
            placeholder="Máximo"
            value={values.precio_max}
            onChange={set('precio_max')}
            min={0}
            className="flex-1 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white
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
