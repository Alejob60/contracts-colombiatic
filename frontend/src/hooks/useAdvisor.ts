/**
 * useAdvisor — SSE streaming hook for the Contracts AI Advisor.
 * Sprint 21.
 */
import { useState, useCallback, useRef } from 'react';
import { getContractsToken } from '@/store/useAuthStore';
import type { SecopProcessCard } from '@/types/secop';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface AdvisorMessage {
  role:    'user' | 'assistant';
  content: string;
  streaming?: boolean;
}

export interface SearchCtx {
  query:   string;
  entidad: string;
  total:   number;
}

export function useAdvisor() {
  const [messages,  setMessages]  = useState<AdvisorMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error,     setError]     = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async (
    message: string,
    searchCtx?: SearchCtx | null,
    process?: SecopProcessCard | null,
  ) => {
    if (streaming) return;
    const token = getContractsToken();
    if (!token) return;

    setError('');
    setMessages(prev => [...prev, { role: 'user', content: message }]);
    setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }]);
    setStreaming(true);

    abortRef.current = new AbortController();

    try {
      const body: Record<string, unknown> = { message };
      if (searchCtx?.query || searchCtx?.entidad)
        body.search = { query: searchCtx.query, entidad: searchCtx.entidad, total: searchCtx.total };
      if (process)
        body.process = {
          proceso_id:               process.proceso_id,
          nombre_del_procedimiento: process.nombre_del_procedimiento,
          entidad:                  process.entidad,
          precio_base:              process.precio_base,
          modalidad:                process.modalidad,
          codigo_unspsc:            process.codigo_unspsc,
          estado:                   process.estado,
          descripcion:              process.descripcion,
        };

      const res = await fetch(`${API_BASE}/api/v1/advisor/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as {detail?: string}).detail ?? `Error ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          try {
            const ev = JSON.parse(payload);
            if (ev.text) {
              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === 'assistant')
                  copy[copy.length - 1] = { ...last, content: last.content + ev.text };
                return copy;
              });
            }
            if (ev.done) {
              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === 'assistant')
                  copy[copy.length - 1] = { ...last, streaming: false };
                return copy;
              });
            }
            if (ev.error) throw new Error(ev.error);
          } catch { /* skip bad json */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Error del asistente';
      setError(msg);
      setMessages(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last?.role === 'assistant' && last.streaming)
          copy[copy.length - 1] = { role: 'assistant', content: msg, streaming: false };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }, [streaming]);

  const clear = useCallback(async () => {
    setMessages([]);
    setError('');
    const token = getContractsToken();
    if (token)
      await fetch(`${API_BASE}/api/v1/advisor/chat`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  return { messages, streaming, error, send, clear, abort };
}
