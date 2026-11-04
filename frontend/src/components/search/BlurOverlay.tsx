import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight } from 'lucide-react';

interface BlurOverlayProps {
  remainingSearches: number;
  onDismiss?: () => void;
}

export function BlurOverlay({ remainingSearches, onDismiss }: BlurOverlayProps) {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-brand-navy/80 backdrop-blur-sm">
      <div className="bg-brand-card border border-white/10 rounded-2xl p-8 max-w-sm mx-4 text-center shadow-2xl">
        <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-7 h-7 text-emerald-400" />
        </div>
        <h2 className="text-white font-semibold text-xl mb-2">Búsquedas gratuitas agotadas</h2>
        <p className="text-stone-400 text-sm mb-6 leading-relaxed">
          Usaste tus {3 - remainingSearches} búsquedas gratuitas. Regístrate gratis para continuar o
          activa el Plan PRO para acceso ilimitado.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => navigate('/auth')}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white font-semibold
              py-3 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
          >
            Crear cuenta gratis <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => navigate('/pricing')}
            className="w-full border border-white/10 text-stone-300 hover:text-white hover:border-white/20
              py-3 rounded-xl text-sm transition-colors"
          >
            Ver Plan PRO → $149.000/mes
          </button>
          {onDismiss && (
            <button onClick={onDismiss} className="text-stone-600 text-xs hover:text-stone-400 mt-1">
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
