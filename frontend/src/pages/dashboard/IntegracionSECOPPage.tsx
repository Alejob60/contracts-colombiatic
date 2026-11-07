/**
 * IntegracionSECOPPage — Dashboard settings for SECOP II browser integration.
 *
 * Shows all 3 options:
 *   A) Bookmarklet (safest — user's browser relay, no server SECOP requests)
 *   B) Chrome Extension (best UX — automatic, one-time install)
 *   C) Session import (optional — server-side, rate limited)
 *
 * The page explains clearly what each option does and the privacy/legal trade-offs.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Chrome, Bookmark, Shield, Clock, Check,
  Loader2, AlertCircle, ExternalLink, Copy, Info,
  CheckCircle, XCircle,
} from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

// ── Option card ───────────────────────────────────────────────────────────

function OptionCard({ title, badge, icon: Icon, desc, children, legal, recommended }: {
  title: string; badge: string; icon: typeof Bookmark;
  desc: string; children: React.ReactNode; legal: string; recommended?: boolean;
}) {
  return (
    <div className={`bg-white/[0.02] border rounded-2xl p-5 ${
      recommended ? 'border-emerald-500/30' : 'border-white/8'
    }`}>
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-semibold text-sm">{title}</h3>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              badge === 'Más seguro' ? 'bg-emerald-500/15 text-emerald-400' :
              badge === 'Recomendado' ? 'bg-blue-500/15 text-blue-400' :
              'bg-amber-500/15 text-amber-400'
            }`}>{badge}</span>
            {recommended && <span className="text-[10px] text-emerald-500">★ Estándar sugerido</span>}
          </div>
          <p className="text-stone-500 text-xs mt-0.5">{desc}</p>
        </div>
      </div>

      <div className="mb-3 p-2.5 bg-white/[0.02] rounded-xl flex items-start gap-2">
        <Shield className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
        <p className="text-xs text-stone-500">{legal}</p>
      </div>

      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export function IntegracionSECOPPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isPro } = useAuthStore();

  const [bookmarklet,    setBookmarklet]    = useState<string | null>(null);
  const [loadingBm,      setLoadingBm]      = useState(false);
  const [copied,         setCopied]         = useState(false);
  const [sessionStatus,  setSessionStatus]  = useState<{active:boolean; expires_in_minutes?:number} | null>(null);
  const [sessionCookies, setSessionCookies] = useState('');
  const [savingSession,  setSavingSession]  = useState(false);
  const [sessionError,   setSessionError]   = useState<string|null>(null);

  useEffect(() => {
    if (!isAuthenticated) { navigate('/auth'); return; }
    // Check session status
    const token = getContractsToken();
    fetch(`${API_BASE}/api/v1/browser/session/status`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : null).then(d => d && setSessionStatus(d)).catch(() => {});
  }, [isAuthenticated, navigate]);

  const generateBookmarklet = async () => {
    setLoadingBm(true);
    try {
      const token = getContractsToken();
      const res = await fetch(`${API_BASE}/api/v1/browser/bookmarklet.js`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setBookmarklet(d.bookmarklet_js);
      }
    } finally {
      setLoadingBm(false);
    }
  };

  const copyBookmarklet = () => {
    if (!bookmarklet) return;
    const code = `javascript:${encodeURIComponent(bookmarklet)}`;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveSession = async () => {
    if (!sessionCookies.trim()) return;
    setSavingSession(true); setSessionError(null);
    try {
      const token = getContractsToken();
      const res = await fetch(`${API_BASE}/api/v1/browser/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ cookies: sessionCookies }),
      });
      const d = await res.json();
      if (res.ok) {
        setSessionStatus({ active: true, expires_in_minutes: d.expires_in_minutes });
        setSessionCookies('');
      } else {
        setSessionError(d.detail ?? 'Error al validar la sesión');
      }
    } catch {
      setSessionError('Error de conexión');
    } finally {
      setSavingSession(false);
    }
  };

  const revokeSession = async () => {
    const token = getContractsToken();
    await fetch(`${API_BASE}/api/v1/browser/session`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setSessionStatus({ active: false });
  };

  if (!isPro) {
    return (
      <div className="max-w-lg text-center py-16">
        <Zap className="w-10 h-10 text-emerald-400 mx-auto mb-4" />
        <p className="text-white font-semibold mb-4">Función disponible en Plan PRO</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center">
          <Zap className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-white font-bold text-xl">Integración SECOP II</h1>
          <p className="text-stone-500 text-sm">
            Importa procesos en tiempo real desde tu navegador
          </p>
        </div>
      </div>

      {/* Legal notice */}
      <div className="mb-5 p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-stone-400">
          Las opciones A y B funcionan <strong className="text-stone-300">desde tu navegador</strong> —
          las solicitudes a SECOP II vienen de tu IP, nunca de nuestros servidores.
          Esto es técnica y legalmente limpio. La opción C hace solicitudes desde nuestro servidor
          y se usa solo para descarga de documentos.
        </p>
      </div>

      <div className="space-y-4">

        {/* ── Option A: Bookmarklet ── */}
        <OptionCard
          title="A — Marcador de navegador (Bookmarklet)"
          badge="Más seguro"
          icon={Bookmark}
          desc="Haz clic en un marcador cuando estés en SECOP II. Funciona en cualquier navegador."
          legal="100% legal. Todas las solicitudes a SECOP II vienen de TU IP. Nuestros servidores nunca tocan SECOP II."
          recommended>

          {!bookmarklet ? (
            <button onClick={generateBookmarklet} disabled={loadingBm}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400
                text-white font-semibold py-2.5 rounded-xl text-sm transition-colors
                disabled:opacity-50">
              {loadingBm
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando…</>
                : <><Bookmark className="w-4 h-4" /> Generar marcador personalizado</>}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-white/5 rounded-xl">
                <p className="text-xs text-stone-400 mb-2 font-semibold">Pasos para instalar:</p>
                <ol className="text-xs text-stone-500 space-y-1.5 list-decimal list-outside pl-4">
                  <li>Copia el código del marcador (botón de abajo)</li>
                  <li>Abre <strong className="text-stone-300">chrome://bookmarks</strong> o barra de marcadores</li>
                  <li>Crea un nuevo marcador: nombre = <em>ColombiaTIC</em>, URL = el código copiado</li>
                  <li>Cuando estés en SECOP II viendo un proceso, haz clic en el marcador</li>
                </ol>
              </div>
              <button onClick={copyBookmarklet}
                className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm
                  font-semibold transition-colors ${
                    copied ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                           : 'bg-white/10 text-white hover:bg-white/15'
                  }`}>
                {copied ? <><Check className="w-4 h-4" /> ¡Copiado!</> : <><Copy className="w-4 h-4" /> Copiar código del marcador</>}
              </button>
            </div>
          )}
        </OptionCard>

        {/* ── Option B: Chrome Extension ── */}
        <OptionCard
          title="B — Extensión de Chrome"
          badge="Recomendado"
          icon={Chrome}
          desc="Instala una vez. El botón aparece automáticamente en SECOP II sin hacer nada.">
          <p className="text-xs text-stone-400 mb-3 leading-relaxed">
            La extensión detecta cuando estás en un proceso de SECOP II y muestra
            el botón <strong className="text-emerald-400">⚡ Importar a ColombiaTIC</strong>
            automáticamente. Misma arquitectura que el marcador — tu IP, no la nuestra.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a
              href="https://github.com/Alejob60/contracts-colombiatic/tree/main/browser-extension"
              target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 text-xs text-stone-300
                border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2.5 rounded-xl
                transition-colors">
              <ExternalLink className="w-3.5 h-3.5" /> Ver código fuente
            </a>
            <button
              onClick={() => alert('La extensión estará en Chrome Web Store próximamente. Por ahora usa el Marcador (opción A) o carga la extensión manualmente desde el repo.')}
              className="flex items-center justify-center gap-1.5 text-xs text-emerald-400
                border border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/15
                px-3 py-2.5 rounded-xl transition-colors">
              <Chrome className="w-3.5 h-3.5" /> Instalar extensión
            </button>
          </div>
        </OptionCard>

        {/* ── Option C: Session Import ── */}
        <OptionCard
          title="C — Importar sesión (solo documentos)"
          badge="Cauteloso"
          icon={Shield}
          desc="Pega las cookies de SECOP II. Nuestro servidor las usa SOLO para descargar documentos.">

          <div className="mb-3 p-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl
            flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-400/90">
              Esta opción hace solicitudes desde nuestro servidor. Úsala solo cuando A y B
              no te funcionen. Expira en 2h automáticamente.
            </p>
          </div>

          {sessionStatus?.active ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-emerald-400
                bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5 rounded-xl">
                <CheckCircle className="w-3.5 h-3.5" />
                Sesión activa — expira en {sessionStatus.expires_in_minutes} minutos
              </div>
              <button onClick={revokeSession}
                className="w-full text-xs text-stone-500 hover:text-red-400 border border-white/10
                  hover:border-red-500/20 bg-white/5 hover:bg-red-500/5 px-3 py-2 rounded-xl
                  transition-colors flex items-center justify-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" /> Revocar sesión
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-stone-500">
                Cómo obtener las cookies: F12 → Application → Cookies →
                community.secop.gov.co → selecciona todas y copia.
              </p>
              {sessionError && (
                <p className="text-xs text-red-400">{sessionError}</p>
              )}
              <textarea
                value={sessionCookies}
                onChange={e => setSessionCookies(e.target.value)}
                rows={2}
                placeholder="PublicSessionCookie=abc123; OtherCookie=xyz..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs
                  text-white placeholder-stone-700 focus:outline-none focus:border-amber-500/40
                  font-mono resize-none"
              />
              <button onClick={saveSession} disabled={!sessionCookies.trim() || savingSession}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs
                  font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20
                  hover:bg-amber-500/15 transition-colors disabled:opacity-50">
                {savingSession
                  ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verificando…</>
                  : <><Clock className="w-3.5 h-3.5" /> Guardar sesión (2h)</>}
              </button>
            </div>
          )}
        </OptionCard>

      </div>
    </div>
  );
}
