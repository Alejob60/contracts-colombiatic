import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2, RotateCcw } from 'lucide-react';
import { useAuthStore, getContractsToken } from '@/store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

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

      // ── Step 2: Get fresh JWT with updated planTier ───────────────────
      // The old token has planTier: FREE. The refresh endpoint issues a new
      // token that reads planTier from the current DB subscription (PRO_LICITADOR).
      let freshToken = token;
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        try {
          const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (refreshRes.ok) {
            const rd = await refreshRes.json();
            freshToken = rd.token ?? rd.access_token ?? rd.accessToken ?? token;
          }
        } catch { /* non-blocking — stale token still works with role check */ }
      }

      // ── Step 3: Update store with fresh token + PRO status ───────────
      login(freshToken ?? token ?? '', refreshToken ?? '', {
        userId:   useAuthStore.getState().user?.userId ?? '',
        name:     useAuthStore.getState().user?.name ?? '',
        email:    useAuthStore.getState().user?.email ?? '',
        role:     'PRO',
        plan:     'PRO_LICITADOR',
        planTier: 'PRO_LICITADOR',
        tenantId: 'contracts',
      });

      // ── Step 4: Set payment_verified cookie ──────────────────────────
      const isSecure = window.location.protocol === 'https:';
      const secFlag  = isSecure ? '; Secure' : '';
      document.cookie = `payment_verified=1; path=/; max-age=2592000; SameSite=Lax${secFlag}`;

      setStatus('success');
      setMsg('¡Pago exitoso! Tu Plan PRO Licitador está activo.');

      // Auto-redirect to dashboard after 3 seconds
      setTimeout(() => navigate('/dashboard', { replace: true }), 3000);

    } catch (err) {
      if (import.meta.env.DEV) console.error('Wompi verification error:', err);
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
