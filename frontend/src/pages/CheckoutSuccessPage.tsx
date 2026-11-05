import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, RotateCcw } from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const WOMPI_PRIVATE_KEY = import.meta.env.VITE_WOMPI_PRIVATE_KEY ?? ''; // not used client-side

type PageStatus = 'loading' | 'success' | 'error';

export function CheckoutSuccessPage() {
  const navigate           = useNavigate();
  const [params]           = useSearchParams();
  const { login, isPro }   = useAuthStore();
  const [status, setStatus] = useState<PageStatus>('loading');
  const [message, setMsg]   = useState('Verificando pago con Wompi...');
  const [retries, setRetries] = useState(0);

  const verify = useCallback(async () => {
    // Wompi sends ?id=TX_ID on redirect
    const txId  = params.get('id') ?? params.get('transaction_id');
    const plan  = params.get('plan') ?? 'pro_licitador';

    if (!txId) {
      setStatus('error');
      setMsg('No se encontró ID de transacción.');
      return;
    }

    const token = getContractsToken();

    try {
      // ── Step 1: Verify transaction via NestJS backend ────────────────
      const verifyRes = await fetch(
        `${API_BASE}/api/wompi/validate-payment?reference=${encodeURIComponent(txId)}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      const verifyData = await verifyRes.json();

      const txStatus = verifyData.status ?? verifyData.data?.status ?? 'UNKNOWN';

      if (!verifyData.approved && txStatus !== 'APPROVED') {
        if (txStatus === 'PENDING' && retries < 5) {
          // Wompi sometimes takes a moment — retry up to 5 times
          setTimeout(() => setRetries(r => r + 1), 2500);
          setMsg(`Esperando confirmación de Wompi... (${retries + 1}/5)`);
          return;
        }
        setStatus('error');
        setMsg(`Pago no aprobado. Estado: ${txStatus}`);
        return;
      }

      // ── Step 2: Activate subscription in backend ──────────────────────
      if (token) {
        try {
          await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          // The webhook should have already activated the plan.
          // Refresh the user profile to get updated planTier.
          const meRes  = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            const user   = meData.data ?? meData;
            // Update store with latest user data
            login(token, '', {
              userId:   user.userId ?? user.user_id ?? '',
              name:     user.name ?? '',
              email:    user.email ?? '',
              role:     user.role ?? 'PRO',
              plan:     user.subscription?.plan ?? user.plan ?? 'PRO_LICITADOR',
              planTier: user.subscription?.plan_tier ?? 'PRO_LICITADOR',
              tenantId: user.tenantId ?? 'contracts',
            });
          }
        } catch { /* non-blocking */ }
      }

      // ── Step 3: Set payment_verified cookie ───────────────────────────
      const isSecure = window.location.protocol === 'https:';
      const secFlag  = isSecure ? '; Secure' : '';
      document.cookie = `payment_verified=1; path=/; max-age=2592000; SameSite=Lax${secFlag}`;

      setStatus('success');
      setMsg('¡Pago exitoso! Tu Plan PRO Licitador está activo.');

      // Auto-redirect to dashboard after 3 seconds
      setTimeout(() => navigate('/dashboard', { replace: true }), 3000);

    } catch (err) {
      console.error('Wompi verification error:', err);
      setStatus('error');
      setMsg('Error verificando el pago. Por favor contacta soporte.');
    }
  }, [params, retries, login, navigate]);

  useEffect(() => { verify(); }, [verify]);

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      <div className="text-center max-w-sm w-full">
        {status === 'loading' && (
          <>
            <Loader2 className="w-14 h-14 text-emerald-400 mx-auto mb-4 animate-spin" />
            <p className="text-white font-semibold text-lg mb-2">Verificando pago</p>
            <p className="text-stone-400 text-sm">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <p className="text-white font-bold text-2xl mb-2">¡Plan PRO activo!</p>
            <p className="text-stone-400 text-sm mb-4">{message}</p>
            <p className="text-stone-600 text-xs">Redirigiendo al dashboard en 3 segundos...</p>
            <button onClick={() => navigate('/dashboard', { replace: true })}
              className="mt-4 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400
                text-white font-semibold rounded-xl text-sm hover:opacity-90 transition-opacity">
              Ir al Dashboard →
            </button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <p className="text-white font-semibold text-xl mb-2">Problema con el pago</p>
            <p className="text-stone-400 text-sm mb-6">{message}</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => { setStatus('loading'); setRetries(0); verify(); }}
                className="flex items-center gap-2 px-4 py-2.5 border border-white/10 text-stone-300
                  hover:text-white rounded-xl text-sm transition-colors">
                <RotateCcw className="w-4 h-4" />
                Reintentar
              </button>
              <button onClick={() => navigate('/pricing')}
                className="px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400
                  text-white font-semibold rounded-xl text-sm hover:opacity-90">
                Volver a precios
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
