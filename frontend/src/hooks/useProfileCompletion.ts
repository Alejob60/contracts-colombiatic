/**
 * useProfileCompletion — fetches the profile completion score from the API.
 * Cached in memory for the session to avoid repeated requests.
 */
import { useState, useEffect } from 'react';
import { getContractsToken } from '@/store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface CompletionItem {
  key:    string;
  label:  string;
  points: number;
  done:   boolean;
}

export interface ProfileCompletion {
  score:       number;
  items:       CompletionItem[];
  missing:     { key: string; label: string; points: number }[];
  next_action: { key: string; label: string; points: number } | null;
  has_profile: boolean;
}

let _cache: ProfileCompletion | null = null;

export function useProfileCompletion(enabled = true) {
  const [data,    setData]    = useState<ProfileCompletion | null>(_cache);
  const [loading, setLoading] = useState(!_cache && enabled);

  useEffect(() => {
    if (!enabled || _cache) return;
    const token = getContractsToken();
    if (!token) { setLoading(false); return; }

    fetch(`${API_BASE}/api/v1/company/completion-score`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { _cache = d as ProfileCompletion; setData(d); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [enabled]);

  // Allow external invalidation (e.g. after profile save)
  const invalidate = () => { _cache = null; };

  return { data, loading, invalidate };
}
