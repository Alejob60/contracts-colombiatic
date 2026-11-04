import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Check, Loader2, CreditCard } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { CONTRACTS_PRICING, type BillingCycle } from '@/lib/constants/pricing';
import { BillingToggle } from '@/components/pricing/BillingToggle';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const TENANT   = import.meta.env.VITE_TENANT_ID ?? 'contracts';

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP',
    minimumFractionDigits: 0 }).format(n);
}

function sha256(message: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
    .then(buf => Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0')).join(''));
}

export function CheckoutPage() {
  const navigate   = useNavigate();
  const { user, isAuth } = useAuthStore();
  const [cycle,    setCycle]   = useState<BillingCycle>('MONTHLY');
  const [loading,  setLoading] = useState(false);
  const [error,    setError]   = useState('');

  const price = cycle === 'MONTHLY'
    ? CONTRACTS_PRICING.prices.monthly
    : CONTRACTS_PRICING.prices.yearly;

  const handleCheckout = async () => {
    if (!isAuth) { navigate('/auth'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/payments/wompi/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': TENANT,
          'Authorization': `Bearer ${localStorage.getItem('contracts_token')}`,
        },
        body: JSON.stringify({
          planTier: 'PRO_LICITADOR',
          billingCycle: cycle,
          amountCents: price.copCents,
          currency: 'COP',
          redirectUrl: `${window.location.origin}/checkout/success`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Error iniciando pago');
      // Redirect to Wompi checkout
      const wompiUrl = data.checkoutUrl ?? data.wompiUrl ?? data.url;
      if (wompiUrl) window.location.href = wompiUrl;
      else throw new Error('No se recibió URL de pago');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error con el pago');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-brand-navy pt-20 px-4 pb-16">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-white font-bold text-2xl mb-1">Activar Plan PRO</h1>
          <p className="text-stone-400 text-sm">Búsquedas ilimitadas + evaluador IA</p>
        </div>

        {/* Billing toggle */}
        <div className="flex justify-center mb-6">
          <BillingToggle cycle={cycle} onChange={setCycle} />
        </div>

        {/* Price card */}
        <div className="bg-gradient-to-b from-emerald-500/10 to-transparent border border-emerald-500/20
          rounded-2xl p-6 mb-6">
          <div className="flex items-end gap-2 mb-1">
            <span className="text-4xl font-bold text-white">
              {cycle === 'MONTHLY'
                ? formatCOP(CONTRACTS_PRICING.prices.monthly.cop)
                : formatCOP(CONTRACTS_PRICING.prices.yearly.monthlyEquivalent)}
            </span>
            <span className="text-stone-400 text-sm mb-1">/mes</span>
          </div>
          {cycle === 'YEARLY' && (
            <p className="text-stone-500 text-xs mb-1">
              {formatCOP(CONTRACTS_PRICING.prices.yearly.cop)} facturado anualmente
            </p>
          )}
          <p className="text-emerald-400 text-xs font-medium">
            {cycle === 'YEARLY' ? '💰 Ahorras 20% vs mensual' : 'Cancela cuando quieras'}
          </p>

          <ul className="mt-4 space-y-2">
            {CONTRACTS_PRICING.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-stone-300">
                <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl
            text-red-400 text-sm text-center">
            {error}
          </div>
        )}

        {!isAuth ? (
          <div className="space-y-3">
            <button onClick={() => navigate('/auth')}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white
                font-bold py-4 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              <Zap className="w-5 h-5" />
              Crear cuenta y pagar
            </button>
            <p className="text-stone-600 text-xs text-center">
              ¿Ya tienes cuenta?{' '}
              <button onClick={() => navigate('/auth')} className="text-emerald-600 hover:text-emerald-400 underline">
                Inicia sesión primero
              </button>
            </p>
          </div>
        ) : (
          <button onClick={handleCheckout} disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white
              font-bold py-4 rounded-xl hover:opacity-90 disabled:opacity-50
              transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            {loading ? 'Redirigiendo a Wompi...' : `Pagar ${cycle === 'MONTHLY'
              ? formatCOP(CONTRACTS_PRICING.prices.monthly.cop)
              : formatCOP(CONTRACTS_PRICING.prices.yearly.cop)}`}
          </button>
        )}

        <p className="text-center text-stone-600 text-xs mt-4">
          Pago procesado por Wompi (Bancolombia) · SSL 256-bit
        </p>
      </div>
    </div>
  );
}
