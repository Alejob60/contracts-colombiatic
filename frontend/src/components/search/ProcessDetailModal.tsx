import { useState } from 'react';
import { X, MapPin, Building2, Tag, Calendar, DollarSign, FileText, ExternalLink, Bot, Loader2, BookmarkCheck, Bookmark } from 'lucide-react';
import { formatCOP } from '@/lib/utils/formatCurrency';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import type { SecopProcessCard } from '@/types/secop';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface ProcessDetailModalProps {
  process: SecopProcessCard;
  onClose: () => void;
}

export function ProcessDetailModal({ process, onClose }: ProcessDetailModalProps) {
  const navigate = useNavigate();
  const { isAuthenticated, isPro } = useAuthStore();
  const [evaluating, setEvaluating] = useState(false);
  const [evalError,  setEvalError]  = useState('');
  const [saved,      setSaved]      = useState(false);

  const handleEvaluate = async () => {
    if (!isAuthenticated) { navigate('/auth?redirect=/buscar'); return; }
    if (!isPro)           { navigate('/checkout'); return; }
    setEvaluating(true); setEvalError('');
    try {
      const token = getContractsToken();
      const res = await fetch(`${API_BASE}/api/v1/evaluations/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ proceso_id: process.proceso_id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `Error ${res.status}`);
      }
      onClose();
      navigate('/dashboard/evaluaciones');
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : 'Error al evaluar');
    } finally {
      setEvaluating(false); }
  };

  const handleSave = async () => {
    if (!isAuthenticated) { navigate('/auth'); return; }
    const token = getContractsToken();
    try {
      const res = await fetch(`${API_BASE}/api/v1/company/saved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          proceso_id: process.proceso_id,
          nombre_proceso: process.nombre_del_procedimiento,
          entidad: process.entidad,
          precio_base: process.precio_base ? Number(process.precio_base) : null,
          departamento: process.departamento_entidad,
          ciudad: process.ciudad_entidad,
          estado: process.estado,
        }),
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      setSaved(true);
    } catch {
      setEvalError('Error al guardar el proceso. Intenta de nuevo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#0A0F1E] border border-white/10 rounded-2xl
        shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 pb-4 border-b border-white/8">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-stone-500 font-mono mb-1">{process.proceso_id}</p>
            <h2 className="text-white font-semibold text-sm leading-snug line-clamp-3">
              {process.nombre_del_procedimiento}
            </h2>
          </div>
          <button onClick={onClose}
            className="shrink-0 p-1.5 text-stone-500 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Key metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/[0.03] border border-white/8 rounded-xl p-3">
              <p className="text-stone-500 text-xs mb-1">Entidad</p>
              <p className="text-white text-sm font-medium">{process.entidad}</p>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-xl p-3">
              <p className="text-stone-500 text-xs mb-1">Ubicación</p>
              <p className="text-white text-sm">{process.ciudad_entidad}, {process.departamento_entidad}</p>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-xl p-3">
              <p className="text-stone-500 text-xs mb-1">Presupuesto</p>
              <p className="text-emerald-400 text-sm font-semibold">
                {process.precio_base ? formatCOP(Number(process.precio_base)) : 'No especificado'}
              </p>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-xl p-3">
              <p className="text-stone-500 text-xs mb-1">Estado</p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                process.estado?.toLowerCase().includes('abierto') || process.estado?.toLowerCase().includes('convocado')
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : 'bg-stone-500/10 text-stone-400 border-stone-500/20'
              }`}>{process.estado}</span>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-xl p-3">
              <p className="text-stone-500 text-xs mb-1">Modalidad</p>
              <p className="text-stone-300 text-sm">{process.modalidad}</p>
            </div>
            <div className="bg-white/[0.03] border border-white/8 rounded-xl p-3">
              <p className="text-stone-500 text-xs mb-1">Tipo contrato</p>
              <p className="text-stone-300 text-sm">{process.tipo_contrato}</p>
            </div>
          </div>

          {/* Additional info */}
          <div className="flex flex-wrap gap-3 text-xs text-stone-500">
            {process.codigo_unspsc && (
              <span className="flex items-center gap-1">
                <Tag className="w-3 h-3" />
                UNSPSC: {process.codigo_unspsc}
              </span>
            )}
            {process.fecha_publicacion && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Publicado: {new Date(process.fecha_publicacion).toLocaleDateString('es-CO', { day:'2-digit', month:'short', year:'numeric' })}
              </span>
            )}
            {process.duracion && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                Duración: {process.duracion} {process.unidad_duracion}
              </span>
            )}
          </div>

          {/* Adjudicado warning — should be rare since the API filters these out,
              but may appear for external processes or stale cache entries */}
          {process.proveedor_adjudicado && (
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 flex gap-2.5 items-start">
              <span className="text-red-400 text-base leading-none mt-0.5">🔴</span>
              <div>
                <p className="text-red-400 font-semibold text-xs">Proceso ya adjudicado</p>
                <p className="text-red-300/70 text-xs mt-0.5">
                  Proveedor: <span className="font-medium text-red-300">{process.proveedor_adjudicado}</span>
                </p>
                <p className="text-stone-600 text-[10px] mt-1">
                  Este proceso no está abierto para nuevas ofertas.
                </p>
              </div>
            </div>
          )}

          {/* Cierre de convocatoria */}
          {process.fecha_cierre && new Date(process.fecha_cierre) < new Date() && (
            <div className="bg-orange-500/10 border border-orange-500/25 rounded-xl p-3 flex gap-2.5 items-start">
              <span className="text-orange-400 text-base leading-none mt-0.5">⚠️</span>
              <div>
                <p className="text-orange-400 font-semibold text-xs">Convocatoria cerrada</p>
                <p className="text-orange-300/70 text-xs mt-0.5">
                  Fecha de cierre:{' '}
                  {new Date(process.fecha_cierre).toLocaleDateString('es-CO', {
                    day: '2-digit', month: 'short', year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          )}

          {/* Description */}
          {process.descripcion && (
            <div>
              <p className="text-xs text-stone-500 uppercase tracking-wider font-medium mb-2">
                Descripción del proceso
              </p>
              <p className="text-stone-300 text-sm leading-relaxed bg-white/[0.02] border border-white/5 rounded-xl p-4">
                {process.descripcion}
              </p>
            </div>
          )}

          {/* SECOP notice with working link */}
          <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 text-xs text-stone-500">
            <p className="text-amber-400 font-medium mb-1">ℹ️ Acceso directo al proceso</p>
            <a
              href={`https://www.secop.gov.co/Public/Tendering/ProcessSearch/Index?q=${encodeURIComponent(process.proceso_id)}`}
              target="_blank" rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 underline">
              Buscar {process.proceso_id} en SECOP II →
            </a>
            <p className="text-stone-700 mt-1 text-[10px]">
              Código: <span className="font-mono text-stone-500">{process.proceso_id}</span>
              {' · '}Estado puede no ser actual — verificar en SECOP II
            </p>
          </div>

          {evalError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {evalError}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 pt-3 border-t border-white/8 flex gap-2">
          <button onClick={handleSave} disabled={saved}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm transition-all ${
              saved
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'border border-white/10 text-stone-300 hover:text-white hover:border-white/20'
            }`}>
            {saved ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
            {saved ? 'Guardado' : 'Guardar'}
          </button>

          {isPro ? (
            <button onClick={handleEvaluate} disabled={evaluating}
              className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
                text-white font-semibold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition-all text-sm">
              {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {evaluating ? 'Analizando con IA...' : 'Evaluar viabilidad con IA'}
            </button>
          ) : (
            <button onClick={() => { onClose(); navigate('/checkout'); }}
              className="flex-1 flex items-center justify-center gap-2 bg-amber-500/10 border border-amber-500/20
                text-amber-400 font-semibold py-2.5 rounded-xl hover:bg-amber-500/15 transition-all text-sm">
              <Bot className="w-4 h-4" />
              Activar PRO para evaluar con IA
            </button>
          )}
          {isPro && (
            <button onClick={() => { onClose(); navigate(`/dashboard/workspace/${process.proceso_id}`); }}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm
                text-stone-300 border border-white/10 rounded-xl hover:border-emerald-500/20
                hover:text-emerald-300 hover:bg-emerald-500/5 transition-colors">
              <FileText className="w-4 h-4" />
              Workspace
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
