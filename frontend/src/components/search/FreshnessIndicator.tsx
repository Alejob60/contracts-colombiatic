/**
 * FreshnessIndicator — shows data provenance to users.
 * Answers: "How old is this data? When did the government update it?"
 */
import { useState, useEffect } from 'react';
import { Database, RefreshCw } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface FreshnessData {
  cache_total?: number;
  age_minutes?: number;
  govt_last_updated_display?: string;
  govt_lag_hours?: number;
  govt_is_fresh?: boolean;
  soda_row_count?: number;
  warm?: boolean;
}

export function FreshnessIndicator() {
  const [data, setData] = useState<FreshnessData | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/secop/freshness`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))
      .catch(() => {});
  }, []);

  if (!data) return null;

  const lagH = data.govt_lag_hours;
  const isFresh = data.govt_is_fresh;

  return (
    <div className="flex items-center gap-2 text-[11px] text-stone-600">
      <Database className="w-3 h-3 shrink-0" />
      <span>
        {data.soda_row_count
          ? `${(data.soda_row_count / 1000).toFixed(0)}K procesos`
          : 'SECOP II'}
        {data.govt_last_updated_display && (
          <span className={`ml-1 ${isFresh ? 'text-emerald-600' : 'text-amber-600'}`}>
            · gobierno actualizó hace{' '}
            {lagH !== undefined && lagH < 24
              ? `${lagH.toFixed(0)}h`
              : `${((lagH ?? 0) / 24).toFixed(0)} días`}
          </span>
        )}
        {data.cache_total && data.cache_total > 1000 && (
          <span className="ml-1 text-emerald-700">
            · {(data.cache_total / 1000).toFixed(0)}K en caché local
          </span>
        )}
      </span>
    </div>
  );
}
