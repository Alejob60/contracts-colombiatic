/**
 * UsageMeter — Sprint 14.
 * Shows current month usage vs plan limits in the dashboard header.
 * Triggers upgrade prompt when > 80% used.
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Zap, AlertTriangle } from 'lucide-react';
import { getContractsToken } from '@/store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface UsageResource {
  used: number;
  limit: number;
  pct: number | null;
}

interface UsageData {
  plan: string;
  plan_label: string;
  evals: UsageResource;
  docs: UsageResource;
  upgrade_to?: string;
}

const PLAN_COLORS: Record<string, string> = {
  FREE:          'text-stone-400',
  PRO_LICITADOR: 'text-emerald-400',
  PRO:           'text-emerald-400',
  CORPORATIVO:   'text-blue-400',
  ENTERPRISE:    'text-purple-400',
};

function Bar({ pct, warning }: { pct: number | null; warning?: boolean }) {
  if (pct === null) return <span className="text-[10px] text-stone-600">∞</span>;
  return (
    <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function UsageMeter() {
  const [data, setData] = useState<UsageData | null>(null);

  useEffect(() => {
    const token = getContractsToken();
    if (!token) return;
    fetch(`${API_BASE}/api/v1/usage/current`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))
      .catch(() => {});
  }, []);

  if (!data) return null;

  const evals = data.evals;
  const docs = data.docs;
  const warn = (evals.pct ?? 0) >= 80 || (docs.pct ?? 0) >= 80;

  return (
    <div className="flex items-center gap-3">
      {/* Plan badge */}
      <span className={`text-[10px] font-semibold uppercase tracking-wider ${PLAN_COLORS[data.plan] ?? 'text-stone-400'}`}>
        {data.plan_label}
      </span>

      {/* Usage bars */}
      <div className="hidden sm:flex items-center gap-3">
        {evals.limit !== 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-stone-600">IA</span>
            <Bar pct={evals.pct} />
            <span className="text-[10px] text-stone-600 font-mono">
              {evals.limit === -1 ? '∞' : `${evals.used}/${evals.limit}`}
            </span>
          </div>
        )}
        {docs.limit !== 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-stone-600">Docs</span>
            <Bar pct={docs.pct} />
            <span className="text-[10px] text-stone-600 font-mono">
              {docs.limit === -1 ? '∞' : `${docs.used}/${docs.limit}`}
            </span>
          </div>
        )}
      </div>

      {/* Upgrade nudge */}
      {warn && data.upgrade_to && (
        <Link
          to="/pricing"
          className="flex items-center gap-1 text-[10px] text-amber-400
            bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg
            hover:bg-amber-500/15 transition-colors font-medium">
          <AlertTriangle className="w-3 h-3" />
          Actualizar
        </Link>
      )}

      {/* Show upgrade for FREE users with 0 evals */}
      {data.plan === 'FREE' && (
        <Link
          to="/pricing"
          className="flex items-center gap-1 text-[10px] text-emerald-400
            bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg
            hover:bg-emerald-500/15 transition-colors font-medium">
          <Zap className="w-3 h-3" />
          PRO
        </Link>
      )}
    </div>
  );
}
