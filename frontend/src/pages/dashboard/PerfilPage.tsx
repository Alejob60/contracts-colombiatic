import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getContractsToken } from '@/store/useAuthStore';
import {
  Building2, Save, Loader2, CheckCircle2, X, Plus,
} from 'lucide-react';
import { DEPARTAMENTOS } from '@/lib/constants/departments';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface Profile {
  nit: string; nit_dv?: string; razon_social: string;
  nombre_comercial?: string; representante?: string;
  email_contacto?: string; telefono?: string;
  departamento?: string; ciudad?: string;
  unspsc_codes: string[]; capacidad_k?: number;
  sector?: string; tamano?: string;
  palabras_negativas: string[];
}

const TAMANOS = [
  { value: 'MICRO',   label: 'Microempresa (< 10 empleados)' },
  { value: 'PEQUENA', label: 'Pequeña (10–50 empleados)' },
  { value: 'MEDIANA', label: 'Mediana (50–200 empleados)' },
  { value: 'GRANDE',  label: 'Grande (> 200 empleados)' },
];

const inputCls = `w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white
  placeholder-stone-600 focus:outline-none focus:border-emerald-500/50 transition-colors`;

const labelCls = `block text-xs text-stone-500 mb-1.5 uppercase tracking-wider font-medium`;

