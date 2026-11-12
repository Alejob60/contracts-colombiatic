/**
 * ProfileCompletionBanner — Sprint 20.
 *
 * Shows a progress bar + pending items when the company profile is incomplete.
 * Appears on the dashboard and search page.
 *
 * variant="full"    → dashboard: expanded with items list
 * variant="compact" → search page: single-line nudge
 */
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, ChevronRight, AlertTriangle } from 'lucide-react';
import type { ProfileCompletion } from '@/hooks/useProfileCompletion';

interface Props {
  data:    ProfileCompletion;
  variant: 'full' | 'compact';
}

const SCORE_COLOR = (s: number) =>
  s >= 80 ? 'bg-emerald-500' : s >= 50 ? 'bg-amber-500' : 'bg-red-500';

const SCORE_LABEL = (s: number) =>
  s >= 80 ? 'Perfil completo' : s >= 50 ? 'Perfil parcial' : 'Perfil incompleto';

export function ProfileCompletionBanner({ data, variant }: Props) {
  const { score, missing, next_action } = data;

  if (score >= 100) return null;

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 bg-amber-500/8 border border-amber-500/20
        rounded-xl text-xs">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="text-stone-400 flex-1 min-w-0">
          Perfil {score}% completo — los resultados mejorarán cuando lo completes
          {next_action && (
            <span className="text-amber-400"> · Pendiente: {next_action.label.split(' ')[0]}…</span>
          )}
        </span>
        <Link to="/dashboard/perfil" className="shrink-0 text-amber-400 hover:text-amber-300 flex items-center gap-0.5">
          Completar <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  // variant = 'full'
  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-white font-semibold text-sm">
            {SCORE_LABEL(score)}
            <span className="ml-2 text-stone-500 font-normal">{score}%</span>
          </p>
          <p className="text-stone-600 text-xs mt-0.5">
            Un perfil completo mejora el matching IA y reduce falsos positivos
          </p>
        </div>
        <Link to="/dashboard/perfil"
          className="shrink-0 text-xs bg-emerald-500/10 border border-emerald-500/20
            text-emerald-400 px-3 py-1.5 rounded-xl hover:bg-emerald-500/15 transition-colors">
          Completar →
        </Link>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-white/5 rounded-full mb-4 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${SCORE_COLOR(score)}`}
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Items grid — show first 5 (done + pending mixed) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {data.items.slice(0, 6).map(item => (
          <div key={item.key} className="flex items-center gap-2 text-xs">
            {item.done
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              : <Circle      className="w-3.5 h-3.5 text-stone-700 shrink-0" />}
            <span className={item.done ? 'text-stone-500 line-through' : 'text-stone-400'}>
              {item.label}
            </span>
            {!item.done && (
              <span className="ml-auto text-stone-700 font-mono">+{item.points}</span>
            )}
          </div>
        ))}
      </div>

      {/* Next action CTA */}
      {missing.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <p className="text-xs text-stone-600">
            Próxima acción de mayor impacto:{' '}
            <Link to="/dashboard/perfil" className="text-emerald-400 hover:text-emerald-300">
              {missing[0].label}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
