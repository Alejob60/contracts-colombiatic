/**
 * HermesChat — Sprint 15B.
 *
 * Conversational assistant embedded in the Workspace right panel.
 * Knows the process, company profile, uploaded documents and competition data.
 *
 * "Hermes" is the internal name for the procurement AI assistant.
 * Users see it simply as an assistant — never mention Claude or Bedrock.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, Send, Loader2, Trash2, Zap, ChevronDown } from 'lucide-react';
import { getContractsToken } from '@/store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface Message { role: 'user' | 'assistant'; content: string; }
interface QuickAction { id: string; label: string; }

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center
          shrink-0 mr-2 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-emerald-400" />
        </div>
      )}
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
        isUser
          ? 'bg-emerald-500/15 text-white rounded-tr-sm'
          : 'bg-white/5 text-stone-300 rounded-tl-sm'
      }`}>
        {msg.content.split('\n').map((line, i) => (
          <span key={i}>{line}{i < msg.content.split('\n').length - 1 && <br />}</span>
        ))}
      </div>
    </div>
  );
}

interface HermesChatProps {
  procesoId: string;
  procesoTitulo?: string;
}

export function HermesChat({ procesoId, procesoTitulo }: HermesChatProps) {
  const [messages, setMessages]   = useState<Message[]>([]);
  const [quickActions, setQuickActions] = useState<QuickAction[]>([]);
  const [input,    setInput]      = useState('');
  const [loading,  setLoading]    = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const token = () => getContractsToken();

  // Load history on mount
  useEffect(() => {
    if (!procesoId) return;
    fetch(`${API_BASE}/api/v1/workspace/${procesoId}/chat/history`, {
      headers: { Authorization: `Bearer ${token()}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setMessages(d.history ?? []);
          setQuickActions(d.quick_actions ?? []);
        }
      })
      .catch(() => {});
  }, [procesoId]);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/v1/workspace/${procesoId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ message: text, stream: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Ocurrió un error. Por favor intenta de nuevo.',
      }]);
    } finally {
      setLoading(false);
    }
  }, [procesoId, loading]);

  const clearHistory = async () => {
    await fetch(`${API_BASE}/api/v1/workspace/${procesoId}/chat`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    setMessages([]);
  };

  const isEmpty = messages.length === 0;

  return (
    <div className={`flex flex-col bg-white/[0.02] border border-white/8 rounded-2xl overflow-hidden
      transition-all ${collapsed ? 'h-12' : 'h-[560px]'}`}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/8
          cursor-pointer hover:bg-white/[0.02] transition-colors"
        onClick={() => setCollapsed(c => !c)}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-emerald-500/15 rounded-lg flex items-center justify-center">
            <Bot className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold">Hermes</p>
            <p className="text-stone-600 text-[10px]">Asistente de contratación</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && !collapsed && (
            <button
              onClick={e => { e.stopPropagation(); clearHistory(); }}
              className="p-1.5 text-stone-600 hover:text-red-400 hover:bg-red-500/5
                rounded-lg transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 text-stone-500 transition-transform ${
            collapsed ? 'rotate-180' : ''
          }`} />
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 scroll-smooth">
            {isEmpty && (
              <div className="text-center py-6">
                <Bot className="w-8 h-8 text-stone-700 mx-auto mb-3" />
                <p className="text-stone-500 text-sm font-medium mb-1">Hola, soy Hermes</p>
                <p className="text-stone-600 text-xs max-w-[200px] mx-auto leading-relaxed">
                  Tu asistente para preparar la propuesta de
                  {procesoTitulo ? ` "${procesoTitulo.slice(0, 60)}..."` : ' este proceso'}.
                </p>
              </div>
            )}

            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}

            {loading && (
              <div className="flex items-start gap-2 mb-3">
                <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center
                  justify-center shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="bg-white/5 rounded-2xl rounded-tl-sm px-3.5 py-2.5">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick actions */}
          {isEmpty && quickActions.length > 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5">
              {quickActions.map(qa => (
                <button key={qa.id} onClick={() => sendMessage(qa.id)}
                  className="text-[11px] text-stone-400 border border-white/10 bg-white/[0.02]
                    hover:border-emerald-500/20 hover:text-emerald-400 hover:bg-emerald-500/5
                    px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                  <Zap className="w-3 h-3" />
                  {qa.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-white/8">
            <form onSubmit={e => { e.preventDefault(); sendMessage(input); }}
              className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Pregunta sobre el proceso..."
                maxLength={1500}
                disabled={loading}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2
                  text-sm text-white placeholder-stone-600 focus:outline-none
                  focus:border-emerald-500/40 disabled:opacity-50 min-w-0"
              />
              <button type="submit" disabled={!input.trim() || loading}
                className="shrink-0 w-9 h-9 bg-emerald-500 hover:bg-emerald-400 text-white
                  rounded-xl flex items-center justify-center transition-colors
                  disabled:opacity-40 disabled:cursor-not-allowed">
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
