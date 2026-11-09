/**
 * CompetitionBadge — Sprint 15A.
 * Shows competition intelligence for a SECOP process.
 * Used in ProcessDetailModal and WorkspacePage.
 */
import { useState, useEffect } from 'react';
import { Users, TrendingUp, AlertTriangle, Shield } from 'lucide-react';
import { getContractsToken } from '@/store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface CompetitionData {
  evaluators_count: number;
  savers_count: number;
  intensity: string;
  intensity_label: string;
  avg_match_score?: number;
  high_match_count?: number;
  b2b_competitors: Array<{
    razon_social: string;
    sector?: string;
    match_score?: number;
  }>;
  own_evaluation?: { match_score?: number; feasibility?: string; };
  recommendation: string;
}

const INTENSITY_CONFIG: Record<string, { icon: typeof Users; color: string; bg: string }> = {
  SIN_DATOS: { icon: Shield,        color: 'text-stone-500', bg: 'bg-stone-500/10 border-stone-500/20' },
  BAJA:      { icon: Shield,        color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  MEDIA:     { icon: TrendingUp,    color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  ALTA:      { icon: AlertTriangle, color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20' },
  MUY_ALTA:  { icon: AlertTriangle, color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
};

interface CompetitionBadgeProps {
  procesoId: string;
  compact?: boolean;  // minimal badge vs full card
}

export function CompetitionBadge({ procesoId, compact = false }: CompetitionBadgeProps) {
  const [data,    setData]    = useState<CompetitionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);

  useEffect(() => {
    const token = getContractsToken();
    if (!token || !procesoId) { setLoading(false); return; }
    fetch(`${API_BASE}/api/v1/competition/${procesoId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [procesoId]);

  if (loading || !data) return null;

  const cfg = INTENSITY_CONFIG[data.intensity] ?? INTENSITY_CONFIG.SIN_DATOS;
  const Icon = cfg.icon;

  if (compact) {
    return (
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border
          transition-colors ${cfg.bg} ${cfg.color}`}>
        <Users className="w-3.5 h-3.5" />
        {data.evaluators_count > 0
          ? `${data.evaluators_count} empresa${data.evaluators_count !== 1 ? 's' : ''} compitiendo`
          : 'Sin datos de competencia'}
      </button>
    );
  }

  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-4">
      <h3 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-3">
        <Users className="w-4 h-4 text-emerald-500" />
        Inteligencia competitiva
        <span className="text-stone-600 text-xs font-normal">(en ColombiaTIC Contracts)</span>
      </h3>

      {/* Intensity badge */}
      <div className={`flex items-center gap-2 p-2.5 rounded-xl border mb-3 ${cfg.bg}`}>
        <Icon className={`w-4 h-4 ${cfg.color} shrink-0`} />
        <div>
          <p className={`text-xs font-semibold ${cfg.color}`}>{cfg.icon.name}</p>
          <p className="text-[11px] text-stone-500">{data.intensity_label}</p>
        </div>
        <div className="ml-auto text-right">
          <p className={`text-lg font-bold ${cfg.color}`}>{data.evaluators_count}</p>
          <p className="text-[10px] text-stone-600">evaluaron</p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="text-center p-2 bg-white/5 rounded-lg">
          <p className="text-white font-bold text-sm">{data.savers_count}</p>
          <p className="text-[10px] text-stone-600">guardaron</p>
        </div>
        {data.avg_match_score !== null && data.avg_match_score !== undefined ? (
          <div className="text-center p-2 bg-white/5 rounded-lg">
            <p className="text-white font-bold text-sm">{data.avg_match_score}%</p>
            <p className="text-[10px] text-stone-600">score prom.</p>
          </div>
        ) : (
          <div className="text-center p-2 bg-white/5 rounded-lg">
            <p className="text-stone-600 font-bold text-sm">—</p>
            <p className="text-[10px] text-stone-700">score prom.</p>
          </div>
        )}
        {data.own_evaluation?.match_score !== undefined ? (
          <div className={`text-center p-2 rounded-lg border ${
            (data.own_evaluation.match_score ?? 0) >= 70
              ? 'bg-emerald-500/10 border-emerald-500/20'
              : 'bg-white/5 border-white/5'
          }`}>
            <p className={`font-bold text-sm ${
              (data.own_evaluation.match_score ?? 0) >= 70 ? 'text-emerald-400' : 'text-stone-300'
            }`}>
              {data.own_evaluation.match_score}%
            </p>
            <p className="text-[10px] text-stone-600">tu score</p>
          </div>
        ) : (
          <div className="text-center p-2 bg-white/5 rounded-lg">
            <p className="text-stone-600 font-bold text-sm">—</p>
            <p className="text-[10px] text-stone-700">tu score</p>
          </div>
        )}
      </div>

      {/* B2B competitors (only if connected) */}
      {data.b2b_competitors.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] text-stone-500 mb-1.5 font-medium">
            Conexiones B2B también evaluando:
          </p>
          {data.b2b_competitors.map((c, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-white/5
              last:border-0 text-xs">
              <span className="text-stone-300 truncate max-w-[60%]">{c.razon_social}</span>
              {c.match_score && (
                <span className={`font-mono font-semibold ${
                  c.match_score >= 70 ? 'text-amber-400' : 'text-stone-500'
                }`}>
                  {c.match_score}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recommendation */}
      <div className="p-2.5 bg-white/[0.02] rounded-xl border border-white/5">
        <p className="text-[11px] text-stone-400 leading-relaxed">
          💡 {data.recommendation}
        </p>
      </div>
    </div>
  );
}
