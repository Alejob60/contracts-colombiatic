/**
 * ResultCard — Displays a single SECOP process in search results.
 *
 * WHY the save button lives here: the bookmark action is contextual to each
 * result card. Lifting it to the parent (SearchPage) would require passing
 * save state per-card and managing a Map of proceso_id → saved status.
 * Keeping it local makes the component self-contained.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Building2, Tag, Calendar, DollarSign,
  Lock, Bookmark, Loader2, Check, Bot,
} from 'lucide-react';
import { formatCOP } from '@/lib/utils/formatCurrency';
import { getContractsToken, useAuthStore } from '@/store/useAuthStore';
import { saveProcess, CompanyApiError } from '@/lib/api/company';
import { ProcessDetailModal } from '@/components/search/ProcessDetailModal';
import type { SecopProcessCard } from '@/types/secop';
import type { SaveProcessPayload } from '@/types/company';

interface ResultCardProps {
  process: SecopProcessCard;
  isBlurred?: boolean;
  onUpgrade?: () => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type EvalActionStatus = 'idle' | 'evaluating' | 'done' | 'error';

const ESTADO_COLORS: Record<string, string> = {
  Publicado:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  Convocado:      'bg-blue-500/10    text-blue-400    border-blue-500/20',
  Abierto:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'En evaluación':'bg-amber-500/10   text-amber-400   border-amber-500/20',
  Adjudicado:     'bg-purple-500/10  text-purple-400  border-purple-500/20',
  Cerrado:        'bg-stone-500/10   text-stone-400   border-stone-500/20',
  Cancelado:      'bg-red-500/10     text-red-400     border-red-500/20',
};

function estadoColor(estado: string): string {
  for (const key of Object.keys(ESTADO_COLORS)) {
    if (estado.toLowerCase().includes(key.toLowerCase())) return ESTADO_COLORS[key];
  }
  return 'bg-stone-500/10 text-stone-400 border-stone-500/20';
}

export function ResultCard({ process, isBlurred = false, onUpgrade }: ResultCardProps) {
  const navigate = useNavigate();
  const { isPro } = useAuthStore();
  const [saveStatus,  setSaveStatus]  = useState<SaveStatus>('idle');
  const [evalStatus,  setEvalStatus]  = useState<EvalActionStatus>('idle');
  const [showDetail,  setShowDetail]  = useState(false);

  const handleView = () => {
    if (isBlurred) { onUpgrade?.(); return; }
    setShowDetail(true);  // Open detail modal within our app
  };

  const handleSave = async () => {
    const token = getContractsToken();
    if (!token) {
      navigate('/auth?redirect=/buscar');
      return;
    }

    if (saveStatus === 'saved' || saveStatus === 'saving') return;

    setSaveStatus('saving');
    try {
      const payload: SaveProcessPayload = {
        proceso_id: process.proceso_id,
        nombre_del_procedimiento: process.nombre_del_procedimiento,
        entidad: process.entidad,
        departamento_entidad: process.departamento_entidad,
        ciudad_entidad: process.ciudad_entidad,
        precio_base: process.precio_base,
        modalidad: process.modalidad,
        estado: process.estado,
        codigo_unspsc: process.codigo_unspsc,
        url_proceso: process.url_proceso,
      };
      await saveProcess(token, payload);
      setSaveStatus('saved');
    } catch (err) {
      if (err instanceof CompanyApiError && err.status === 409) {
        // Already saved — treat as success
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
        // Reset after 2s so user can retry
        setTimeout(() => setSaveStatus('idle'), 2000);
        if (import.meta.env.DEV) console.error('[ResultCard] save:', err);
      }
    }
  };

  const handleEvaluate = async () => {
    const token = getContractsToken();
    if (!token) {
      navigate('/auth?redirect=/buscar');
      return;
    }
    if (evalStatus === 'evaluating' || evalStatus === 'done') return;

    setEvalStatus('evaluating');
    try {
      await analyzeProcess(token, process.proceso_id);
      setEvalStatus('done');
      navigate('/dashboard/evaluaciones');
    } catch (err) {
      setEvalStatus('error');
      const RESET_DELAY_MS = 2000;
      setTimeout(() => setEvalStatus('idle'), RESET_DELAY_MS);
      if (err instanceof EvaluationApiError && err.status === 403) {
        navigate('/pricing');
        return;
      }
      if (import.meta.env.DEV) console.error('[ResultCard] evaluate:', err);
    }
  };

  return (
    <>
    <div
      className={`relative bg-white/[0.02] border border-white/8 rounded-xl sm:rounded-2xl p-4 sm:p-5
        transition-all active:scale-[0.99]
        ${isBlurred ? 'cursor-pointer' : 'hover:border-emerald-500/20 hover:bg-white/[0.04]'}`}
    >
      {/* ── Header: title + estado badge ── */}
      <div className="flex items-start justify-between gap-2 sm:gap-3 mb-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-stone-600 uppercase tracking-wider mb-1 font-mono truncate">
            {process.codigo_unspsc || 'UNSPSC —'}
          </p>
          <h3 className="text-white font-medium text-sm leading-snug line-clamp-2
            hover:text-emerald-300 transition-colors">
            {process.nombre_del_procedimiento}
          </h3>
        </div>
        <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border
          whitespace-nowrap ${estadoColor(process.estado)}`}>
          {process.estado}
        </span>
      </div>

      {/* ── Metadata ── */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-y-1.5 gap-x-3 text-xs text-stone-500 mb-3">
        {/* Entity — full row on mobile */}
        <span className="flex items-center gap-1 min-w-0">
          <Building2 className="w-3 h-3 shrink-0" />
          <span className="truncate">{process.entidad}</span>
        </span>
        {/* Location */}
        <span className="flex items-center gap-1 shrink-0">
          <MapPin className="w-3 h-3 shrink-0" />
          <span className="truncate max-w-[160px] sm:max-w-none">
            {process.ciudad_entidad}{process.departamento_entidad ? `, ${process.departamento_entidad}` : ''}
          </span>
        </span>
        {/* Modalidad */}
        <span className="flex items-center gap-1 shrink-0 truncate max-w-[200px]">
          <Tag className="w-3 h-3 shrink-0" />
          {process.modalidad}
        </span>
        {/* Date */}
        {process.fecha_publicacion && (
          <span className="flex items-center gap-1 shrink-0">
            <Calendar className="w-3 h-3 shrink-0" />
            {new Date(process.fecha_publicacion).toLocaleDateString('es-CO', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
          </span>
        )}
      </div>

      {/* ── Footer: budget + save + CTA ── */}
      <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-white/5">
        <div className="flex items-center gap-1.5 min-w-0">
          <DollarSign className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          {isBlurred || process.precio_base == null ? (
            <span className="text-sm font-semibold text-stone-500 italic">
              {isBlurred ? '••••••' : 'Sin presupuesto'}
            </span>
          ) : (
            <span className="text-sm font-semibold text-emerald-400 truncate">
              {formatCOP(Number(process.precio_base))}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Save / bookmark button */}
          {!isBlurred && (
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving' || saveStatus === 'saved'}
              className={`shrink-0 flex items-center gap-1 text-xs py-1 px-2 rounded-lg
                transition-colors ${
                  saveStatus === 'saved'
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : saveStatus === 'error'
                      ? 'text-red-400 bg-red-500/5'
                      : 'text-stone-400 hover:text-emerald-400 hover:bg-emerald-500/5'
                } disabled:cursor-default`}
              title={
                saveStatus === 'saved' ? 'Guardado'
                : saveStatus === 'error' ? 'Error al guardar'
                : 'Guardar proceso'
              }
            >
              {saveStatus === 'saving' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : saveStatus === 'saved' ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Guardado</span>
                </>
              ) : (
                <>
                  <Bookmark className={`w-3.5 h-3.5 ${saveStatus === 'error' ? '' : ''}`} />
                  <span className="hidden sm:inline">
                    {saveStatus === 'error' ? 'Error' : 'Guardar'}
                  </span>
                </>
              )}
            </button>
          )}

          {/* AI Evaluate button — PRO only, shown when result is not blurred */}
          {!isBlurred && isPro && (
            <button
              onClick={handleEvaluate}
              disabled={evalStatus === 'evaluating' || evalStatus === 'done'}
              className={`shrink-0 flex items-center gap-1 text-xs py-1 px-2 rounded-lg
                transition-colors ${
                  evalStatus === 'done'
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : evalStatus === 'error'
                      ? 'text-red-400 bg-red-500/5'
                      : 'text-stone-400 hover:text-teal-400 hover:bg-teal-500/5'
                } disabled:cursor-default`}
              title={
                evalStatus === 'done' ? 'Evaluado'
                : evalStatus === 'error' ? 'Error al evaluar'
                : 'Evaluar con IA'
              }
            >
              {evalStatus === 'evaluating' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Bot className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">
                {evalStatus === 'evaluating' ? 'Evaluando...' :
                 evalStatus === 'done' ? 'Evaluado' :
                 evalStatus === 'error' ? 'Error' : 'Evaluar'}
              </span>
            </button>
          )}

          {/* View process button */}
          <button
            onClick={handleView}
            className="shrink-0 flex items-center gap-1.5 text-xs text-stone-400
              hover:text-emerald-400 transition-colors py-1 px-2 rounded-lg
              hover:bg-emerald-500/5 active:bg-emerald-500/10"
          >
            {isBlurred ? (
              <><Lock className="w-3 h-3" />Desbloquear</>
            ) : (
              <><ExternalLink className="w-3 h-3" />Ver proceso</>
            )}
          </button>
        </div>
      </div>

      {/* Blur overlay for gated results */}
      {isBlurred && (
        <div className="absolute inset-0 rounded-xl sm:rounded-2xl
          backdrop-blur-[2px] bg-brand-navy/50
          flex items-center justify-center">
          <div className="text-center bg-[#0F1929]/80 backdrop-blur-sm
            border border-white/10 rounded-xl px-4 py-3">
            <Lock className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <p className="text-xs text-stone-300 font-medium">Activa Plan PRO</p>
          </div>
        </div>
      )}
    </div>

    {/* Process detail modal — opens within our app, NOT community.secop.gov.co */}
    {showDetail && (
      <ProcessDetailModal
        process={process}
        onClose={() => setShowDetail(false)}
      />
    )}
    </>
  );
}
