/**
 * useSearchHistory — localStorage search history hook.
 * Stores last 8 searches (query + filters) for quick repeat.
 */
import { useState, useCallback } from 'react';

const STORAGE_KEY = 'contracts_search_history';
const MAX_ITEMS = 8;

export interface SearchHistoryItem {
  query:     string;
  timestamp: number;  // ms
}

function load(): SearchHistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(items: SearchHistoryItem[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* ignore */ }
}

export function useSearchHistory() {
  const [history, setHistory] = useState<SearchHistoryItem[]>(load);

  const push = useCallback((query: string) => {
    if (!query.trim()) return;
    setHistory(prev => {
      const filtered = prev.filter(h => h.query.toLowerCase() !== query.toLowerCase());
      const next = [{ query: query.trim(), timestamp: Date.now() }, ...filtered].slice(0, MAX_ITEMS);
      save(next);
      return next;
    });
  }, []);

  const remove = useCallback((query: string) => {
    setHistory(prev => {
      const next = prev.filter(h => h.query !== query);
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
    save([]);
  }, []);

  return { history, push, remove, clear };
}
