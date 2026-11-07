/**
 * AnalyticaPage — Sprint 7: procurement analytics dashboard.
 *
 * Renders a consolidated view of the user's activity on ColombiaTIC Contracts:
 * - Activity stats (saved, evaluations, docs, alerts)
 * - AI evaluation summary (avg score + feasibility distribution)
 * - Saved processes by department (horizontal bar chart)
 * - 30-day timeline sparkline
 * - Top 5 highest-budget processes
 *
 * No chart libraries — all visuals are pure SVG or CSS.  This keeps the
 * bundle lean and avoids another dependency with potential licensing issues.
 */
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3, Bookmark, Bot, FileText, Bell, Building2,
  DollarSign, Loader2, TrendingUp, Zap, MapPin, Target,
} from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';
import { formatCOP } from '@/lib/utils/formatCurrency';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────

interface Analytics {
  activity: {
    saved_count: number;
    eval_count: number;
    doc_count: number;
    alerts_sent: number;
  };
  evaluations: {
    avg_score: number;
    total: number;
    by_feasibility: Record<string, number>;
    by_risk_severity: Record<string, number>;
    recent: Array<{ proceso_id: string; match_score: number; feasibility: string; created_at: string }>;
  };
  saved_by_departamento: Array<{ departamento: string; count: number; total_budget: number }>;
  saved_by_estado: Array<{ estado: string; count: number }>;
  top_budget: Array<{ nombre_proceso: string; entidad: string; precio_base: number; departamento?: string }>;
  timeline: Array<{ date: string; count: number }>;
}

// ── Mini components ───────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sublabel, color = 'emerald' }: {
  icon: typeof Bookmark; label: string; value: number | string; sublabel?: string; color?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400',
    blue:    'bg-blue-500/10 text-blue-400',
    amber:   'bg-amber-500/10 text-amber-400',
    purple:  'bg-purple-500/10 text-purple-400',
  };
  return (
    <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colorMap[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      <p className="text-xs text-stone-400 mt-0.5">{label}</p>
      {sublabel && <p className="text-[10px] text-stone-600 mt-0.5">{sublabel}</p>}
    </div>
  );
}

function HBar({ label, count, max, budget }: {
  label: string; count: number; max: number; budget?: number;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-stone-300 truncate max-w-[55%]">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          {budget !== undefined && budget > 0 && (
            <span className="text-stone-600 text-[10px]">{formatCOP(budget)}</span>
          )}
          <span className="text-stone-400 font-mono w-4 text-right">{count}</span>
        </div>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500/60 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function FeasibilityBar({ label, count, total, color }: {
  label: string; count: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 mb-2.5 last:mb-0">
      <span className="text-xs text-stone-400 w-32 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-stone-500 w-12 text-right font-mono">
        {pct}%<span className="text-stone-700 ml-1">({count})</span>
      </span>
    </div>
  );
}

// Score arc gauge (half-circle SVG)
function ScoreGauge({ score }: { score: number }) {
  const R = 52, STROKE = 8;
  const circ = Math.PI * R;
  const offset = circ * (1 - score / 100);
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex flex-col items-center">
      <svg width={120} height={68} viewBox="0 0 120 68">
        <path
          d={`M ${8} 64 A ${R} ${R} 0 0 1 ${112} 64`}
          fill="none" stroke="#ffffff10" strokeWidth={STROKE} strokeLinecap="round"
        />
        <path
          d={`M ${8} 64 A ${R} ${R} 0 0 1 ${112} 64`}
          fill="none" stroke={color} strokeWidth={STROKE} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        <text x="60" y="58" textAnchor="middle" fontSize="22" fontWeight="700"
          fill={color} fontFamily="monospace">{score}</text>
      </svg>
      <p className="text-xs text-stone-500 -mt-1">score promedio</p>
    </div>
  );
}

// 30-day sparkline
function Sparkline({ data }: { data: Array<{ date: string; count: number }> }) {
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    return d.toISOString().slice(0, 10);
  });
  const countByDay = Object.fromEntries(data.map(t => [t.date, t.count]));
  const maxCount = Math.max(1, ...days.map(d => countByDay[d] || 0));
  const W = 300, H = 44, BAR = 7, GAP = 3;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {days.map((day, i) => {
        const count = countByDay[day] || 0;
        const barH = count > 0 ? Math.max(3, Math.round((count / maxCount) * (H - 4))) : 2;
        const x = i * (BAR + GAP);
        return (
          <rect key={day}
            x={x} y={H - barH} width={BAR} height={barH}
            fill={count > 0 ? '#10b981' : '#ffffff08'}
            rx={1.5}
          />
        );
      })}
    </svg>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────

