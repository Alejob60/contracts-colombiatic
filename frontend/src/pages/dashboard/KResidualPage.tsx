/**
 * KResidualPage — Sprint 11A: Capacidad Residual de Contratación.
 *
 * Shows the company's remaining contracting capacity (K_residual) and
 * allows managing active contracts that consume it.
 *
 * K_total    = max contracting capacity in SMMLV (from company profile)
 * K_utilizado = sum(active contracts) / SMMLV_year
 * K_residual  = K_total - K_utilizado
 *
 * This is a required metric in most Colombian procurement habilitación
 * requirements (financial capacity indicators).
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  TrendingUp, Plus, Trash2, Loader2, AlertCircle,
  Check, Building2, Calendar, DollarSign, ChevronRight,
} from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';
import { formatCOP } from '@/lib/utils/formatCurrency';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Types ─────────────────────────────────────────────────────────────────

interface KSummary {
  k_total_smmlv?: number;
  k_utilizado_smmlv: number;
  k_residual_smmlv?: number;
  k_total_cop?: number;
  k_residual_cop?: number;
  smmlv_year: number;
  smmlv_valor: number;
  semaforo: string;
  semaforo_label: string;
  active_contracts_count: number;
  total_activo_cop: number;
}

interface ActiveContract {
  id: string; entidad: string; descripcion?: string;
  valor_cop: number; fecha_inicio: string; fecha_fin: string;
  estado: string; proceso_id?: string;
}

// ── Semáforo colors ───────────────────────────────────────────────────────

const SEMAFORO = {
  VERDE:    { cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
  AMARILLO: { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',       dot: 'bg-amber-400' },
  ROJO:     { cls: 'bg-red-500/15 text-red-400 border-red-500/30',             dot: 'bg-red-400' },
  SIN_DATOS:{ cls: 'bg-stone-500/15 text-stone-400 border-stone-500/30',       dot: 'bg-stone-500' },
};

// ── Gauge bar ─────────────────────────────────────────────────────────────

function KGauge({ pct, semaforo }: { pct: number; semaforo: string }) {
  const color = semaforo === 'VERDE' ? 'bg-emerald-500' :
                semaforo === 'AMARILLO' ? 'bg-amber-400' : 'bg-red-500';
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-stone-500">K utilizado</span>
        <span className="text-stone-400 font-mono">{Math.round(pct)}%</span>
      </div>
      <div className="h-3 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-stone-700">
        <span>0</span><span>K máximo</span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export function KResidualPage() {
  const navigate   = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [summary,   setSummary]   = useState<KSummary | null>(null);
  const [contracts, setContracts] = useState<ActiveContract[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    entidad: '', descripcion: '', valor_cop: '',
    fecha_inicio: '', fecha_fin: '', estado: 'ACTIVO', proceso_id: '',
  });

  const token = () => getContractsToken();

  useEffect(() => {
    if (!isAuthenticated) { navigate('/auth'); return; }
    const t = token();
    Promise.all([
      fetch(`${API_BASE}/api/v1/k-residual/`,         { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
      fetch(`${API_BASE}/api/v1/k-residual/contracts`, { headers: { Authorization: `Bearer ${t}` } }).then(r => r.json()),
    ])
      .then(([sum, conts]) => { setSummary(sum); setContracts(conts.contracts ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isAuthenticated, navigate]);

  const handleSave = useCallback(async () => {
    if (!form.entidad || !form.valor_cop || !form.fecha_inicio || !form.fecha_fin) {
      setError('Completa entidad, valor, fechas de inicio y fin');
      return;
    }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/k-residual/contracts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ...form, valor_cop: parseFloat(form.valor_cop.replace(/[^0-9.]/g,'')) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Reload
      const [sum, conts] = await Promise.all([
        fetch(`${API_BASE}/api/v1/k-residual/`,         { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
        fetch(`${API_BASE}/api/v1/k-residual/contracts`, { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json()),
      ]);
      setSummary(sum); setContracts(conts.contracts ?? []);
      setShowForm(false);
      setForm({ entidad:'', descripcion:'', valor_cop:'', fecha_inicio:'', fecha_fin:'', estado:'ACTIVO', proceso_id:'' });
    } catch { setError('Error guardando contrato'); }
    finally { setSaving(false); }
  }, [form]);

  const handleDelete = async (id: string) => {
    await fetch(`${API_BASE}/api/v1/k-residual/contracts/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
    });
    setContracts(prev => prev.filter(c => c.id !== id));
    // Reload summary
    const sum = await fetch(`${API_BASE}/api/v1/k-residual/`, { headers: { Authorization: `Bearer ${token()}` } }).then(r => r.json());
    setSummary(sum);
  };

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const inputCls = `w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm
    text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40`;

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>;

  const semCfg = SEMAFORO[summary?.semaforo as keyof typeof SEMAFORO] ?? SEMAFORO.SIN_DATOS;
  const kPct = summary?.k_total_smmlv
    ? (summary.k_utilizado_smmlv / summary.k_total_smmlv) * 100 : 0;

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-white font-bold text-xl">Capacidad Residual (K)</h1>
          <p className="text-stone-500 text-sm">Cuánto más puedes contratar</p>
        </div>
      </div>

      {/* No K configured */}
      {!summary?.k_total_smmlv && (
        <div className="mb-4 p-4 bg-amber-500/5 border border-amber-500/15 rounded-2xl flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-stone-300 text-sm font-medium mb-1">Configura tu Capacidad K</p>
            <p className="text-stone-500 text-xs">
              Necesitas ingresar tu Capacidad K de Contratación en tu perfil de empresa (campo "Capacidad K" en SMMLV).
              Este dato lo encuentras en tu RUP actualizado.
            </p>
            <Link to="/dashboard/perfil"
              className="inline-flex items-center gap-1 text-xs text-emerald-400 mt-2 hover:text-emerald-300">
              Ir al perfil de empresa <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      {/* K Summary card */}
      {summary && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-stone-500 text-xs mb-1">Semáforo de capacidad</p>
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1
                rounded-full border ${semCfg.cls}`}>
                <span className={`w-2 h-2 rounded-full ${semCfg.dot}`} />
                {summary.semaforo_label}
              </span>
            </div>
            <div className="text-right">
              <p className="text-stone-500 text-xs">SMMLV {summary.smmlv_year}</p>
              <p className="text-stone-400 text-xs font-mono">{formatCOP(summary.smmlv_valor)}</p>
            </div>
          </div>

          {/* K gauge */}
          {summary.k_total_smmlv && (
            <KGauge pct={kPct} semaforo={summary.semaforo} />
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="text-center p-2.5 bg-white/5 rounded-xl">
              <p className="text-white font-bold text-sm">{summary.k_total_smmlv?.toFixed(0) ?? '—'}</p>
              <p className="text-[10px] text-stone-600">K Total (SMMLV)</p>
            </div>
            <div className="text-center p-2.5 bg-white/5 rounded-xl">
              <p className="text-amber-400 font-bold text-sm">{summary.k_utilizado_smmlv.toFixed(1)}</p>
              <p className="text-[10px] text-stone-600">K Utilizado</p>
            </div>
            <div className={`text-center p-2.5 rounded-xl ${
              summary.semaforo === 'VERDE' ? 'bg-emerald-500/10' :
              summary.semaforo === 'ROJO' ? 'bg-red-500/10' : 'bg-white/5'
            }`}>
              <p className={`font-bold text-sm ${
                summary.semaforo === 'VERDE' ? 'text-emerald-400' :
                summary.semaforo === 'ROJO' ? 'text-red-400' : 'text-stone-300'
              }`}>{summary.k_residual_smmlv?.toFixed(1) ?? '—'}</p>
              <p className="text-[10px] text-stone-600">K Residual</p>
            </div>
          </div>

          {summary.k_residual_cop !== undefined && (
            <p className="text-center text-xs text-stone-500 mt-2">
              Puedes contratar hasta{' '}
              <span className="text-emerald-400 font-semibold">
                {formatCOP(summary.k_residual_cop)}
              </span>{' '}
              adicionales
            </p>
          )}
        </div>
      )}

      {/* Active contracts list */}
      <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-stone-300 font-semibold text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-500" />
            Contratos activos ({contracts.length})
          </h2>
          <button onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10
              border border-emerald-500/20 px-3 py-1.5 rounded-lg hover:bg-emerald-500/15">
            <Plus className="w-3.5 h-3.5" />
            Agregar contrato
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="mb-4 p-4 bg-white/[0.02] border border-white/8 rounded-xl space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-stone-500 mb-1">Entidad *</label>
                <input type="text" value={form.entidad} onChange={f('entidad')}
                  placeholder="Nombre de la entidad contratante" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Valor del contrato (COP) *</label>
                <input type="text" value={form.valor_cop} onChange={f('valor_cop')}
                  placeholder="150000000" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Estado</label>
                <select value={form.estado} onChange={f('estado')}
                  className={`${inputCls} [&>option]:bg-[#0F1929]`}>
                  <option value="ACTIVO">Activo</option>
                  <option value="FINALIZADO">Finalizado</option>
                  <option value="SUSPENDIDO">Suspendido</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Fecha inicio *</label>
                <input type="date" value={form.fecha_inicio} onChange={f('fecha_inicio')} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Fecha fin *</label>
                <input type="date" value={form.fecha_fin} onChange={f('fecha_fin')} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">No. Proceso SECOP (opcional)</label>
                <input type="text" value={form.proceso_id} onChange={f('proceso_id')}
                  placeholder="CO1.REQ...." className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Descripción</label>
                <input type="text" value={form.descripcion} onChange={f('descripcion')}
                  placeholder="Objeto del contrato" className={inputCls} />
              </div>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 text-xs text-stone-400 border border-white/10 rounded-lg hover:bg-white/5">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 text-xs bg-emerald-500
                  hover:bg-emerald-400 text-white font-semibold py-2 rounded-lg disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {saving ? 'Guardando…' : 'Guardar contrato'}
              </button>
            </div>
          </div>
        )}

        {/* Contracts list */}
        {contracts.length === 0 && !showForm && (
          <div className="text-center py-8">
            <Building2 className="w-8 h-8 text-stone-700 mx-auto mb-2" />
            <p className="text-stone-500 text-sm">Sin contratos activos registrados</p>
            <p className="text-stone-600 text-xs mt-1">
              Agrega tus contratos activos para calcular la capacidad residual exacta.
            </p>
          </div>
        )}

        <div className="space-y-2">
          {contracts.map(c => (
            <div key={c.id}
              className="flex items-start justify-between gap-3 p-3 bg-white/[0.02]
                rounded-xl border border-white/5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-stone-300 text-sm font-medium truncate">{c.entidad}</p>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    c.estado === 'ACTIVO' ? 'bg-emerald-500/10 text-emerald-500' :
                    'bg-stone-500/10 text-stone-500'}`}>
                    {c.estado}
                  </span>
                </div>
                {c.descripcion && <p className="text-xs text-stone-600 truncate">{c.descripcion}</p>}
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-emerald-400 flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />{formatCOP(c.valor_cop)}
                  </span>
                  <span className="text-xs text-stone-600 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {c.fecha_inicio} → {c.fecha_fin}
                  </span>
                </div>
              </div>
              <button onClick={() => handleDelete(c.id)}
                className="shrink-0 p-1.5 text-stone-600 hover:text-red-400 hover:bg-red-500/5
                  rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Help */}
      <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs text-stone-600 leading-relaxed">
        <p className="text-stone-400 font-medium mb-1">¿Qué es la Capacidad K?</p>
        La Capacidad de Contratación (K) indica cuánto puedes contratar simultáneamente.
        Se calcula en SMMLV y se descontará por cada contrato que estés ejecutando.
        Muchas entidades exigen K_residual mayor al valor del proceso para habilitarte.
        Tu K total está en tu RUP actualizado.
      </div>
    </div>
  );
}
