/**
 * ExternalProcessPage — Sprint 10B: Add a SECOP II process manually.
 *
 * Solves the SODA lag problem: processes published today won't appear in
 * datos.gov.co for 2-7 days.  This page lets the user:
 *   1. Paste the URL or full text from the SECOP II process page
 *   2. Claude extracts all metadata automatically
 *   3. User confirms / edits the extracted data
 *   4. Uploads the ZIP with documents from SECOP II
 *   5. Gets full AI evaluation + pre-filled cotización in ~15 minutes
 *
 * The resulting proceso_id (EXT-XXXXXXXX) can be used anywhere in the
 * dashboard just like a SODA-sourced process ID.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FileText, Loader2, Check, AlertCircle, ChevronRight,
  Clock, Zap, Upload, Bot, ExternalLink, Info,
} from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Deadline countdown helper ─────────────────────────────────────────────

function DeadlineCountdown({ fechaCierre }: { fechaCierre?: string }) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState('text-stone-500');

  useEffect(() => {
    if (!fechaCierre) return;
    const update = () => {
      const diff = new Date(fechaCierre).getTime() - Date.now();
      if (diff < 0) { setLabel('Plazo vencido'); setColor('text-stone-500'); return; }
      const days  = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins  = Math.floor((diff % 3600000)  / 60000);
      if (days > 3)  { setLabel(`${days}d ${hours}h para el cierre`);     setColor('text-emerald-400'); }
      else if (days >= 1) { setLabel(`⚠️ ${days}d ${hours}h — urgente`);  setColor('text-amber-400'); }
      else           { setLabel(`🔴 ${hours}h ${mins}min — CRÍTICO`);     setColor('text-red-400'); }
    };
    update();
    const id = setInterval(update, 60000);
    return () => clearInterval(id);
  }, [fechaCierre]);

  if (!fechaCierre || !label) return null;
  return (
    <span className={`text-xs font-semibold flex items-center gap-1 ${color}`}>
      <Clock className="w-3.5 h-3.5" />{label}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

type Step = 'input' | 'reviewing' | 'saving' | 'uploading' | 'done';

export function ExternalProcessPage() {
  const navigate   = useNavigate();
  const { isAuthenticated, isPro } = useAuthStore();

  const [step,        setStep]       = useState<Step>('input');
  const [rawInput,    setRawInput]   = useState('');
  const [extracting,  setExtracting] = useState(false);
  const [extracted,   setExtracted]  = useState<Record<string,any> | null>(null);
  const [confidence,  setConfidence] = useState(0);
  const [form,        setForm]       = useState<Record<string,any>>({});
  const [error,       setError]      = useState<string | null>(null);
  const [procesoId,   setProcesoId]  = useState<string | null>(null);
  const [uploading,   setUploading]  = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const token = () => getContractsToken();

  useEffect(() => {
    if (!isAuthenticated) navigate('/auth?redirect=/dashboard/proceso-externo');
  }, [isAuthenticated, navigate]);

  // ── Step 1: Extract from pasted text or URL ─────────────────────────

  const handleExtract = useCallback(async () => {
    const input = rawInput.trim();
    if (!input) return;
    setExtracting(true); setError(null);

    try {
      // Detect URL vs text
      const isUrl = input.startsWith('http') && input.length < 300;
      const endpoint = isUrl ? '/api/v1/external/extract-url' : '/api/v1/external/extract-text';
      const body = isUrl ? { url: input } : { raw_text: input };

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const ext = isUrl ? { url_secop: input, ppi: data.ppi, proceso_numero: data.ppi, confianza: 0.4 }
                        : (data.extracted ?? data);
      setExtracted(ext);
      setConfidence(isUrl ? 0.4 : (ext.confianza ?? 0));
      setForm({
        titulo:       ext.titulo || '',
        entidad:      ext.entidad || '',
        nit_entidad:  ext.nit_entidad || '',
        departamento: ext.departamento || '',
        ciudad:       ext.ciudad || '',
        modalidad:    ext.modalidad || '',
        estado:       ext.estado || 'Publicado',
        precio_base:  ext.precio_base || '',
        unspsc_codes: (ext.unspsc_codes || []).join(', '),
        url_secop:    ext.url_secop || (isUrl ? input : ''),
        fecha_cierre: ext.fecha_cierre || '',
        descripcion:  ext.descripcion || '',
        proceso_numero: ext.proceso_numero || ext.ppi || '',
      });
      setStep('reviewing');
    } catch (err) {
      setError('No se pudo extraer los datos. Revisa el texto e intenta de nuevo.');
    } finally {
      setExtracting(false);
    }
  }, [rawInput]);

  // ── Step 2: Save confirmed data ─────────────────────────────────────

  const handleSave = useCallback(async () => {
    setStep('saving'); setError(null);
    try {
      const payload = {
        titulo:       form.titulo,
        entidad:      form.entidad,
        nit_entidad:  form.nit_entidad || null,
        departamento: form.departamento || null,
        ciudad:       form.ciudad || null,
        modalidad:    form.modalidad || null,
        estado:       form.estado || 'Publicado',
        precio_base:  form.precio_base ? parseFloat(String(form.precio_base).replace(/[^0-9.]/g,'')) : null,
        unspsc_codes: form.unspsc_codes
          ? form.unspsc_codes.split(/[\s,;]+/).filter(Boolean)
          : [],
        url_secop:    form.url_secop || null,
        fecha_cierre: form.fecha_cierre || null,
        descripcion:  form.descripcion || null,
        source:       rawInput.startsWith('http') ? 'url' : 'paste',
        raw_input:    rawInput,
        extraction_json: extracted,
      };
      const res = await fetch(`${API_BASE}/api/v1/external/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const proc = await res.json();
      setProcesoId(proc.proceso_id);
      setStep('uploading');
    } catch (err) {
      setError('Error guardando el proceso. Intenta de nuevo.');
      setStep('reviewing');
    }
  }, [form, rawInput, extracted]);

  // ── Step 3: Upload ZIP ──────────────────────────────────────────────

  const handleUpload = async (file: File) => {
    if (!procesoId) return;
    setUploading(true); setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/api/v1/workspace/${procesoId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token()}` },
        body: form,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStep('done');
    } catch (err) {
      setError('Error subiendo el ZIP. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));

  const inputCls = `w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm
    text-white placeholder-stone-600 focus:outline-none focus:border-emerald-500/40`;

  // ── Render ────────────────────────────────────────────────────────────

  if (!isPro) {
    return (
      <div className="max-w-lg text-center py-16">
        <Zap className="w-10 h-10 text-emerald-400 mx-auto mb-4" />
        <h2 className="text-white font-bold text-lg mb-2">Función PRO</h2>
        <Link to="/checkout"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-400
            text-white font-semibold px-6 py-3 rounded-xl text-sm hover:opacity-90">
          Activar PRO — $149.000/mes
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
          <FileText className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-white font-bold text-xl">Agregar proceso manualmente</h1>
          <p className="text-stone-500 text-sm">
            Para procesos recientes que aún no están en nuestro buscador
          </p>
        </div>
      </div>

      {/* Why this page exists */}
      <div className="mb-5 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl
        flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-stone-400">
          La API de datos.gov.co tiene un retraso de 2-7 días. Si ves un proceso en SECOP II
          con deadline próximo, puedes agregarlo aquí y usar toda la IA del sistema
          (evaluación, cotización, propuesta) sin esperar a que llegue a nuestro buscador.
        </p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-400
          bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />{error}
        </div>
      )}

      {/* ── Step 1: Input ── */}
      {step === 'input' && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
          <h2 className="text-stone-300 font-semibold text-sm mb-4">
            Paso 1: Pega la URL o el texto del proceso
          </h2>

          <div className="space-y-3 mb-5">
            <p className="text-xs text-stone-500">
              <strong className="text-stone-300">Opción A (rápido):</strong> Pega la URL de SECOP II
            </p>
            <p className="text-xs text-stone-400 font-mono bg-white/5 px-3 py-2 rounded-lg break-all">
              https://community.secop.gov.co/Public/Tendering/ContractNoticePhases/View?PPI=CO1.PPI.51015553...
            </p>
            <p className="text-xs text-stone-500">
              <strong className="text-stone-300">Opción B (más datos):</strong> En la página de SECOP II, 
              presiona Ctrl+A (seleccionar todo) → Ctrl+C → pega aquí. La IA extrae todos los campos.
            </p>
          </div>

          <textarea
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            rows={8}
            placeholder="Pega aquí la URL de SECOP II o el texto completo de la página del proceso..."
            className={`${inputCls} resize-none font-mono text-xs`}
          />

          <div className="flex items-center justify-between mt-4">
            <Link to="/buscar"
              className="text-xs text-stone-500 hover:text-stone-300 flex items-center gap-1">
              ← Volver al buscador
            </Link>
            <button onClick={handleExtract} disabled={!rawInput.trim() || extracting}
              className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400
                text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed">
              {extracting
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Extrayendo con IA…</>
                : <><Bot className="w-4 h-4" /> Extraer datos</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Review extracted data ── */}
      {(step === 'reviewing' || step === 'saving') && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-stone-300 font-semibold text-sm">
              Paso 2: Revisa los datos extraídos
            </h2>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                confidence >= 0.8 ? 'bg-emerald-500/10 text-emerald-400'
                : confidence >= 0.5 ? 'bg-amber-500/10 text-amber-400'
                : 'bg-stone-500/10 text-stone-400'}`}>
                Confianza: {Math.round(confidence * 100)}%
              </span>
              <DeadlineCountdown fechaCierre={form.fecha_cierre} />
            </div>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-stone-500 mb-1">Título del proceso *</label>
                <input type="text" value={form.titulo || ''} onChange={f('titulo')}
                  placeholder="Título completo" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Entidad *</label>
                <input type="text" value={form.entidad || ''} onChange={f('entidad')}
                  placeholder="Nombre de la entidad" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Número del proceso</label>
                <input type="text" value={form.proceso_numero || ''} onChange={f('proceso_numero')}
                  placeholder="EC-0702026" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">
                  ⏰ Fecha límite cierre
                  {form.fecha_cierre && (
                    <span className="ml-1 text-amber-400">← editar si es incorrecto</span>
                  )}
                </label>
                <input type="text" value={form.fecha_cierre || ''} onChange={f('fecha_cierre')}
                  placeholder="2026-11-10T12:00:00-05:00" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Presupuesto (COP)</label>
                <input type="text" value={form.precio_base || ''} onChange={f('precio_base')}
                  placeholder="Sin información" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Código(s) UNSPSC</label>
                <input type="text" value={form.unspsc_codes || ''} onChange={f('unspsc_codes')}
                  placeholder="81111500, 81111800" className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Modalidad</label>
                <input type="text" value={form.modalidad || ''} onChange={f('modalidad')}
                  placeholder="Solicitud de información..." className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Departamento / Ciudad</label>
                <input type="text" value={form.departamento || ''} onChange={f('departamento')}
                  placeholder="Bogotá D.C." className={inputCls} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-stone-500 mb-1">Descripción del objeto</label>
                <textarea value={form.descripcion || ''} onChange={f('descripcion')} rows={3}
                  placeholder="Descripción del objeto del contrato..." className={`${inputCls} resize-none`} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-5">
            <button onClick={() => setStep('input')}
              className="px-4 py-2 text-sm text-stone-400 border border-white/10 rounded-xl
                hover:text-white hover:bg-white/5 transition-colors">
              ← Volver
            </button>
            <button onClick={handleSave} disabled={!form.titulo || !form.entidad || step === 'saving'}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-500
                hover:bg-emerald-400 text-white font-semibold py-2.5 rounded-xl text-sm
                transition-colors disabled:opacity-50">
              {step === 'saving'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</>
                : <><Check className="w-4 h-4" /> Confirmar y continuar</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Upload ZIP ── */}
      {(step === 'uploading' || step === 'done') && procesoId && (
        <div className="bg-white/[0.02] border border-white/8 rounded-2xl p-5">
          {step === 'uploading' && (
            <>
              <h2 className="text-stone-300 font-semibold text-sm mb-4">
                Paso 3: Sube el ZIP de documentos del proceso
              </h2>
              <div className="mb-4 p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl text-xs text-stone-400">
                <p className="font-medium text-stone-300 mb-1">¿Cómo descargar el ZIP de SECOP II?</p>
                <ol className="list-decimal list-outside pl-4 space-y-0.5">
                  <li>Abre la página del proceso en SECOP II</li>
                  <li>Ve a la pestaña <strong className="text-stone-300">Documentos</strong></li>
                  <li>Click en el botón <strong className="text-stone-300">Descargar</strong> de cada archivo,
                    o busca "Descargar todos"</li>
                  <li>Sube el .zip aquí ↓</li>
                </ol>
              </div>
              <button onClick={() => fileRef.current?.click()} disabled={uploading}
                className="w-full border-2 border-dashed border-white/15 rounded-xl p-8
                  text-center hover:border-emerald-500/30 transition-colors cursor-pointer">
                {uploading
                  ? <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mx-auto" />
                  : <Upload className="w-8 h-8 text-stone-600 mx-auto mb-2" />}
                <p className="text-stone-400 text-sm mt-2">
                  {uploading ? 'Procesando…' : 'Click o arrastra el .zip aquí'}
                </p>
              </button>
              <input ref={fileRef} type="file" accept=".zip" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />

              <div className="mt-4 text-center">
                <button onClick={() => navigate(`/dashboard/workspace/${procesoId}`)}
                  className="text-xs text-stone-500 hover:text-emerald-400 flex items-center gap-1 mx-auto">
                  Saltar subida de ZIP → ir al workspace
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          {step === 'done' && (
            <div className="text-center py-4">
              <Check className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
              <p className="text-white font-semibold text-lg mb-1">¡Proceso listo!</p>
              <p className="text-stone-400 text-sm mb-5">
                Los documentos están siendo procesados. En 30-60 segundos
                tendrás la cotización pre-llenada y la evaluación IA disponibles.
              </p>
              <button onClick={() => navigate(`/dashboard/workspace/${procesoId}`)}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400
                  text-white font-semibold px-6 py-3 rounded-xl text-sm mx-auto">
                <FileText className="w-4 h-4" />
                Ir al workspace →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ID info */}
      {procesoId && (
        <p className="text-xs text-stone-600 mt-3 text-center">
          ID del proceso: <span className="font-mono text-stone-500">{procesoId}</span>
        </p>
      )}
    </div>
  );
}