function EmptyState({ icon: Icon, title, desc, to, linkLabel }: {
  icon: typeof Bookmark; title: string; desc: string; to: string; linkLabel: string;
}) {
  return (
    <div className="text-center py-8">
      <Icon className="w-8 h-8 text-stone-700 mx-auto mb-3" />
      <p className="text-stone-400 text-sm font-medium mb-1">{title}</p>
      <p className="text-stone-600 text-xs mb-4">{desc}</p>
      <Link to={to}
        className="inline-flex items-center gap-1.5 text-xs text-emerald-400
          hover:text-emerald-300 border border-emerald-500/20 px-3 py-1.5 rounded-lg
          bg-emerald-500/5 hover:bg-emerald-500/10 transition-colors">
        {linkLabel} →
      </Link>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export function AnalyticaPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isPro } = useAuthStore();

  const [data, setData]       = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/auth?redirect=/dashboard/analitica'); return; }
    if (!isPro) { setLoading(false); return; }

    const token = getContractsToken();
    fetch(`${API_BASE}/api/v1/analytics/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch(() => setError('No se pudo cargar la analítica.'))
      .finally(() => setLoading(false));
  }, [isAuthenticated, isPro, navigate]);

  // ── Guards ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="max-w-lg">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">Analítica</h1>
            <p className="text-stone-500 text-sm">Inteligencia de contratación pública</p>
          </div>
        </div>
        <div className="p-6 bg-gradient-to-r from-emerald-500/10 to-teal-500/5
          border border-emerald-500/20 rounded-2xl text-center">
          <Zap className="w-10 h-10 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-white font-bold text-lg mb-2">Función PRO Licitador</h2>
          <p className="text-stone-400 text-sm mb-6">
            Visualiza tus estadísticas de licitación: evaluaciones IA, procesos por
            departamento, presupuestos y actividad histórica.
          </p>
          <Link to="/checkout"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
              text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 text-sm">
            <Zap className="w-4 h-4" />
            Activar Plan PRO — $149.000/mes
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-stone-400 text-sm">{error}</p>
      </div>
    );
  }

  const act = data?.activity ?? { saved_count: 0, eval_count: 0, doc_count: 0, alerts_sent: 0 };
  const evals = data?.evaluations ?? { avg_score: 0, total: 0, by_feasibility: {}, by_risk_severity: {}, recent: [] };
  const depts = data?.saved_by_departamento ?? [];
  const estados = data?.saved_by_estado ?? [];
  const topBudget = data?.top_budget ?? [];
  const timeline = data?.timeline ?? [];

  const totalEvals = evals.total;
  const maxDeptCount = Math.max(1, ...depts.map(d => d.count));

  const FEASIBILITY_LABELS: Record<string, { label: string; color: string }> = {
    VIABLE:              { label: '✓ Viable',              color: 'bg-emerald-500/70' },
    PARCIAL:             { label: '⚠ Con observaciones',   color: 'bg-amber-500/70' },
    NO_VIABLE:           { label: '✗ No viable',           color: 'bg-red-500/70' },
    DATOS_INSUFICIENTES: { label: '? Sin datos suficientes', color: 'bg-stone-500/70' },
  };

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-white font-bold text-xl">Analítica</h1>
          <p className="text-stone-500 text-sm">Tu actividad de contratación en SECOP II</p>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Bookmark}  label="Procesos guardados" value={act.saved_count}  color="emerald" />
        <StatCard icon={Bot}       label="Evaluaciones IA"    value={act.eval_count}   color="blue" />
        <StatCard icon={FileText}  label="Documentos"         value={act.doc_count}    color="amber" />
        <StatCard icon={Bell}      label="Alertas enviadas"   value={act.alerts_sent}  color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* ── AI Evaluation summary ── */}
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-4">
            <Bot className="w-4 h-4 text-emerald-500" />
            Evaluaciones IA
            {totalEvals > 0 && (
              <span className="text-xs text-stone-600 font-normal">({totalEvals} completadas)</span>
            )}
          </h2>

          {totalEvals === 0 ? (
            <EmptyState
              icon={Bot}
              title="Sin evaluaciones aún"
              desc="Evalúa una licitación con IA para ver estadísticas aquí."
              to="/buscar"
              linkLabel="Buscar licitaciones"
            />
          ) : (
            <>
              <ScoreGauge score={evals.avg_score} />
              <div className="mt-4">
                {Object.entries(FEASIBILITY_LABELS).map(([key, { label, color }]) => (
                  <FeasibilityBar
                    key={key}
                    label={label}
                    count={evals.by_feasibility[key] ?? 0}
                    total={totalEvals}
                    color={color}
                  />
                ))}
              </div>
              {Object.values(evals.by_risk_severity).some(v => v > 0) && (
                <div className="mt-4 pt-4 border-t border-white/5">
                  <p className="text-xs text-stone-500 mb-2">Riesgos detectados</p>
                  <div className="flex gap-3">
                    {(['ALTA', 'MEDIA', 'BAJA'] as const).map(sev => {
                      const cnt = evals.by_risk_severity[sev] ?? 0;
                      const cls = { ALTA: 'text-red-400 bg-red-500/10 border-red-500/20',
                                    MEDIA: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
                                    BAJA: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' }[sev];
                      return (
                        <span key={sev}
                          className={`text-xs font-mono px-2 py-0.5 rounded-full border ${cls}`}>
                          {cnt} {sev.toLowerCase()}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Processes by estado ── */}
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-emerald-500" />
            Guardados por estado
          </h2>

          {act.saved_count === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="Sin procesos guardados"
              desc="Guarda licitaciones desde el buscador para ver estadísticas aquí."
              to="/buscar"
              linkLabel="Ir al buscador"
            />
          ) : (
            <>
              {estados.map(e => (
                <HBar
                  key={e.estado}
                  label={e.estado}
                  count={e.count}
                  max={Math.max(1, ...estados.map(x => x.count))}
                />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── By department ── */}
      {depts.length > 0 && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 mb-4">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-emerald-500" />
            Procesos guardados por departamento
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            {depts.map(d => (
              <HBar
                key={d.departamento}
                label={d.departamento}
                count={d.count}
                max={maxDeptCount}
                budget={d.total_budget}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── 30-day timeline ── */}
      {act.saved_count > 0 && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 mb-4">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            Actividad últimos 30 días
          </h2>
          <p className="text-xs text-stone-600 mb-4">Procesos guardados por día</p>
          <Sparkline data={timeline} />
          <div className="flex justify-between text-[10px] text-stone-700 mt-1">
            <span>hace 30 días</span>
            <span>hoy</span>
          </div>
        </div>
      )}

      {/* ── Top 5 by budget ── */}
      {topBudget.length > 0 && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            Top 5 por presupuesto guardado
          </h2>
          <div className="space-y-3">
            {topBudget.map((p, i) => (
              <div key={i}
                className="flex items-start justify-between gap-3
                  pb-3 border-b border-white/5 last:border-0 last:pb-0">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="shrink-0 text-[10px] font-mono text-stone-600 mt-0.5 w-4">
                    #{i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-stone-300 line-clamp-1 font-medium">
                      {p.nombre_proceso || '—'}
                    </p>
                    <p className="text-xs text-stone-600 flex items-center gap-1 mt-0.5">
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span className="truncate">{p.entidad}</span>
                      {p.departamento && (
                        <span className="text-stone-700">· {p.departamento}</span>
                      )}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold text-emerald-400 font-mono whitespace-nowrap">
                  {formatCOP(p.precio_base)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state when truly no data */}
      {act.saved_count === 0 && act.eval_count === 0 && (
        <div className="text-center py-16 mt-4">
          <BarChart3 className="w-12 h-12 text-stone-700 mx-auto mb-4" />
          <p className="text-stone-400 font-medium mb-2">Aún no hay datos suficientes</p>
          <p className="text-stone-600 text-sm mb-6">
            Busca licitaciones, guárdalas y evalúalas con IA para ver tu analítica aquí.
          </p>
          <Link to="/buscar"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
              text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:opacity-90">
            Buscar licitaciones
          </Link>
        </div>
      )}
    </div>
  );
}
