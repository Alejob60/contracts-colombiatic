import { useNavigate } from 'react-router-dom';
import { MapPin, Building2, Tag, Calendar, DollarSign, ExternalLink, Lock } from 'lucide-react';
import { formatCOP } from '@/lib/utils/formatCurrency';
import type { SecopProcessCard } from '@/types/secop';

interface ResultCardProps {
  process: SecopProcessCard;
  isBlurred?: boolean;
  onUpgrade?: () => void;
}

const ESTADO_COLORS: Record<string, string> = {
  Publicado: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Convocado: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  Abierto: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'En evaluación': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  Adjudicado: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  Cerrado: 'bg-stone-500/10 text-stone-400 border-stone-500/20',
  Cancelado: 'bg-red-500/10 text-red-400 border-red-500/20',
};

function estadoColor(estado: string) {
  for (const key of Object.keys(ESTADO_COLORS)) {
    if (estado.toLowerCase().includes(key.toLowerCase())) return ESTADO_COLORS[key];
  }
  return 'bg-stone-500/10 text-stone-400 border-stone-500/20';
}

export function ResultCard({ process, isBlurred = false, onUpgrade }: ResultCardProps) {
  const navigate = useNavigate();

  const handleView = () => {
    if (isBlurred) {
      onUpgrade?.();
      return;
    }
    navigate(`/buscar?proceso=${process.proceso_id}`);
  };

  return (
    <div
      className={`relative bg-white/[0.02] border border-white/8 rounded-2xl p-5 hover:border-emerald-500/20
        hover:bg-white/[0.04] transition-all group ${isBlurred ? 'cursor-pointer' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-stone-500 uppercase tracking-wider mb-1 font-mono">
            {process.codigo_unspsc || 'UNSPSC —'}
          </p>
          <h3 className="text-white font-medium text-sm leading-snug line-clamp-2 group-hover:text-emerald-300 transition-colors">
            {process.nombre_del_procedimiento}
          </h3>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${estadoColor(process.estado)}`}>
          {process.estado}
        </span>
      </div>

      {/* Metadata row */}
      <div className="flex flex-wrap gap-3 text-xs text-stone-500 mb-4">
        <span className="flex items-center gap-1">
          <Building2 className="w-3 h-3" />
          <span className="truncate max-w-[180px]">{process.entidad}</span>
        </span>
        <span className="flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          {process.ciudad_entidad}, {process.departamento_entidad}
        </span>
        <span className="flex items-center gap-1">
          <Tag className="w-3 h-3" />
          {process.modalidad}
        </span>
        {process.fecha_publicacion && (
          <span className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(process.fecha_publicacion).toLocaleDateString('es-CO', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        )}
      </div>

      {/* Budget */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
          {isBlurred || process.precio_base == null ? (
            <span className="text-sm font-semibold text-stone-500 italic">
              {isBlurred ? '••••••' : 'No especificado'}
            </span>
          ) : (
            <span className="text-sm font-semibold text-emerald-400">
              {formatCOP(Number(process.precio_base))}
            </span>
          )}
        </div>

        <button
          onClick={handleView}
          className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-emerald-400
            transition-colors group/btn"
        >
          {isBlurred ? (
            <>
              <Lock className="w-3 h-3" />
              Desbloquear
            </>
          ) : (
            <>
              <ExternalLink className="w-3 h-3" />
              Ver proceso
            </>
          )}
        </button>
      </div>

      {/* Blur overlay */}
      {isBlurred && (
        <div className="absolute inset-0 rounded-2xl backdrop-blur-[2px] bg-brand-navy/40 flex items-center justify-center">
          <div className="text-center">
            <Lock className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-xs text-stone-400">Regístrate para ver</p>
          </div>
        </div>
      )}
    </div>
  );
}
