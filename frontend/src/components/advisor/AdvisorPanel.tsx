/**
 * AdvisorPanel — Sprint 21: Asesor de Contratos IA.
 *
 * Floating panel (right side on desktop, bottom sheet on mobile).
 * Context-aware: knows current search query and selected process.
 * Streams responses from Claude via SSE.
 */
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, X, Send, Trash2, Loader2, ChevronRight, Sparkles,
} from 'lucide-react';
import { useAdvisor, type SearchCtx } from '@/hooks/useAdvisor';
import type { SecopProcessCard } from '@/types/secop';

interface AdvisorPanelProps {
  searchCtx?:      SearchCtx | null;
  selectedProcess?: SecopProcessCard | null;
}

const QUICK_SEARCH = [
  { id: 'mejores',  label: '¿Cuál proceso me conviene más?' },
  { id: 'afinar',   label: 'Afina la búsqueda' },
  { id: 'unspsc',   label: '¿Qué UNSPSC usar?' },
  { id: 'perfil',   label: '¿Qué falta en mi perfil?' },
];

const QUICK_PROCESS = [
  { id: 'viabilidad',  label: '¿Puedo ganar esto?' },
  { id: 'faltantes',   label: '¿Qué me falta para habilitar?' },
  { id: 'presupuesto', label: '¿Es realista el presupuesto?' },
  { id: 'similares',   label: 'Buscar similares' },
];

export function AdvisorPanel({ searchCtx, selectedProcess }: AdvisorPanelProps) {
  const [open,  setOpen]  = useState(false);
  const [input, setInput] = useState('');
  const { messages, streaming, error, send, clear } = useAdvisor();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset context chip when process changes
  const hasProcess = !!selectedProcess;
  const quickActions = hasProcess ? QUICK_PROCESS : QUICK_SEARCH;

  const handleSend = (msg: string) => {
    if (!msg.trim() || streaming) return;
    send(msg.trim(), searchCtx, selectedProcess);
    setInput('');
  };

  const contextLabel = selectedProcess
    ? selectedProcess.nombre_del_procedimiento.slice(0, 60) + (selectedProcess.nombre_del_procedimiento.length > 60 ? '…' : '')
    : searchCtx?.query
      ? `"${searchCtx.query}" · ${searchCtx.total.toLocaleString('es-CO')} resultados`
      : 'Sin búsqueda activa';

  return (
    <>
      {/* Toggle FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2
          px-4 py-3 rounded-2xl shadow-lg font-semibold text-sm
          transition-all duration-200
          ${open
            ? 'bg-stone-800 border border-white/10 text-stone-300'
            : 'bg-gradient-to-r from-emerald-500 to-teal-400 text-white hover:opacity-90'
          }`}
      >
        {open ? <X className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
        {open ? 'Cerrar' : 'Asesor IA'}
        {!open && messages.length > 0 && (
          <span className="w-2 h-2 bg-white rounded-full" />
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, x: 24, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 24, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed bottom-20 right-6 z-50
              w-[90vw] sm:w-[380px] max-h-[70vh]
              flex flex-col
              bg-[#0d1724] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-emerald-500/15 rounded-lg flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white text-xs font-semibold leading-none">Asesor de Contratos</p>
                  <p className="text-stone-600 text-[10px] mt-0.5">IA · ColombiaTIC Contracts</p>
                </div>
              </div>
              {messages.length > 0 && (
                <button onClick={clear}
                  className="text-stone-700 hover:text-stone-500 transition-colors p-1 rounded-lg hover:bg-white/5"
                  title="Limpiar conversación">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Context chip */}
            <div className="px-4 py-2 border-b border-white/5 shrink-0">
              <p className="text-[10px] text-stone-700 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${hasProcess ? 'bg-blue-400' : searchCtx?.query ? 'bg-emerald-500' : 'bg-stone-700'}`} />
                <span className="truncate">{contextLabel}</span>
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <Bot className="w-8 h-8 text-stone-700 mx-auto mb-2" />
                  <p className="text-stone-500 text-xs mb-1">Consejero estratégico</p>
                  <p className="text-stone-700 text-[10px]">
                    {hasProcess
                      ? 'Estoy listo para analizar este proceso contigo'
                      : searchCtx?.query
                        ? 'Puedo ayudarte a priorizar estos resultados'
                        : 'Haz una búsqueda y te ayudo a encontrar el proceso ideal'}
                  </p>
                </div>
              )}

              {messages.map((m, i) => (
                <div key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[86%] rounded-xl px-3 py-2 text-xs leading-relaxed
                    ${m.role === 'user'
                      ? 'bg-emerald-500/15 text-white ml-4'
                      : 'bg-white/5 text-stone-300 mr-4 border border-white/5'
                    }`}
                  >
                    {m.content || (m.streaming && (
                      <span className="flex items-center gap-1 text-stone-500">
                        <Loader2 className="w-3 h-3 animate-spin" /> pensando…
                      </span>
                    ))}
                    {m.streaming && m.content && (
                      <span className="inline-block w-1 h-3 bg-emerald-400 animate-pulse ml-0.5 align-middle" />
                    )}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {/* Quick actions (shown when no messages yet or after assistant responds) */}
            {(messages.length === 0 || (!streaming && messages[messages.length - 1]?.role === 'assistant')) && (
              <div className="px-4 pb-2 flex flex-wrap gap-1.5 shrink-0">
                {quickActions.map(a => (
                  <button key={a.id}
                    onClick={() => handleSend(a.id)}
                    disabled={streaming}
                    className="text-[10px] px-2.5 py-1 bg-white/5 border border-white/8
                      text-stone-400 rounded-lg hover:bg-white/8 hover:text-white
                      disabled:opacity-40 transition-all flex items-center gap-1">
                    <ChevronRight className="w-2.5 h-2.5" />
                    {a.label}
                  </button>
                ))}
              </div>
            )}

            {/* Error */}
            {error && (
              <p className="px-4 pb-2 text-red-400 text-[10px] shrink-0">{error}</p>
            )}

            {/* Input */}
            <div className="px-3 pb-3 pt-1 border-t border-white/5 shrink-0">
              <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-xl px-3 py-2">
                <input
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend(input))}
                  placeholder="Pregunta al asesor…"
                  disabled={streaming}
                  className="flex-1 bg-transparent text-xs text-white placeholder-stone-700
                    outline-none disabled:opacity-50"
                />
                <button
                  onClick={() => handleSend(input)}
                  disabled={!input.trim() || streaming}
                  className="shrink-0 w-6 h-6 bg-emerald-500 rounded-lg flex items-center justify-center
                    hover:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  {streaming
                    ? <Loader2 className="w-3 h-3 text-white animate-spin" />
                    : <Send className="w-3 h-3 text-white" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
