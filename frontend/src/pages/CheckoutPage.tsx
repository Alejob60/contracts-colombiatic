import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Zap, Check, Loader2, CreditCard, Lock } from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';
import { CONTRACTS_PRICING, type BillingCycle } from '@/lib/constants/pricing';
import { BillingToggle } from '@/components/pricing/BillingToggle';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isPro, user } = useAuthStore();
  const [cycle,   setCycle]   = useState<BillingCycle>('MONTHLY');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const price = cycle === 'MONTHLY'
    ? CONTRACTS_PRICING.prices.monthly
    : CONTRACTS_PRICING.prices.yearly;

  const handleCheckout = async () => {
    if (!isAuthenticated) {
      navigate('/auth?redirect=/checkout');
      return;
    }
    setError(''); setLoading(true);
    try {
      const token = getContractsToken();
      const params = new URLSearchParams({
        plan:   'pro_licitador',
        email:  user?.email  ?? '',
        name:   user?.name   ?? '',
        userId: user?.userId ?? '',   // enables ORD-{userId}-{ts} reference format
      });
      const res = await fetch(`${API_BASE}/api/wompi/checkout-data?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Error obteniendo datos de pago');

      // Build Wompi hosted checkout URL and redirect
      const wompiParams = new URLSearchParams({
        'public-key':          data['public-key'],
        'currency':            data['currency'],
        'amount-in-cents':     String(data['amount-in-cents']),
        'reference':           data['reference'],
        'signature:integrity': data['signature:integrity'],
        'redirect-url':        data['redirect-url'],
        'customer-email':      data['customer-email'] ?? user?.email ?? '',
      });
      if (user?.name) wompiParams.set('customer-data:full-name', user.name);

      window.location.href = `https://checkout.wompi.co/p/?${wompiParams.toString()}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error con el pago');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-navy pt-20 px-4 pb-16">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-7 h-7 text-emerald-400" />
          </div>
          <h1 className="text-white font-bold text-2xl mb-1">Activar Plan PRO</h1>
          <p className="text-stone-400 text-sm">Búsquedas ilimitadas + evaluador IA + alertas</p>
        </div>

        {isPro && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center">
            <p className="text-emerald-400 font-semibold">✓ Ya tienes el Plan PRO activo</p>
            <button onClick={() => navigate('/dashboard')}
              className="mt-2 text-sm text-stone-400 hover:text-white underline">
              Ir al Dashboard →
            </button>
          </div>
        )}

        <div className="flex justify-center mb-6">
          <BillingToggle cycle={cycle} onChange={setCycle} />
        </div>

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
          <p className="text-emerald-400 text-xs font-medium mb-4">
            {cycle === 'YEARLY' ? '💰 Ahorras 20% vs mensual' : 'Cancela cuando quieras'}
          </p>

          <ul className="space-y-2">
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

        {!isAuthenticated ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-amber-300 text-sm">Necesitas una cuenta para pagar</p>
            </div>
            <button onClick={() => navigate('/auth?redirect=/checkout')}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white
                font-bold py-4 rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
              <Zap className="w-5 h-5" />
              Crear cuenta y pagar
            </button>
            <button onClick={() => navigate('/auth?redirect=/checkout')}
              className="w-full border border-white/10 text-stone-300 hover:text-white
                py-3 rounded-xl text-sm font-medium transition-colors">
              Ya tengo cuenta — Iniciar sesión
            </button>
          </div>
        ) : (
          <button onClick={handleCheckout} disabled={loading || isPro}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white
              font-bold py-4 rounded-xl hover:opacity-90 disabled:opacity-50
              transition-all flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
            {loading ? 'Cargando Wompi...' : `Pagar con Wompi — ${formatCOP(price.cop)}`}
          </button>
        )}

        <p className="text-center text-stone-600 text-xs mt-4">
          Procesado por Wompi (Bancolombia) · SSL 256-bit · Sandbox
        </p>
      </div>
    </div>
  );
}