export function PerfilPage() {
  const [profile, setProfile] = useState<Profile>({
    nit: '', razon_social: '', unspsc_codes: [], palabras_negativas: [],
  });
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [error,    setError]    = useState('');
  const [unspscInput, setUnspscInput] = useState('');
  const [negKwInput, setNegKwInput] = useState('');

  useEffect(() => {
    const token = getContractsToken();
    fetch(`${API_BASE}/api/v1/company/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setProfile(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (key: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setProfile(p => ({ ...p, [key]: e.target.value }));

  const addUnspsc = () => {
    const code = unspscInput.trim().replace(/\D/g, '');
    if (code && !profile.unspsc_codes.includes(code)) {
      setProfile(p => ({ ...p, unspsc_codes: [...p.unspsc_codes, code] }));
    }
    setUnspscInput('');
  };

  const removeUnspsc = (code: string) =>
    setProfile(p => ({ ...p, unspsc_codes: p.unspsc_codes.filter(c => c !== code) }));

  const addNegKw = () => {
    const kw = negKwInput.trim().toLowerCase();
    if (kw && !(profile.palabras_negativas || []).includes(kw)) {
      setProfile(p => ({ ...p, palabras_negativas: [...(p.palabras_negativas || []), kw] }));
    }
    setNegKwInput('');
  };
  const removeNegKw = (kw: string) =>
    setProfile(p => ({ ...p, palabras_negativas: (p.palabras_negativas || []).filter(k => k !== kw) }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      const token = getContractsToken();
      const res = await fetch(`${API_BASE}/api/v1/company/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(profile),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.detail ?? `Error ${res.status}`);
      }
      const data = await res.json();
      setProfile(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando perfil');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
    </div>
  );

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
          <Building2 className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-white font-bold text-xl">Perfil de Empresa</h1>
          <p className="text-stone-500 text-sm">La IA usará este perfil para evaluar licitaciones</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {error}
        </div>
      )}
      {saved && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Perfil guardado correctamente
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-5">
        {/* NIT */}
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className={labelCls}>NIT *</label>
            <input type="text" inputMode="numeric" placeholder="900123456"
              value={profile.nit} onChange={set('nit')} required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Dígito</label>
            <input type="text" maxLength={1} placeholder="0"
              value={profile.nit_dv ?? ''} onChange={set('nit_dv')} className={inputCls} />
          </div>
        </div>

        {/* Razón social */}
        <div>
          <label className={labelCls}>Razón Social *</label>
          <input type="text" placeholder="EMPRESA SAS"
            value={profile.razon_social} onChange={set('razon_social')} required className={inputCls} />
        </div>

        {/* Nombre comercial */}
        <div>
          <label className={labelCls}>Nombre Comercial</label>
          <input type="text" placeholder="Nombre como aparece en el mercado"
            value={profile.nombre_comercial ?? ''} onChange={set('nombre_comercial')} className={inputCls} />
        </div>

        {/* Representante */}
        <div>
          <label className={labelCls}>Representante Legal</label>
          <input type="text" placeholder="Nombre completo"
            value={profile.representante ?? ''} onChange={set('representante')} className={inputCls} />
        </div>

        {/* Email + Teléfono */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Email contacto</label>
            <input type="email" placeholder="contacto@empresa.com"
              value={profile.email_contacto ?? ''} onChange={set('email_contacto')} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Teléfono</label>
            <input type="tel" placeholder="+57 300 000 0000"
              value={profile.telefono ?? ''} onChange={set('telefono')} className={inputCls} />
          </div>
        </div>

        {/* Departamento + Ciudad */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Departamento</label>
            <select value={profile.departamento ?? ''} onChange={set('departamento')}
              className={`${inputCls} [&>option]:bg-[#0F1929]`}>
              <option value="">Seleccionar</option>
              {DEPARTAMENTOS.map(d => <option key={d.code} value={d.name}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Ciudad</label>
            <input type="text" placeholder="Cali"
              value={profile.ciudad ?? ''} onChange={set('ciudad')} className={inputCls} />
          </div>
        </div>

        {/* Tamaño + Sector */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Tamaño empresa</label>
            <select value={profile.tamano ?? ''} onChange={set('tamano')}
              className={`${inputCls} [&>option]:bg-[#0F1929]`}>
              <option value="">Seleccionar</option>
              {TAMANOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Capacidad K (SMMLV)</label>
            <input type="number" min={0} placeholder="50000"
              value={profile.capacidad_k ?? ''} onChange={set('capacidad_k' as keyof Profile)} className={inputCls} />
          </div>
        </div>

        {/* Sector */}
        <div>
          <label className={labelCls}>Sector principal</label>
          <input type="text" placeholder="Ej: Tecnología de la información"
            value={profile.sector ?? ''} onChange={set('sector')} className={inputCls} />
        </div>

        {/* UNSPSC codes */}
        <div>
          <label className={labelCls}>Códigos UNSPSC (actividades económicas)</label>
          <div className="flex gap-2 mb-2">
            <input type="text" inputMode="numeric" placeholder="Ej: 81111500"
              value={unspscInput} onChange={e => setUnspscInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addUnspsc(); } }}
              className={`${inputCls} flex-1`} />
            <button type="button" onClick={addUnspsc}
              className="px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl
                text-emerald-400 hover:bg-emerald-500/15 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {profile.unspsc_codes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {profile.unspsc_codes.map(code => (
                <span key={code} className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400
                  text-xs px-2.5 py-1 rounded-full border border-emerald-500/20">
                  {code}
                  <button type="button" onClick={() => removeUnspsc(code)}
                    className="hover:text-red-400 transition-colors ml-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <p className="text-stone-600 text-xs mt-1.5">Presiona Enter o coma para agregar. Estos códigos determinan qué licitaciones coinciden con tu empresa.</p>
        </div>

            {/* Palabras negativas — search exclusion filter */}
            <div>
              <label className={labelCls}>Excluir de búsquedas</label>
              <p className="text-xs text-stone-600 mb-2">
                Procesos que contengan estas palabras se ocultarán automáticamente de tus resultados.
              </p>
              <div className="flex gap-2 mb-2">
                <input
                  value={negKwInput}
                  onChange={e => setNegKwInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addNegKw())}
                  placeholder="ej: vigilancia, aseo, personal temporal"
                  className={inputCls + ' flex-1'}
                />
                <button
                  type="button"
                  onClick={addNegKw}
                  className="px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400
                    hover:bg-red-500/20 rounded-xl text-sm transition-colors flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Excluir
                </button>
              </div>
              {(profile.palabras_negativas || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(profile.palabras_negativas || []).map(kw => (
                    <span key={kw} className="flex items-center gap-1 text-xs bg-red-500/8
                      border border-red-500/15 text-red-400 px-2 py-0.5 rounded-full">
                      🚫 {kw}
                      <button onClick={() => removeNegKw(kw)}
                        className="text-red-600 hover:text-red-400 ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

        <div className="flex items-center justify-between pt-2">
          <Link to="/dashboard" className="text-stone-500 hover:text-stone-300 text-sm transition-colors">
            ← Volver al dashboard
          </Link>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
              text-white font-semibold px-6 py-2.5 rounded-xl hover:opacity-90
              disabled:opacity-50 transition-all text-sm">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </div>
      </form>
    </div>
  );
}
