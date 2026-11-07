import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CONSENT_KEY = 'contracts_cookie_consent';
const CONSENT_VERSION = '1.0'; // bump to re-show banner after policy changes

export type ConsentLevel = 'all' | 'essential';

export interface CookieConsent {
  level: ConsentLevel;
  version: string;
  timestamp: string;
}

export function getStoredConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed: CookieConsent = JSON.parse(raw);
    if (parsed.version !== CONSENT_VERSION) return null; // policy changed
    return parsed;
  } catch {
    return null;
  }
}

export function storeConsent(level: ConsentLevel): void {
  const consent: CookieConsent = {
    level,
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem(CONSENT_KEY, JSON.stringify(consent));
}

interface CookieConsentBannerProps {
  onAccept: (level: ConsentLevel) => void;
}

export function CookieConsentBanner({ onAccept }: CookieConsentBannerProps) {
  const [showDetails, setShowDetails] = useState(false);

  const handleAccept = (level: ConsentLevel) => {
    storeConsent(level);
    onAccept(level);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-xl bg-[#0F1929] border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-5 pb-0">
          <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-white font-semibold text-base leading-snug">
              Tu privacidad importa
            </h2>
            <p className="text-stone-400 text-sm mt-1 leading-relaxed">
              Usamos cookies esenciales para que el sitio funcione, y cookies
              analíticas para mejorar la experiencia. Puedes elegir qué aceptar.
            </p>
          </div>
        </div>

        {/* Expandable details */}
        <div className="px-5 mt-3">
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-300 transition-colors"
          >
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showDetails ? 'Ocultar detalle' : 'Ver qué cookies usamos'}
          </button>

          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2 text-xs text-stone-400">
                  <div className="flex gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-stone-200 font-medium">Esenciales</p>
                      <p className="text-stone-500 mt-0.5">Sesión, autenticación y contador de búsquedas gratuitas. No se pueden desactivar.</p>
                    </div>
                  </div>
                  <div className="flex gap-3 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-stone-200 font-medium">Analíticas (opcionales)</p>
                      <p className="text-stone-500 mt-0.5">Google Analytics — estadísticas de uso anónimas para mejorar el servicio.</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Legal reference */}
        <p className="px-5 mt-3 text-[11px] text-stone-600 leading-relaxed">
          De acuerdo con la Ley 1581 de 2012 (Colombia) y la Circular SIC 02/2015.
          Consulta nuestra{' '}
          <Link
            to="/privacidad"
            className="text-emerald-600 hover:text-emerald-400 underline"
          >
            Política de Privacidad
          </Link>{' '}
          y{' '}
          <Link
            to="/cookies"
            className="text-emerald-600 hover:text-emerald-400 underline"
          >
            Política de Cookies
          </Link>.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 p-5 pt-4">
          <button
            onClick={() => handleAccept('essential')}
            className="flex-1 px-4 py-2.5 border border-white/10 text-stone-300 hover:text-white
              hover:border-white/20 rounded-xl text-sm font-medium transition-colors text-center"
          >
            Solo esenciales
          </button>
          <button
            onClick={() => handleAccept('all')}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400
              text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity text-center"
          >
            Aceptar todas
          </button>
        </div>
      </motion.div>
    </div>
  );
}
