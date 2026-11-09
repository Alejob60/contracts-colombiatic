/**
 * AlertasPage — Sprint 6: Smart SECOP alert configuration.
 *
 * PRO-only. User sets filters (keywords, UNSPSC, department, price range)
 * and delivery channel (email). The API worker polls SECOP every 6 hours
 * and sends matching processes via SES.
 *
 * Design decision: keyword + filter controls use simple text/chips to avoid
 * a multi-select library dependency. Comma-separated strings map directly to
 * the TEXT[] columns in the DB.
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, Mail, Phone, Loader2, Check,
  AlertCircle, Settings, Clock, Building2, Zap,
} from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';
import { formatCOP } from '@/lib/utils/formatCurrency';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────

interface AlertConfig {
  id?: string;
  is_active: boolean;
  min_match_score: number;
  channels: string[];
  email?: string;
  whatsapp_number?: string;
  unspsc_filter: string[];
  departamento_filter: string[];
  modalidad_filter: string[];
  precio_min?: number | null;
  precio_max?: number | null;
  keywords?: string | null;
  updated_at?: string;
}

interface AlertEvent {
  id: string;
  proceso_id: string;
  nombre_proceso?: string;
  entidad?: string;
  match_score?: number;
  channel: string;
  sent_at: string;
}

// ── Chip input helper ─────────────────────────────────────────────────────

function ChipInput({
  label, values, onChange, placeholder,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setDraft('');
  };

  const remove = (val: string) => onChange(values.filter(v => v !== val));

  return (
    <div>
      <label className="block text-xs text-stone-400 mb-1.5">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map(v => (
          <span key={v}
            className="flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-400
              border border-emerald-500/20 px-2 py-0.5 rounded-full">
            {v}
            <button onClick={() => remove(v)}
              className="hover:text-white ml-0.5 leading-none">×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text" value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); } }}
          placeholder={placeholder ?? 'Escribe y presiona Enter'}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm
            text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40"
        />
        <button onClick={commit} type="button"
          className="px-3 py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs
            hover:bg-emerald-500/20 transition-colors border border-emerald-500/20">
          +
        </button>
      </div>
    </div>
  );
}

// ── Recent event row ──────────────────────────────────────────────────────

function EventRow({ event }: { event: AlertEvent }) {
  const date = new Date(event.sent_at).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-white/5 last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-stone-300 line-clamp-1 font-medium">
          {event.nombre_proceso || event.proceso_id}
        </p>
        {event.entidad && (
          <p className="text-xs text-stone-600 flex items-center gap-1 mt-0.5">
            <Building2 className="w-3 h-3 shrink-0" />{event.entidad}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-center gap-1 text-xs text-stone-500 justify-end">
          {event.channel === 'email' ? <Mail className="w-3 h-3" /> : <Phone className="w-3 h-3" />}
          <span>{date}</span>
        </div>
        {event.match_score !== undefined && (
          <span className="text-[10px] text-emerald-600 font-mono">
            {event.match_score}% match
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export function AlertasPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isPro, user } = useAuthStore();

  const [config, setConfig] = useState<AlertConfig>({
    is_active: false,
    min_match_score: 70,
    channels: ['email'],
    email: '',
    whatsapp_number: '',
    unspsc_filter: [],
    departamento_filter: [],
    modalidad_filter: [],
    precio_min: null,
    precio_max: null,
    keywords: '',
  });
  const [events, setEvents]       = useState<AlertEvent[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);

  // ── Load config + events ──────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) { navigate('/auth?redirect=/dashboard/alertas'); return; }
    if (!isPro) { setLoading(false); return; }

    const token = getContractsToken();
    Promise.all([
      fetch(`${API_BASE}/api/v1/alerts/config`,
        { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API_BASE}/api/v1/alerts/events?limit=20`,
        { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
    ])
      .then(([cfg, evts]) => {
        setConfig({
          is_active:          cfg.is_active ?? false,
          min_match_score:    cfg.min_match_score ?? 70,
          channels:           cfg.channels ?? ['email'],
          email:              cfg.email ?? (user?.email ?? ''),
          whatsapp_number:    cfg.whatsapp_number ?? '',
          unspsc_filter:      cfg.unspsc_filter ?? [],
          departamento_filter:cfg.departamento_filter ?? [],
          modalidad_filter:   cfg.modalidad_filter ?? [],
          precio_min:         cfg.precio_min ?? null,
          precio_max:         cfg.precio_max ?? null,
          keywords:           cfg.keywords ?? '',
        });
        setEvents(evts.events ?? []);
      })
      .catch(() => setError('No se pudo cargar la configuración.'))
      .finally(() => setLoading(false));
  }, [isAuthenticated, isPro, navigate, user]);

  // ── Save ──────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    const token = getContractsToken();
    setSaving(true); setSaved(false); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/alerts/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setConfig(prev => ({ ...prev, ...updated }));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError('No se pudo guardar. Intenta de nuevo.');
      if (import.meta.env.DEV) console.error('[AlertasPage] save:', err);
    } finally {
      setSaving(false);
    }
  }, [config]);

  // ── Field helpers ─────────────────────────────────────────────────

  const set = <K extends keyof AlertConfig>(key: K, val: AlertConfig[K]) =>
    setConfig(prev => ({ ...prev, [key]: val }));

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
            <Bell className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">Alertas Inteligentes</h1>
            <p className="text-stone-500 text-sm">Notificaciones automáticas de licitaciones</p>
          </div>
        </div>
        <div className="p-6 bg-gradient-to-r from-emerald-500/10 to-teal-500/5
          border border-emerald-500/20 rounded-2xl text-center">
          <Zap className="w-10 h-10 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-white font-bold text-lg mb-2">Función PRO Licitador</h2>
          <p className="text-stone-400 text-sm mb-6">
            Recibe alertas por email cuando aparezcan nuevas licitaciones
            que coincidan con tu perfil de empresa.
          </p>
          <Link to="/checkout"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
              text-white font-semibold px-6 py-3 rounded-xl hover:opacity-90 transition-opacity text-sm">
            <Zap className="w-4 h-4" />
            Activar Plan PRO — $149.000/mes
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
            <Bell className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-white font-bold text-xl">Alertas Inteligentes</h1>
            <p className="text-stone-500 text-sm">
              SECOP se revisa cada 6 horas — recibirás un email por cada coincidencia
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-400
          bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Toggle */}
      <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.is_active
              ? <Bell className="w-5 h-5 text-emerald-400" />
              : <BellOff className="w-5 h-5 text-stone-500" />}
            <div>
              <p className="text-white font-medium text-sm">
                {config.is_active ? 'Alertas activadas' : 'Alertas desactivadas'}
              </p>
              <p className="text-stone-500 text-xs">
                {config.is_active
                  ? 'Recibirás notificaciones de nuevas licitaciones'
                  : 'No recibirás notificaciones'}
              </p>
            </div>
          </div>
          <button
            onClick={() => set('is_active', !config.is_active)}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              config.is_active ? 'bg-emerald-500' : 'bg-white/10'
            }`}>
            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              config.is_active ? 'left-7' : 'left-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Config form */}
      <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 space-y-5 mb-4">
        <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2">
          <Settings className="w-4 h-4 text-emerald-500" />
          Configuración de alertas
        </h2>

        {/* Channel */}
        <div>
          <label className="block text-xs text-stone-400 mb-2">Canal de notificación</label>
          <div className="flex gap-2">
            {(['email', 'whatsapp'] as const).map(ch => (
              <button
                key={ch}
                disabled={ch === 'whatsapp'}
                title={ch === 'whatsapp' ? 'WhatsApp disponible en Plan Enterprise (próximamente)' : undefined}
                onClick={() => {
                  if (ch === 'whatsapp') return;
                  const next = config.channels.includes(ch)
                    ? config.channels.filter(c => c !== ch)
                    : [...config.channels, ch];
                  set('channels', next.length ? next : ['email']);
                }}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  ch === 'whatsapp'
                    ? 'opacity-40 cursor-not-allowed bg-white/5 text-stone-600 border-white/10'
                    : config.channels.includes(ch)
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-white/5 text-stone-500 border-white/10 hover:border-white/20'
                }`}>
                {ch === 'email' ? <Mail className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                {ch === 'email' ? 'Email' : 'WhatsApp (próximamente)'}
              </button>
            ))}
          </div>
        </div>

        {/* Email */}
        {config.channels.includes('email') && (
          <div>
            <label className="block text-xs text-stone-400 mb-1.5">Email para notificaciones</label>
            <input
              type="email" value={config.email ?? ''}
              onChange={e => set('email', e.target.value)}
              placeholder="tu@email.com"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm
                text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40"
            />
          </div>
        )}

        {/* Keywords */}
        <div>
          <label className="block text-xs text-stone-400 mb-1.5">
            Palabras clave
            <span className="text-stone-600 ml-1">(separadas por coma — vacío = cualquier licitación)</span>
          </label>
          <input
            type="text" value={config.keywords ?? ''}
            onChange={e => set('keywords', e.target.value)}
            placeholder="software, tecnología, sistemas de información"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm
              text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40"
          />
        </div>

        {/* Department chips */}
        <ChipInput
          label="Departamentos"
          values={config.departamento_filter}
          onChange={v => set('departamento_filter', v)}
          placeholder="Cundinamarca, Valle del Cauca…"
        />

        {/* UNSPSC chips */}
        <ChipInput
          label="Códigos UNSPSC"
          values={config.unspsc_filter}
          onChange={v => set('unspsc_filter', v)}
          placeholder="81000000, 43000000…"
        />

        {/* Price range */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-stone-400 mb-1.5">Presupuesto mínimo (COP)</label>
            <input
              type="number" value={config.precio_min ?? ''}
              onChange={e => set('precio_min', e.target.value ? Number(e.target.value) : null)}
              placeholder="0"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm
                text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 mb-1.5">Presupuesto máximo (COP)</label>
            <input
              type="number" value={config.precio_max ?? ''}
              onChange={e => set('precio_max', e.target.value ? Number(e.target.value) : null)}
              placeholder="Sin límite"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm
                text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40"
            />
          </div>
        </div>

        {/* Min score */}
        <div>
          <label className="block text-xs text-stone-400 mb-1.5">
            Relevancia mínima: <span className="text-emerald-400 font-mono">{config.min_match_score}%</span>
          </label>
          <input
            type="range" min={0} max={100} step={5}
            value={config.min_match_score}
            onChange={e => set('min_match_score', Number(e.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="flex justify-between text-[10px] text-stone-600 mt-1">
            <span>Todas las licitaciones</span>
            <span>Solo las más relevantes</span>
          </div>
        </div>

        {/* Save button */}
        <button onClick={handleSave} disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400
            text-white font-semibold py-2.5 rounded-xl transition-colors disabled:opacity-50
            disabled:cursor-not-allowed text-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" />
           : saved  ? <Check className="w-4 h-4" />
           : <Bell className="w-4 h-4" />}
          {saving ? 'Guardando…' : saved ? '¡Guardado!' : 'Guardar configuración'}
        </button>
      </div>

      {/* Recent events */}
      {events.length > 0 && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-emerald-500" />
            Alertas enviadas recientemente
            <span className="text-xs text-stone-600 font-normal">({events.length})</span>
          </h2>
          <div>
            {events.map(ev => <EventRow key={ev.id} event={ev} />)}
          </div>
        </div>
      )}

      {events.length === 0 && config.is_active && (
        <div className="text-center py-8">
          <Bell className="w-8 h-8 text-stone-700 mx-auto mb-3" />
          <p className="text-stone-500 text-sm">
            Aún no se han enviado alertas. El worker revisa SECOP cada 6 horas.
          </p>
        </div>
      )}
    </div>
  );
}
