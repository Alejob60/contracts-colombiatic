/**
 * UpgradeModal — shown when a 429 "limit_reached" error occurs.
 * Works for both evaluation and document limits.
 */
import { X, Zap, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface LimitError {
  resource:    'evals' | 'docs';
  used:        number;
  limit:       number;
  plan_label:  string;
  upgrade_to:  string;
  message:     string;
}

interface UpgradeModalProps {
  error: LimitError;
  onClose: () => void;
}

const RESOURCE_LABELS = {
  evals: { icon: BarChart3, label: 'evaluaciones IA', color: 'text-emerald-400' },
  docs:  { icon: Zap,       label: 'documentos RAG', color: 'text-blue-400' },
};

const NEXT_PLAN_PRICES: Record<string, string> = {
  CORPORATIVO: '$390.000/mes',
  ENTERPRISE:  'Cotizar',
};

export function UpgradeModal({ error, onClose }: UpgradeModalProps) {
  const res = RESOURCE_LABELS[error.resource];
  const Icon = res.icon;
  const nextPrice = NEXT_PLAN_PRICES[error.upgrade_to] ?? 'Ver planes';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-[#0F1929] border border-white/10 rounded-2xl p-6 max-w-sm w-full
        shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
              <Icon className={`w-5 h-5 ${res.color}`} />
            </div>
            <div>
              <h3 className="text-white font-bold text-base">Límite alcanzado</h3>
              <p className="text-stone-500 text-xs">Plan {error.plan_label}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-600 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-stone-400 mb-1.5">
            <span>{res.label} este mes</span>
            <span className="font-mono text-red-400">{error.used} / {error.limit}</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full w-full" />
          </div>
        </div>

        <p className="text-stone-400 text-sm mb-5 leading-relaxed">{error.message}</p>

        {/* Actions */}
        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 text-sm text-stone-400 border border-white/10
              rounded-xl hover:bg-white/5 transition-colors">
            Cerrar
          </button>
          <Link to="/pricing" onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm
              font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-400
              rounded-xl hover:opacity-90 transition-opacity">
            <Zap className="w-4 h-4" />
            Actualizar — {nextPrice}
          </Link>
        </div>
      </div>
    </div>
  );
}
