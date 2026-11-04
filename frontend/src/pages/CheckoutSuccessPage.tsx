import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const TENANT   = import.meta.env.VITE_TENANT_ID ?? 'contracts';

export function CheckoutSuccessPage() {
  const navigate       = useNavigate();
  const [params]       = useSearchParams();
  const { login, user } = useAuthStore();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [msg,    setMsg]    = useState('Verificando pago...');

  useEffect(() => {
    const transactionId = params.get('id') ?? params.get('transaction_id');
    if (!transactionId) { setStatus('error'); setMsg('No se encontró ID de transacción.'); return; }

    const token = localStorage.getItem('contracts_token');
    fetch(`${API_BASE}/api/wompi/validate-payment?transaction_id=${transactionId}`, {
      headers: { 'X-Tenant-ID': TENANT, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.status === 'APPROVED' || data.approved) {
          setStatus('ok');
          setMsg('¡Pago exitoso! Tu Plan PRO Licitador está activo.');
          // Refresh user data with updated plan
          if (token) {
            fetch(`${API_BASE}/api/auth/me`, {
              headers: { Authorization: `Bearer ${token}`, 'X-Tenant-ID': TENANT },
            })
              .then((r) => r.json())
              .then((me) => {
                if (me.user_id || me.userId) {
                  login(token, localStorage.getItem('contracts_refresh') ?? '', {
                    userId: me.user_id ?? me.userId,
                    email: me.email,
                    name: me.name,
                    role: me.role,
                    plan: 'PRO_LICITADOR',
                    tenantId: TENANT,
                  });
                }
              })
              .catch(() => {});
          }
          setTimeout(() => navigate('/dashboard'), 3500);
        } else {
          setStatus('error');
          setMsg(`Pago no aprobado. Estado: ${data.status ?? 'desconocido'}`);
        }
      })
      .catch(() => { setStatus('error'); setMsg('Error verificando el pago.'); });
  }, []);

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center px-4">
      <div className="text-center max-w-sm">
        {status === 'loading' && (
          <>
            <Loader2 className="w-14 h-14 text-emerald-400 mx-auto mb-4 animate-spin" />
            <p className="text-white font-semibold text-lg mb-1">Verificando pago</p>
            <p className="text-stone-400 text-sm">Un momento...</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
            <p className="text-white font-bold text-xl mb-2">¡Plan PRO activo!</p>
            <p className="text-stone-400 text-sm mb-4">{msg}</p>
            <p className="text-stone-600 text-xs">Redirigiendo al dashboard...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="w-14 h-14 text-red-400 mx-auto mb-4" />
            <p className="text-white font-semibold text-lg mb-2">Problema con el pago</p>
            <p className="text-stone-400 text-sm mb-6">{msg}</p>
            <button onClick={() => navigate('/pricing')}
              className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400
                text-white font-semibold rounded-xl text-sm hover:opacity-90">
              Intentar de nuevo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
