/**
 * ProfileWizardPage — Sprint 20.
 *
 * 5-step onboarding wizard to complete the company profile.
 * Accessible at /dashboard/perfil/wizard and linked from the completion banner.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, MapPin, Tag, TrendingUp, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, X, Plus,
} from 'lucide-react';
import { getContractsToken } from '@/store/useAuthStore';
import { DEPARTAMENTOS } from '@/lib/constants/departments';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

const inp = `w-full bg-white/5 border border-white/8 rounded-xl px-3 py-2.5 text-sm text-white
  placeholder-stone-600 focus:outline-none focus:border-emerald-500/50 transition-colors`;
const lbl = `block text-xs text-stone-500 mb-1.5 uppercase tracking-wider font-medium`;

const TAMANOS = [
  { value: 'MICRO',   label: 'Microempresa (< 10)' },
  { value: 'PEQUENA', label: 'Pequeña (10–50)' },
  { value: 'MEDIANA', label: 'Mediana (50–200)' },
  { value: 'GRANDE',  label: 'Grande (> 200)' },
];

const SECTORES = [
  'Tecnología de la información y software',
  'Ingeniería civil y construcción',
  'Salud y servicios médicos',
  'Consultoría y asesoría',
  'Suministro de bienes y equipos',
  'Educación y capacitación',
  'Medio ambiente y saneamiento',
  'Seguridad y vigilancia',
  'Comunicaciones y medios',
  'Otro',
];

interface WizardData {
  nit: string; nit_dv: string; razon_social: string; representante: string;
  email_contacto: string; sector: string; tamano: string;
  departamento: string; ciudad: string;
  unspsc_codes: string[]; palabras_negativas: string[];
  capacidad_k: string; presupuesto_min_interes: string; experiencia_anos: string;
}

const EMPTY: WizardData = {
  nit: '', nit_dv: '', razon_social: '', representante: '', email_contacto: '',
  sector: '', tamano: '', departamento: '', ciudad: '',
  unspsc_codes: [], palabras_negativas: [],
  capacidad_k: '', presupuesto_min_interes: '', experiencia_anos: '',
};

const STEPS = [
  { icon: Building2, title: 'Datos de la empresa',   sub: 'Identidad legal' },
  { icon: MapPin,    title: 'Zona de operación',      sub: 'Dónde contratan' },
  { icon: Tag,       title: 'Actividad económica',    sub: 'UNSPSC y sector' },
  { icon: TrendingUp,title: 'Capacidad',              sub: 'K y presupuesto' },
  { icon: CheckCircle2, title: '¡Listo!',             sub: 'Perfil completo' },
];

export function ProfileWizardPage() {
  const navigate = useNavigate();
  const [step, setStep]   = useState(0);
  const [data, setData]   = useState<WizardData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [unspscInput, setUnspscInput] = useState('');
  const [negInput,    setNegInput]    = useState('');
  const [error, setError] = useState('');

  const set = (k: keyof WizardData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setData(p => ({ ...p, [k]: e.target.value }));

  const addUnspsc = () => {
    const c = unspscInput.trim().replace(/\D/g, '');
    if (c && !data.unspsc_codes.includes(c))
      setData(p => ({ ...p, unspsc_codes: [...p.unspsc_codes, c] }));
    setUnspscInput('');
  };
  const addNeg = () => {
    const w = negInput.trim().toLowerCase();
    if (w && !data.palabras_negativas.includes(w))
      setData(p => ({ ...p, palabras_negativas: [...p.palabras_negativas, w] }));
    setNegInput('');
  };

  const canNext = (): boolean => {
    if (step === 0) return !!(data.nit && data.razon_social);
    if (step === 2) return data.unspsc_codes.length > 0;
    return true;
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const token = getContractsToken();
      const payload = {
        ...data,
        capacidad_k:            data.capacidad_k ? Number(data.capacidad_k) : null,
        presupuesto_min_interes: data.presupuesto_min_interes ? Number(data.presupuesto_min_interes) : null,
        experiencia_anos:        data.experiencia_anos ? Number(data.experiencia_anos) : null,
      };
      const res = await fetch(`${API_BASE}/api/v1/company/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? `Error ${res.status}`);
      setStep(4); // success step
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando perfil');
    } finally {
      setSaving(false);
    }
  };

  const stepContent = [
    // Step 0 — Empresa
    <div key="s0" className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className={lbl}>NIT *</label>
          <input value={data.nit} onChange={set('nit')} placeholder="900123456"
            inputMode="numeric" className={inp} required />
        </div>
        <div>
          <label className={lbl}>Dígito</label>
          <input value={data.nit_dv} onChange={set('nit_dv')} placeholder="0"
            maxLength={1} className={inp} />
        </div>
      </div>
      <div>
        <label className={lbl}>Razón Social *</label>
        <input value={data.razon_social} onChange={set('razon_social')}
          placeholder="EMPRESA SOLUCIONES SAS" className={inp} />
      </div>
      <div>
        <label className={lbl}>Representante Legal</label>
        <input value={data.representante} onChange={set('representante')}
          placeholder="Nombre completo" className={inp} />
      </div>
      <div>
        <label className={lbl}>Email de contacto</label>
        <input type="email" value={data.email_contacto} onChange={set('email_contacto')}
          placeholder="gerencia@empresa.com" className={inp} />
      </div>
      <div>
        <label className={lbl}>Tamaño empresa</label>
        <select value={data.tamano} onChange={set('tamano')}
          className={`${inp} [&>option]:bg-[#0F1929]`}>
          <option value="">Seleccionar</option>
          {TAMANOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>
    </div>,

    // Step 1 — Zona
    <div key="s1" className="space-y-4">
      <div>
        <label className={lbl}>Departamento principal</label>
        <select value={data.departamento} onChange={set('departamento')}
          className={`${inp} [&>option]:bg-[#0F1929]`}>
          <option value="">Seleccionar</option>
          {DEPARTAMENTOS.map(d => <option key={d.code} value={d.name}>{d.name}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>Ciudad / Municipio</label>
        <input value={data.ciudad} onChange={set('ciudad')} placeholder="Cali" className={inp} />
      </div>
      <p className="text-stone-600 text-xs mt-2">
        La IA priorizará procesos de este departamento. Igual verás procesos de todo el país,
        pero los de tu zona tendrán mayor relevancia.
      </p>
    </div>,

    // Step 2 — Actividad
    <div key="s2" className="space-y-4">
      <div>
        <label className={lbl}>Sector principal *</label>
        <select value={data.sector} onChange={set('sector')}
          className={`${inp} [&>option]:bg-[#0F1929]`}>
          <option value="">Seleccionar</option>
          {SECTORES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className={lbl}>Códigos UNSPSC (mínimo 1) *</label>
        <p className="text-stone-600 text-xs mb-2">
          Define qué contratos son relevantes para tu empresa.
          Ej: 81111500 = Software, 43232600 = Hardware
        </p>
        <div className="flex gap-2 mb-2">
          <input value={unspscInput} onChange={e => setUnspscInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addUnspsc(); } }}
            placeholder="ej: 81111500" inputMode="numeric" className={`${inp} flex-1`} />
          <button type="button" onClick={addUnspsc}
            className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20
              text-emerald-400 rounded-xl hover:bg-emerald-500/15 transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {data.unspsc_codes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.unspsc_codes.map(c => (
              <span key={c} className="flex items-center gap-1 text-xs bg-emerald-500/10
                text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20">
                {c}
                <button type="button"
                  onClick={() => setData(p => ({ ...p, unspsc_codes: p.unspsc_codes.filter(x => x !== c) }))}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className={lbl}>Excluir de búsquedas (palabras negativas)</label>
        <div className="flex gap-2 mb-2">
          <input value={negInput} onChange={e => setNegInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addNeg())}
            placeholder="ej: vigilancia, aseo, cafetería" className={`${inp} flex-1`} />
          <button type="button" onClick={addNeg}
            className="px-3 py-2 bg-red-500/10 border border-red-500/20 text-red-400
              rounded-xl hover:bg-red-500/15 transition-colors text-xs">
            Excluir
          </button>
        </div>
        {data.palabras_negativas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.palabras_negativas.map(w => (
              <span key={w} className="flex items-center gap-1 text-xs bg-red-500/8
                border border-red-500/15 text-red-400 px-2 py-0.5 rounded-full">
                🚫 {w}
                <button onClick={() => setData(p => ({ ...p, palabras_negativas: p.palabras_negativas.filter(x => x !== w) }))}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>,

    // Step 3 — Capacidad
    <div key="s3" className="space-y-4">
      <div>
        <label className={lbl}>Capacidad K (en SMMLV)</label>
        <p className="text-stone-600 text-xs mb-2">
          SMMLV 2026 = $1.423.500 COP. Si tu K total es $2.000M, escribe 1405 (≈ $2.000M / $1.423.500).
        </p>
        <input type="number" min="0" value={data.capacidad_k} onChange={set('capacidad_k')}
          placeholder="ej: 1405" className={inp} />
      </div>
      <div>
        <label className={lbl}>Presupuesto mínimo de interés (COP)</label>
        <p className="text-stone-600 text-xs mb-2">
          No se mostrarán contratos por debajo de este valor.
        </p>
        <input type="number" min="0" value={data.presupuesto_min_interes}
          onChange={set('presupuesto_min_interes')}
          placeholder="ej: 50000000 (= $50 millones)" className={inp} />
      </div>
      <div>
        <label className={lbl}>Años de experiencia en contratación pública</label>
        <input type="number" min="0" max="50" value={data.experiencia_anos}
          onChange={set('experiencia_anos')} placeholder="ej: 5" className={inp} />
      </div>
    </div>,

    // Step 4 — Done
    <div key="s4" className="text-center py-8">
      <div className="w-16 h-16 bg-emerald-500/15 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
      </div>
      <h3 className="text-white font-bold text-xl mb-2">¡Perfil configurado!</h3>
      <p className="text-stone-400 text-sm mb-6 max-w-xs mx-auto">
        La IA ya puede usar tu perfil para mostrar procesos más relevantes y evaluar pliegos con mayor precisión.
      </p>
      <div className="flex flex-col gap-2 max-w-xs mx-auto">
        <button onClick={() => navigate('/buscar')}
          className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-400
            text-white font-semibold rounded-xl hover:opacity-90 transition-opacity text-sm">
          Buscar licitaciones →
        </button>
        <button onClick={() => navigate('/dashboard/documentos')}
          className="w-full py-2.5 bg-white/5 border border-white/8 text-stone-300
            rounded-xl hover:bg-white/8 transition-colors text-sm">
          Subir documentos (RUP, financieros)
        </button>
      </div>
    </div>,
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-white font-bold text-2xl mb-1">Configura tu perfil de empresa</h1>
        <p className="text-stone-500 text-sm">
          La IA necesita conocer tu empresa para mostrarte los contratos correctos.
        </p>
      </div>

      {/* Step indicators */}
      {step < 4 && (
        <div className="flex items-center gap-1 mb-8">
          {STEPS.slice(0, 4).map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done   = i < step;
            return (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg transition-all
                  ${active ? 'bg-emerald-500/15 text-white' : done ? 'text-emerald-500' : 'text-stone-700'}`}>
                  {done
                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    : <Icon className="w-3.5 h-3.5 shrink-0" />}
                  <span className="text-xs font-medium hidden sm:inline">{s.title}</span>
                </div>
                {i < 3 && <div className={`flex-1 h-px ${i < step ? 'bg-emerald-500/30' : 'bg-white/8'}`} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Step content */}
      <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-6 mb-6">
        {step < 4 && (
          <div className="mb-5">
            <h2 className="text-white font-semibold">{STEPS[step].title}</h2>
            <p className="text-stone-500 text-xs mt-0.5">{STEPS[step].sub}</p>
          </div>
        )}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.18 }}
          >
            {stepContent[step]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Error */}
      {error && (
        <p className="text-red-400 text-xs mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
          {error}
        </p>
      )}

      {/* Navigation */}
      {step < 4 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/dashboard')}
            className="flex items-center gap-1.5 text-stone-500 hover:text-stone-300 text-sm transition-colors">
            <ChevronLeft className="w-4 h-4" /> {step === 0 ? 'Cancelar' : 'Anterior'}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canNext()}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400
                text-white font-semibold px-5 py-2.5 rounded-xl hover:opacity-90
                disabled:opacity-40 disabled:cursor-not-allowed transition-all text-sm">
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-teal-400
                text-white font-semibold px-5 py-2.5 rounded-xl hover:opacity-90
                disabled:opacity-40 transition-all text-sm">
              {saving
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando</>
                : <><CheckCircle2 className="w-4 h-4" /> Guardar perfil</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
